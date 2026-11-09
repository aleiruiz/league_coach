import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { humanizeError, openLogin, ProviderKind, ProviderStatus, testProvider } from "./providers";
import type { ProvidersState } from "./App";
import { t } from "./i18n";

type Test = { state: "running" | "ok" | "error"; text: string };

/** Status, sign-in and test for each AI CLI (used by Models and the first-run setup). */
export function ProviderSetup({ providers }: { providers: ProvidersState }) {
  const { list, loading, error, refresh } = providers;
  const [message, setMessage] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<ProviderKind, Test>>>({});
  const poll = useRef<number | null>(null);
  // Provider whose sign-in we are waiting for.
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
        t(
          `A terminal opened with the ${p.label} sign-in. Finish signing in in your browser; the app will notice on its own.`,
          `Se abrió una terminal con el login de ${p.label}. Completa el inicio de sesión en tu navegador; la app lo detectará sola.`,
        ),
      );
      // Checks the status every 4 s for a minute.
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
    setTests((s) => ({
      ...s,
      [p.kind]: { state: "running", text: t("Sending a test request…", "Haciendo una consulta de prueba…") },
    }));
    try {
      const reply = await testProvider(p.kind);
      const short = reply.slice(0, 40);
      setTests((s) => ({
        ...s,
        [p.kind]: { state: "ok", text: t(`It answers correctly (“${short}”).`, `Responde correctamente (“${short}”).`) },
      }));
    } catch (e) {
      setTests((s) => ({ ...s, [p.kind]: { state: "error", text: humanizeError(String(e)) } }));
    }
  }

  useEffect(() => {
    if (list.some((p) => p.kind === waitingFor.current && p.logged_in)) stopPolling();
  }, [list]);

  return (
    <>
      {loading && list.length === 0 && <p className="muted">{t("Checking models…", "Comprobando modelos…")}</p>}
      {error && (
        <p className="error">
          {t("Couldn't check the models:", "No pude comprobar los modelos:")} {error}
        </p>
      )}
      <ul className="keys">
        {list.map((p) => {
          const test = tests[p.kind];
          return (
            <li key={p.kind} className="key-row">
              <div className="key-info">
                <strong>{p.label}</strong>
                <span className={p.logged_in ? "badge ok" : "badge"}>
                  {!p.installed
                    ? t("Not installed", "No instalado")
                    : p.logged_in
                      ? t("Connected", "Conectado")
                      : t("Signed out", "Sin sesión")}
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
                {!p.installed && <button onClick={() => openUrl(p.install_url)}>{t("How to install", "Cómo instalar")}</button>}
                {p.installed && !p.logged_in && <button onClick={() => login(p)}>{t("Sign in", "Iniciar sesión")}</button>}
                {p.logged_in && (
                  <button onClick={() => runTest(p)} disabled={test?.state === "running"}>
                    {t("Test", "Probar")}
                  </button>
                )}
                <button className="secondary" onClick={refresh} disabled={loading}>
                  {loading ? t("Checking…", "Verificando…") : t("Check", "Verificar")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}

export const modelsIntro = () =>
  t(
    "League Coach uses your subscriptions through the official programs (Claude Code and Codex CLI). Sign-in happens on each provider's page: the app never sees or stores your credentials.",
    "League Coach usa tus suscripciones a través de los programas oficiales (Claude Code y Codex CLI). El inicio de sesión ocurre en la página de cada proveedor: la app nunca ve ni guarda tus credenciales.",
  );

function Models({ providers }: { providers: ProvidersState }) {
  return (
    <section>
      <h2>{t("Models", "Modelos")}</h2>
      <p className="muted">{modelsIntro()}</p>
      <ProviderSetup providers={providers} />
    </section>
  );
}

export default Models;
