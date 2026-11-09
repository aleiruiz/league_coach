import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lang, LANGUAGES, t } from "./i18n";

type KeyState = "configured" | "missing" | "error" | "unknown";
type KeyStatus = { provider: string; state: KeyState; error: string | null };

const LABELS: Record<string, { name: string; hint: string }> = {
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-..." },
  openai: { name: "OpenAI", hint: "sk-..." },
  openrouter: { name: "OpenRouter", hint: "sk-or-..." },
  riot: { name: "Riot Games (Personal API key)", hint: "RGAPI-..." },
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

function Settings({ lang, onLanguage }: { lang: Lang; onLanguage: (l: Lang) => Promise<void> }) {
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
            className={lang === l.value ? "chip on" : "chip"}
            onClick={() => {
              if (l.value !== lang) onLanguage(l.value).catch((e) => setMessage(`Error: ${e}`));
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
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
