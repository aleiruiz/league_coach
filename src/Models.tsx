import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { openLogin, providerStatuses, ProviderStatus } from "./providers";

type Props = { onChange?: (statuses: ProviderStatus[]) => void };

function Models({ onChange }: Props) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const s = await providerStatuses();
      setStatuses(s);
      onChange?.(s);
    } catch (e) {
      setMessage(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(p: ProviderStatus) {
    try {
      await openLogin(p.kind);
      setMessage(
        `Se abrió una terminal con el login de ${p.label}. Completa el inicio de sesión en tu navegador y luego pulsa "Verificar".`,
      );
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  return (
    <section>
      <h2>Modelos</h2>
      <p className="muted">
        League Coach usa tus suscripciones a través de los programas oficiales
        (Claude Code y Codex CLI). El inicio de sesión ocurre en la página de
        cada proveedor: la app nunca ve ni guarda tus credenciales.
      </p>
      <ul className="keys">
        {statuses.map((p) => (
          <li key={p.kind} className="key-row">
            <div className="key-info">
              <strong>{p.label}</strong>
              <span className={p.logged_in ? "badge ok" : "badge"}>
                {!p.installed
                  ? "No instalado"
                  : p.logged_in
                    ? "Conectado"
                    : "Sin sesión"}
              </span>
            </div>
            <p className="muted small">
              {p.detail}
              {p.version ? ` · ${p.version}` : ""}
            </p>
            <div className="key-form">
              {!p.installed && (
                <button onClick={() => openUrl(p.install_url)}>Cómo instalar</button>
              )}
              {p.installed && !p.logged_in && (
                <button onClick={() => login(p)}>Iniciar sesión</button>
              )}
              <button className="secondary" onClick={refresh} disabled={loading}>
                {loading ? "Verificando…" : "Verificar"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default Models;
