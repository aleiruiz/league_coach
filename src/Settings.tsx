import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Lang, LANGUAGES, t } from "./i18n";
import { Region, riotAccount, riotIdOf, riotIdProblem, saveRiotAccount } from "./history";
import { humanizeError } from "./providers";
import { SummonerSearch } from "./SummonerSearch";

type KeyState = "configured" | "missing" | "error" | "unknown";
type KeyStatus = { provider: string; state: KeyState; error: string | null };

const LABELS: Record<string, { name: string; hint: string }> = {
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-..." },
  openai: { name: "OpenAI", hint: "sk-..." },
  openrouter: { name: "OpenRouter", hint: "sk-or-..." },
  riot: { name: "Riot Games API key", hint: "RGAPI-..." },
};

const badge = (s: KeyState) =>
  ({
    configured: t("Saved", "Configurada"),
    missing: t("Not set", "Sin configurar"),
    error: t("Couldn't read", "Error al leer"),
    unknown: t("Unknown", "Desconocido"),
  })[s];

// Always show every provider, even if reading the keychain fails.
const INITIAL: KeyStatus[] = Object.keys(LABELS).map((provider) => ({
  provider,
  state: "unknown",
  error: null,
}));

/**
 * Riot ID + region (server). In Settings it also explains the API key and the
 * automatic review; the first-run setup shows just the form (`compact`).
 */
export function RiotAccount({ onSaved, compact = false }: { onSaved: () => void; compact?: boolean }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("");
  const [auto, setAuto] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The account as last saved: the auto-review toggle applies to it right away. */
  const [saved, setSaved] = useState<{ riotId: string; region: string } | null>(null);

  useEffect(() => {
    riotAccount()
      .then(({ profile, regions }) => {
        setRegions(regions);
        setRiotId(riotIdOf(profile));
        setRegion(profile.region);
        setAuto(profile.auto_analyze);
        if (riotIdOf(profile) && profile.region) setSaved({ riotId: riotIdOf(profile), region: profile.region });
      })
      .catch((e) => setError(humanizeError(String(e))));
  }, []);

  async function save(id: string, reg: string, autoAnalyze: boolean, done: string) {
    setMessage(null);
    setError(null);
    const problem = riotIdProblem(id);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      const p = await saveRiotAccount(id, reg, autoAnalyze);
      setRiotId(riotIdOf(p));
      setSaved({ riotId: riotIdOf(p), region: p.region });
      setMessage(done);
      onSaved();
    } catch (e) {
      setError(humanizeError(String(e)));
    }
  }

  function toggleAuto(on: boolean) {
    setAuto(on);
    // Applies at once to the saved account; with no account yet, on the first save.
    if (saved)
      save(saved.riotId, saved.region, on, on ? t("Automatic review on.", "Revisión automática activada.") : t("Automatic review off.", "Revisión automática desactivada."));
  }

  return (
    <>
      {!compact && <h3>{t("Riot account", "Cuenta de Riot")}</h3>}
      {!compact && (
      <p className="muted">
        {t(
          "Used only to read your finished games for \"My progress\". It also needs a Riot API key (below): get one at ",
          "Solo se usa para leer tus partidas terminadas en «Mi progreso». También necesita una API key de Riot (abajo): consíguela en ",
        )}
        <button className="link-button" onClick={() => openUrl("https://developer.riotgames.com/")}>
          developer.riotgames.com
        </button>
        {t(
          ". Development keys expire every 24 hours; a Personal API key doesn't.",
          ". Las development keys caducan cada 24 horas; una Personal API key no.",
        )}
      </p>
      )}
      <SummonerSearch
        regions={regions}
        riotId={riotId}
        region={region}
        onChange={(id, reg) => {
          setRiotId(id);
          setRegion(reg);
        }}
        onSubmit={(id, reg) => save(id, reg, auto, t("Riot account saved.", "Cuenta de Riot guardada."))}
        submitLabel={t("Use as my account", "Usar como mi cuenta")}
      />
      {saved && (
        <p className="small">
          {t("Your account:", "Tu cuenta:")} <strong>{saved.riotId}</strong>{" "}
          <span className="muted">
            ({regions.find((r) => r.id === saved.region)?.label ?? saved.region})
          </span>
        </p>
      )}
      <p className="muted small">
        {t(
          "Riot only finds exact Riot IDs (Name#TAG, as in your client profile), so suggestions come from your own past searches. The preview needs your Riot API key.",
          "Riot solo encuentra Riot IDs exactos (Nombre#TAG, como en tu perfil del cliente), así que las sugerencias salen de tus búsquedas anteriores. La vista previa necesita tu API key de Riot.",
        )}
      </p>
      <label className="check">
        <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.currentTarget.checked)} />
        {t(
          "Review new games automatically while the app is open. Each review is one request to your Claude or ChatGPT plan (one per batch of new games, not per minute).",
          "Revisar las partidas nuevas automáticamente mientras la app está abierta. Cada revisión es una consulta a tu plan de Claude o ChatGPT (una por tanda de partidas nuevas, no por minuto).",
        )}
      </label>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function Settings({
  lang,
  onLanguage,
  locked,
  onRiotAccount,
}: {
  lang: Lang;
  onLanguage: (l: Lang) => Promise<void>;
  /** A request is running: the language can't change until it ends. */
  locked: boolean;
  onRiotAccount: () => void;
}) {
  const [keys, setKeys] = useState<KeyStatus[]>(INITIAL);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      setKeys(await invoke<KeyStatus[]>("list_api_keys"));
    } catch (e) {
      setKeys(INITIAL);
      setMessage(t(`Couldn't read the keychain: ${e}`, `No pude leer el llavero: ${e}`));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const name = (p: string) => LABELS[p]?.name ?? p;

  async function save(provider: string) {
    try {
      await invoke("set_api_key", { provider, key: drafts[provider] ?? "" });
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setMessage(t(`${name(provider)} key saved.`, `Key de ${name(provider)} guardada.`));
      await refresh();
      if (provider === "riot") onRiotAccount();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  async function remove(provider: string) {
    try {
      await invoke("delete_api_key", { provider });
      setMessage(t(`${name(provider)} key deleted.`, `Key de ${name(provider)} eliminada.`));
      await refresh();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  return (
    <section>
      <h2>{t("Settings", "Ajustes")}</h2>
      <h3>{t("Language", "Idioma")}</h3>
      <p className="muted">
        {t(
          "Language of the app, of the coach's answers and of champion, item and rune names.",
          "Idioma de la app, de las respuestas del coach y de los nombres de campeones, ítems y runas.",
        )}
      </p>
      <div className="lang-picker" role="radiogroup" aria-label={t("Language", "Idioma")}>
        {LANGUAGES.map((l) => (
          <button
            key={l.value}
            role="radio"
            aria-checked={lang === l.value}
            disabled={locked}
            className={lang === l.value ? "chip on" : "chip"}
            onClick={() => {
              if (l.value !== lang) onLanguage(l.value).catch((e) => setMessage(`Error: ${e}`));
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {locked
          ? t(
              "Wait for the current request to finish (or stop it) to change the language.",
              "Espera a que termine la consulta en curso (o detenla) para cambiar el idioma.",
            )
          : t(
              "Your draft and conversation are kept. A build already shown stays in its language until you ask for another.",
              "Tu draft y tu conversación se conservan. Una build ya mostrada queda en su idioma hasta que pidas otra.",
            )}
      </p>
      <RiotAccount onSaved={onRiotAccount} />
      <h3>{t("API keys (optional)", "API keys (opcional)")}</h3>
      <p className="muted">
        {t(
          "Keys are stored in your operating system's keychain, never in an app file. Local models with Ollama don't need a key.",
          "Las keys se guardan en el llavero de tu sistema operativo, nunca en un archivo de la app. Para modelos locales con Ollama no necesitas key.",
        )}
      </p>
      <ul className="keys">
        {keys.map(({ provider, state, error }) => (
          <li key={provider} className="key-row">
            <div className="key-info">
              <strong>{name(provider)}</strong>
              <span className={state === "configured" ? "badge ok" : "badge"} title={error ?? undefined}>
                {badge(state)}
              </span>
            </div>
            <form
              className="key-form"
              onSubmit={(e) => {
                e.preventDefault();
                save(provider);
              }}
            >
              <input
                type="password"
                autoComplete="off"
                aria-label={t(`${name(provider)} API key`, `API key de ${name(provider)}`)}
                placeholder={LABELS[provider]?.hint ?? "API key"}
                value={drafts[provider] ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setDrafts((d) => ({ ...d, [provider]: value }));
                }}
              />
              <button type="submit" disabled={!drafts[provider]?.trim()}>
                {t("Save", "Guardar")}
              </button>
              {(state === "configured" || state === "error") && (
                <button type="button" className="danger" onClick={() => remove(provider)}>
                  {t("Delete", "Borrar")}
                </button>
              )}
            </form>
          </li>
        ))}
      </ul>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

export default Settings;
