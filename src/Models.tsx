import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  humanizeError,
  openLogin,
  pickKind,
  ProviderKind,
  ProviderStatus,
  ProviderUsage,
  testProvider,
  usageOverview,
} from "./providers";
import { ProviderDetails } from "./Usage";
import type { ProvidersState } from "./App";
import { Lang, t } from "./i18n";

type Test = { state: "running" | "ok" | "error"; text: string };

/** Status, sign-in and test for each AI CLI (used by Models and the first-run setup). */
export function ProviderSetup({
  providers,
  details,
}: {
  providers: ProvidersState;
  /** Extra content under a signed-in provider (Models shows usage there). */
  details?: (p: ProviderStatus) => ReactNode;
}) {
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
          `A terminal opened with the ${p.label} sign-in. Finish signing in in your browser; the app will notice on its own for the next few minutes.`,
          `Se abrió una terminal con el login de ${p.label}. Completa el inicio de sesión en tu navegador; la app lo detectará sola durante los próximos minutos.`,
        ),
      );
      // Checks the status every 4 s for 3 minutes; after that, says so.
      stopPolling();
      waitingFor.current = p.kind;
      let ticks = 0;
      poll.current = window.setInterval(async () => {
        ticks += 1;
        await refresh();
        if (ticks >= 45 && waitingFor.current === p.kind) {
          stopPolling();
          setMessage(
            t(
              `I haven't detected the ${p.label} sign-in yet. When you finish it, press Check.`,
              `Todavía no detecto el inicio de sesión de ${p.label}. Cuando lo completes, pulsa Verificar.`,
            ),
          );
        }
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
    const done = list.find((p) => p.kind === waitingFor.current && p.logged_in);
    if (done) {
      stopPolling();
      setMessage(t(`${done.label} connected.`, `${done.label} conectado.`));
    }
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
                {[p.detail, p.version].filter(Boolean).join(" · ")}
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
              {p.logged_in && details?.(p)}
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

/** Whether this AI is the one the other screens start on, and a way to make it so. */
function DefaultChoice({
  kind,
  label,
  isDefault,
  only,
  onChoose,
}: {
  kind: ProviderKind;
  label: string;
  isDefault: boolean;
  /** The only signed-in AI: it's the default anyway, nothing to choose. */
  only: boolean;
  onChoose: () => void;
}) {
  if (only) return null;
  return (
    <div className="default-choice" data-kind={kind}>
      {isDefault ? (
        <span className="badge patch">
          {t("Default for Game, Ask and My progress", "Predeterminado en Partida, Preguntar y Mi progreso")}
        </span>
      ) : (
        <button type="button" className="secondary" onClick={onChoose}>
          {t(`Use ${label} by default`, `Usar ${label} por defecto`)}
        </button>
      )}
    </div>
  );
}

function Models({ providers, active, lang }: { providers: ProvidersState; active: boolean; lang: Lang }) {
  // Per provider: `undefined` while loading, so a slow Codex read never
  // holds up (or blanks) Claude's card.
  const [usage, setUsage] = useState<Partial<Record<ProviderKind, ProviderUsage | string>>>({});
  const [loadingUsage, setLoadingUsage] = useState<Partial<Record<ProviderKind, boolean>>>({});
  const signedInList = providers.list.filter((p) => p.logged_in);
  const signedIn = signedInList
    .map((p) => p.kind)
    .join(",");
  const loadUsage = useCallback((kinds: ProviderKind[]) => {
    for (const kind of kinds) {
      setLoadingUsage((l) => ({ ...l, [kind]: true }));
      usageOverview(kind)
        .then((u) => setUsage((s) => ({ ...s, [kind]: u })))
        .catch((e) => setUsage((s) => ({ ...s, [kind]: String(e) })))
        .finally(() => setLoadingUsage((l) => ({ ...l, [kind]: false })));
    }
  }, []);
  // Each time the tab is opened (the view stays mounted while hidden).
  useEffect(() => {
    if (active && signedIn) loadUsage(signedIn.split(",") as ProviderKind[]);
  }, [active, signedIn, loadUsage]);

  return (
    <section>
      <p className="muted">{modelsIntro()}</p>
      <ProviderSetup
        providers={providers}
        details={(p) => (
          <>
            <DefaultChoice
              kind={p.kind}
              label={p.label}
              isDefault={pickKind(signedInList, providers.preferred) === p.kind}
              only={signedInList.length < 2}
              onChoose={() => providers.setPreferred(p.kind)}
            />
            <ProviderDetails
              key={`${p.kind}-${lang}`}
              kind={p.kind}
              usage={usage[p.kind]}
              loading={loadingUsage[p.kind] ?? true}
            />
          </>
        )}
      />
    </section>
  );
}

export default Models;
