import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type KeyStatus = { provider: string; configured: boolean };

const LABELS: Record<string, { name: string; hint: string }> = {
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-..." },
  openai: { name: "OpenAI", hint: "sk-..." },
  openrouter: { name: "OpenRouter", hint: "sk-or-..." },
  riot: { name: "Riot Games (Personal API key)", hint: "RGAPI-..." },
};

function Settings() {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      setKeys(await invoke<KeyStatus[]>("list_api_keys"));
    } catch (e) {
      setMessage(`No pude leer el llavero: ${e}`);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save(provider: string) {
    try {
      await invoke("set_api_key", { provider, key: drafts[provider] ?? "" });
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setMessage(`Key de ${LABELS[provider]?.name ?? provider} guardada.`);
      await refresh();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  async function remove(provider: string) {
    try {
      await invoke("delete_api_key", { provider });
      setMessage(`Key de ${LABELS[provider]?.name ?? provider} eliminada.`);
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
        {keys.map(({ provider, configured }) => (
          <li key={provider} className="key-row">
            <div className="key-info">
              <strong>{LABELS[provider]?.name ?? provider}</strong>
              <span className={configured ? "badge ok" : "badge"}>
                {configured ? "Configurada" : "Sin configurar"}
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
              {configured && (
                <button type="button" className="danger" onClick={() => remove(provider)}>
                  Borrar
                </button>
              )}
            </form>
          </li>
        ))}
      </ul>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default Settings;
