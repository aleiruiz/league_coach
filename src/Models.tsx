import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { humanizeError, openLogin, ProviderKind, ProviderStatus, testProvider } from "./providers";
import type { ProvidersState } from "./App";

type Test = { state: "running" | "ok" | "error"; text: string };

function Models({ providers }: { providers: ProvidersState }) {
  const { list, loading, error, refresh } = providers;
  const [message, setMessage] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<ProviderKind, Test>>>({});
  const poll = useRef<number | null>(null);
  // Proveedor cuyo login estamos esperando.
  const waitingFor = useRef<ProviderKind | null>(null);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (poll.current !== null) window.clearInterval(poll.current);
    poll.current = null;
    waitingFor.current = null;
  }

  async function login(p: ProviderStatus) {
    try {
      await openLogin(p.kind);
      setMessage(
        `Se abrió una terminal con el login de ${p.label}. Completa el inicio de sesión en tu navegador; la app lo detectará sola.`,
      );
      // Revisa el estado cada 4 s durante un minuto.
      stopPolling();
      waitingFor.current = p.kind;
      let ticks = 0;
      poll.current = window.setInterval(async () => {
        ticks += 1;
        await refresh();
        if (ticks >= 15) stopPolling();
      }, 4000);
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
  }

  async function runTest(p: ProviderStatus) {
    setTests((t) => ({ ...t, [p.kind]: { state: "running", text: "Haciendo una consulta de prueba…" } }));
    try {
      const reply = await testProvider(p.kind);
      setTests((t) => ({ ...t, [p.kind]: { state: "ok", text: `Responde correctamente (“${reply.slice(0, 40)}”).` } }));
    } catch (e) {
      setTests((t) => ({ ...t, [p.kind]: { state: "error", text: humanizeError(String(e)) } }));
    }
  }

  useEffect(() => {
    if (list.some((p) => p.kind === waitingFor.current && p.logged_in)) stopPolling();
  }, [list]);

  return (
    <section>
      <h2>Modelos</h2>
      <p className="muted">
        League Coach usa tus suscripciones a través de los programas oficiales
        (Claude Code y Codex CLI). El inicio de sesión ocurre en la página de
        cada proveedor: la app nunca ve ni guarda tus credenciales.
      </p>
      {loading && list.length === 0 && <p className="muted">Comprobando modelos…</p>}
      {error && <p className="error">No pude comprobar los modelos: {error}</p>}
      <ul className="keys">
        {list.map((p) => {
          const test = tests[p.kind];
          return (
            <li key={p.kind} className="key-row">
              <div className="key-info">
                <strong>{p.label}</strong>
                <span className={p.logged_in ? "badge ok" : "badge"}>
                  {!p.installed ? "No instalado" : p.logged_in ? "Conectado" : "Sin sesión"}
                </span>
              </div>
              <p className="muted small">
                {p.detail}
                {p.version ? ` · ${p.version}` : ""}
              </p>
              {test && (
                <p className={test.state === "error" ? "error small" : "muted small"} role="status">
                  {test.text}
                </p>
              )}
              <div className="key-form">
                {!p.installed && <button onClick={() => openUrl(p.install_url)}>Cómo instalar</button>}
                {p.installed && !p.logged_in && <button onClick={() => login(p)}>Iniciar sesión</button>}
                {p.logged_in && (
                  <button onClick={() => runTest(p)} disabled={test?.state === "running"}>
                    Probar
                  </button>
                )}
                <button className="secondary" onClick={refresh} disabled={loading}>
                  {loading ? "Verificando…" : "Verificar"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

export default Models;
