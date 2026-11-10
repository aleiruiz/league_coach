import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Lang, LANGUAGES, t } from "./i18n";
import { Region, riotAccount, riotIdOf, riotIdProblem, saveRiotAccount } from "./history";
import { humanizeError } from "./providers";
import { SummonerSearch } from "./SummonerSearch";
import { YourAI } from "./YourAI";
import type { ProvidersState } from "./App";

type KeyState = "configured" | "missing" | "error" | "unknown";
type KeyStatus = { provider: string; state: KeyState; error: string | null };

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
  /** Settings shows the saved account as one line until "Change" is pressed. */
  const [editing, setEditing] = useState(false);
  const summary = !compact && !editing;

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
      setEditing(false);
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
      {summary && saved ? (
        <div className="account-row">
          <span className="ai-name">
            <strong>{saved.riotId}</strong>
            <span className="muted small">{regions.find((r) => r.id === saved.region)?.label ?? saved.region}</span>
          </span>
          <button type="button" className="secondary small-button" onClick={() => setEditing(true)}>
            {t("Change", "Cambiar")}
          </button>
        </div>
      ) : (
        <>
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
          {!compact && (
            <>
              {" "}
              <button type="button" className="link-button" onClick={() => setEditing(false)}>
                {t("Done", "Listo")}
              </button>
            </>
          )}
        </p>
      )}
      <p className="muted small">
        {t(
          "Riot only finds exact Riot IDs (Name#TAG, as in your client profile), so suggestions come from your own past searches. The preview needs your Riot key.",
          "Riot solo encuentra Riot IDs exactos (Nombre#TAG, como en tu perfil del cliente), así que las sugerencias salen de tus búsquedas anteriores. La vista previa necesita tu key de Riot.",
        )}
      </p>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.currentTarget.checked)} />
        {t(
          "Review new games automatically in Improve while the app is open. Each review is one request to your Claude or ChatGPT plan (one per batch of new games, not per minute).",
          "Revisar las partidas nuevas automáticamente en Mejorar mientras la app está abierta. Cada revisión es una consulta a tu plan de Claude o ChatGPT (una por tanda de partidas nuevas, no por minuto).",
        )}
      </label>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
      {error && <p className="error">{error}</p>}
    </>
  );
}

const KEY_SAVED_AT = "lc.riotKeySavedAt";

function keySavedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY_SAVED_AT));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** How old the saved Riot key is, said in a way that tells you when to replace it. */
export function keyAge(savedAt: number | null, now = Date.now()): { text: string; stale: boolean } | null {
  if (savedAt === null) return null;
  const hours = Math.floor((now - savedAt) / 3_600_000);
  if (hours >= 24)
    return {
      text: t(
        "Saved over a day ago. A development key has expired by now unless it's a Personal key.",
        "Guardada hace más de un día. Una development key ya caducó, salvo que sea una Personal key.",
      ),
      stale: true,
    };
  const left = 24 - hours;
  return {
    text: t(
      `A development key expires in about ${left} h (a Personal key doesn't).`,
      `Una development key caduca en unas ${left} h (una Personal key no).`,
    ),
    stale: false,
  };
}

/** The Riot API key as three steps: open Riot's site, copy the key, paste it. */
function RiotKey({ onSaved }: { onSaved: () => void }) {
  const [state, setState] = useState<KeyState>("unknown");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(keySavedAt);

  async function refresh() {
    try {
      const keys = await invoke<KeyStatus[]>("list_api_keys");
      setState(keys.find((k) => k.provider === "riot")?.state ?? "unknown");
    } catch {
      setState("error");
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    try {
      await invoke("set_api_key", { provider: "riot", key: draft });
      setDraft("");
      const now = Date.now();
      try {
        localStorage.setItem(KEY_SAVED_AT, String(now));
      } catch {
        // Only the age hint is lost.
      }
      setSavedAt(now);
      setMessage(t("Riot key saved.", "Key de Riot guardada."));
      await refresh();
      onSaved();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  async function remove() {
    try {
      await invoke("delete_api_key", { provider: "riot" });
      setMessage(t("Riot key deleted.", "Key de Riot eliminada."));
      await refresh();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  const age = state === "configured" ? keyAge(savedAt) : null;
  return (
    <div className="riot-key">
      <div className="riot-key-head">
        <span className="ai-name">
          <strong>{t("Riot key", "Key de Riot")}</strong>
          <span className="muted small">{t("Lets Improve read your finished games.", "Permite que Mejorar lea tus partidas terminadas.")}</span>
        </span>
        <span className={state === "configured" ? (age?.stale ? "badge warn" : "badge ok") : "badge"}>
          {state === "configured"
            ? age?.stale
              ? t("Probably expired", "Probablemente caducada")
              : t("Saved", "Guardada")
            : state === "error"
              ? t("Couldn't read", "No se pudo leer")
              : t("Not set", "Sin configurar")}
        </span>
      </div>
      {age && <p className={age.stale ? "warn-text small" : "muted small"}>{age.text}</p>}
      <ol className="steps">
        <li>
          <span>{t("Sign in on Riot's developer site", "Inicia sesión en el sitio de desarrolladores de Riot")}</span>
          <button type="button" className="secondary small-button" onClick={() => openUrl("https://developer.riotgames.com/")}>
            {t("Open Riot's site", "Abrir el sitio de Riot")}
          </button>
        </li>
        <li>
          <span>{t("Press “Regenerate API key” and copy it", "Pulsa «Regenerate API key» y cópiala")}</span>
          <span className="muted small">{t("It starts with RGAPI-", "Empieza con RGAPI-")}</span>
        </li>
        <li>
          <label htmlFor="riot-key">{t("Paste it here", "Pégala aquí")}</label>
          <form
            className="key-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              id="riot-key"
              type="password"
              autoComplete="off"
              placeholder="RGAPI-..."
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
            />
            <button type="submit" disabled={!draft.trim()}>
              {t("Save", "Guardar")}
            </button>
          </form>
        </li>
      </ol>
      <p className="muted small">
        {t(
          "Stored in your operating system's keychain, never in an app file.",
          "Se guarda en el llavero de tu sistema operativo, nunca en un archivo de la app.",
        )}{" "}
        {(state === "configured" || state === "error") && (
          <button type="button" className="link-button" onClick={remove}>
            {t("Delete the key", "Borrar la key")}
          </button>
        )}
      </p>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

function Settings({
  lang,
  onLanguage,
  locked,
  onRiotAccount,
  providers,
  active,
}: {
  lang: Lang;
  onLanguage: (l: Lang) => Promise<void>;
  /** A request is running: the language can't change until it ends. */
  locked: boolean;
  onRiotAccount: () => void;
  providers: ProvidersState;
  /** Settings is the screen being shown. */
  active: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [legal, setLegal] = useState(false);

  return (
    <section className="settings">
      <h2>{t("Settings", "Ajustes")}</h2>

      <section className="set-block" aria-labelledby="set-account">
        <h3 id="set-account">{t("Your League account", "Tu cuenta de League")}</h3>
        <RiotAccount onSaved={onRiotAccount} />
        <RiotKey onSaved={onRiotAccount} />
      </section>

      <section className="set-block" aria-labelledby="set-ai">
        <h3 id="set-ai">{t("Your AI", "Tu IA")}</h3>
        <YourAI providers={providers} active={active} lang={lang} />
      </section>

      <section className="set-block set-columns">
        <div>
          <h3>{t("Language", "Idioma")}</h3>
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
                  "For the app, the coach's answers and champion, item and rune names.",
                  "Para la app, las respuestas del coach y los nombres de campeones, ítems y runas.",
                )}
          </p>
          <p className="message" role="status" aria-live="polite">
            {message}
          </p>
        </div>
        <div>
          <h3>{t("About", "Acerca de")}</h3>
          <button type="button" className="link-button" aria-expanded={legal} onClick={() => setLegal((v) => !v)}>
            {t("Legal notice and how your data is used", "Aviso legal y cómo se usan tus datos")}
          </button>
          {legal && (
            <div className="about-text small">
              <p>
                {t(
                  "Everything stays on this computer. Your questions go to Claude or ChatGPT through their official apps, signed in with your own account; League Coach never sees your credentials. Your Riot key is kept in your system's keychain and is only sent to Riot. Champion select is read from the League client on this computer, and only when you press “Fill from my game”.",
                  "Todo se queda en esta computadora. Tus preguntas van a Claude o ChatGPT a través de sus apps oficiales, con tu propia cuenta; League Coach nunca ve tus credenciales. Tu key de Riot se guarda en el llavero del sistema y solo se envía a Riot. La selección de campeones se lee del cliente de League en esta computadora, y solo cuando pulsas «Rellenar con mi partida».",
                )}
              </p>
              <LegalNotice lang={lang} />
            </div>
          )}
          <OldKeys />
        </div>
      </section>
    </section>
  );
}

/** API keys earlier versions could save; nothing reads them anymore. */
export const OLD_KEYS = ["anthropic", "openai", "openrouter"];

/**
 * Earlier versions let you save Anthropic, OpenAI and OpenRouter keys. They are
 * unused now; shown only while one is still in the keychain, so it can be removed.
 */
function OldKeys() {
  const [left, setLeft] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    try {
      const keys = await invoke<KeyStatus[]>("list_api_keys");
      setLeft(keys.filter((k) => OLD_KEYS.includes(k.provider) && k.state === "configured").map((k) => k.provider));
    } catch {
      setLeft([]);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function removeAll() {
    try {
      for (const provider of left) await invoke("delete_api_key", { provider });
      setMessage(t("Old API keys deleted.", "API keys antiguas eliminadas."));
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
    await refresh();
  }
  if (left.length === 0) return message ? <p className="muted small">{message}</p> : null;
  return (
    <p className="muted small">
      {t(
        "An earlier version saved API keys this app no longer uses.",
        "Una versión anterior guardó API keys que la app ya no usa.",
      )}{" "}
      <button type="button" className="link-button" onClick={removeAll}>
        {t("Delete old API keys", "Eliminar API keys antiguas")}
      </button>
    </p>
  );
}

/** Riot's required notice for apps that use its data. */
export function LegalNotice({ lang }: { lang: Lang }) {
  return (
    <p className="legal">
      League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
      anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
      associated properties are trademarks or registered trademarks of Riot Games, Inc.
      {lang === "es" && (
        <>
          <br />
          League Coach no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de
          nadie involucrado oficialmente en producir o gestionar sus propiedades. Riot Games y todas sus
          propiedades asociadas son marcas comerciales o registradas de Riot Games, Inc.
        </>
      )}
    </p>
  );
}

export default Settings;
