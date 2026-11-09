import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type KeyState = "configured" | "missing" | "error" | "unknown";
type KeyStatus = { provider: string; state: KeyState; error: string | null };

const LABELS: Record<string, { name: string; hint: string }> = {
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-..." },
  openai: { name: "OpenAI", hint: "sk-..." },
  openrouter: { name: "OpenRouter", hint: "sk-or-..." },
  riot: { name: "Riot Games (Personal API key)", hint: "RGAPI-..." },
};

const BADGE: Record<KeyState, string> = {
  configured: "Configurada",
  missing: "Sin configurar",
  error: "Error al leer",
  unknown: "Desconocido",
};

// Siempre pintamos todos los proveedores, aunque falle la lectura del llavero.
const INITIAL: KeyStatus[] = Object.keys(LABELS).map((provider) => ({
  provider,
  state: "unknown",
  error: null,
}));

function Settings() {
  const [keys, setKeys] = useState<KeyStatus[]>(INITIAL);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      setKeys(await invoke<KeyStatus[]>("list_api_keys"));
    } catch (e) {
      setKeys(INITIAL);
      setMessage(`No pude leer el llavero: ${e}`);
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
      setMessage(`Key de ${name(provider)} guardada.`);
      await refresh();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  async function remove(provider: string) {
    try {
      await invoke("delete_api_key", { provider });
      setMessage(`Key de ${name(provider)} eliminada.`);
      await refresh();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  return (
    <section>
      <h2>Ajustes</h2>
      <p className="muted">
        Las keys se guardan en el llavero de tu sistema operativo, nunca en un
        archivo de la app. Para modelos locales con Ollama no necesitas key.
      </p>
      <ul className="keys">
        {keys.map(({ provider, state, error }) => (
          <li key={provider} className="key-row">
            <div className="key-info">
              <strong>{name(provider)}</strong>
              <span className={state === "configured" ? "badge ok" : "badge"} title={error ?? undefined}>
                {BADGE[state]}
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
                aria-label={`API key de ${name(provider)}`}
                placeholder={LABELS[provider]?.hint ?? "API key"}
                value={drafts[provider] ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setDrafts((d) => ({ ...d, [provider]: value }));
                }}
              />
              <button type="submit" disabled={!drafts[provider]?.trim()}>
                Guardar
              </button>
              {(state === "configured" || state === "error") && (
                <button type="button" className="danger" onClick={() => remove(provider)}>
                  Borrar
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
