import { useEffect, useState } from "react";
import type { ProvidersState } from "./App";
import Models from "./Models";
import { limitSentence, mainLimit, ModelPicker } from "./Usage";
import {
  pickKind,
  ProviderKind,
  ProviderStatus,
  ProviderUsage,
  usageOverview,
} from "./providers";
import { Lang, t } from "./i18n";

function statusText(p: ProviderStatus, inUse: boolean): string {
  if (!p.installed) return t("Not installed", "No instalado");
  if (!p.logged_in) return t("Not signed in", "Sin iniciar sesión");
  return inUse
    ? t("Connected, in use", "Conectado, en uso")
    : t("Connected", "Conectado");
}

/** One row per AI: status, model, and the one limit that matters right now. */
function AIRow({
  p,
  inUse,
  canChoose,
  usage,
  onUse,
  onSetUp,
}: {
  p: ProviderStatus;
  inUse: boolean;
  /** More than one AI is signed in, so "use this one" means something. */
  canChoose: boolean;
  usage: ProviderUsage | string | undefined;
  onUse: () => void;
  onSetUp: () => void;
}) {
  const limit =
    typeof usage === "object" ? mainLimit(usage.limits?.windows) : null;
  const pct = limit ? Math.min(100, Math.max(0, limit.used_percent)) : 0;
  const level = pct >= 100 ? "full" : pct >= 80 ? "high" : "normal";
  return (
    <div className={`ai-row${inUse ? " in-use" : ""}`}>
      <div className="ai-row-head">
        <span className="ai-name">
          <strong>{p.label}</strong>
          <span className={p.logged_in ? "ai-status ok" : "ai-status"}>
            {statusText(p, inUse)}
          </span>
        </span>
        {p.logged_in && canChoose && !inUse && (
          <button
            type="button"
            className="secondary small-button"
            onClick={onUse}
          >
            {t("Use this one", "Usar este")}
          </button>
        )}
        {!p.logged_in && (
          <button type="button" className="small-button" onClick={onSetUp}>
            {p.installed
              ? t("Sign in", "Iniciar sesión")
              : t("Set up", "Configurar")}
          </button>
        )}
      </div>
      {p.logged_in && (
        <>
          <ModelPicker kind={p.kind} />
          {limit ? (
            <div className="ai-limit">
              <span className="small">{limitSentence(limit)}</span>
              <div
                className={`meter-track ${level}`}
                role="meter"
                aria-label={t("Plan limit used", "Límite del plan usado")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : (
            <p className="muted small">
              {usage === undefined
                ? t(
                    "Reading your plan limits…",
                    "Leyendo los límites de tu plan…",
                  )
                : t(
                    "Your plan limits show up after your first answer.",
                    "Los límites de tu plan aparecen tras tu primera respuesta.",
                  )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Your AI" in Settings: a row per AI with what you need day to day. Sign-in,
 * tests, token history and the full limit list are one click away in the
 * details (the former Models screen).
 */
export function YourAI({
  providers,
  active,
  lang,
}: {
  providers: ProvidersState;
  active: boolean;
  lang: Lang;
}) {
  const [usage, setUsage] = useState<
    Partial<Record<ProviderKind, ProviderUsage | string>>
  >({});
  const [details, setDetails] = useState(false);
  const signedIn = providers.list.filter((p) => p.logged_in);
  const inUse = pickKind(signedIn, providers.preferred);
  const signedKey = signedIn.map((p) => p.kind).join(",");

  // Each time Settings is opened (it stays mounted while hidden).
  useEffect(() => {
    if (!active || !signedKey || details) return;
    for (const kind of signedKey.split(",") as ProviderKind[]) {
      usageOverview(kind)
        .then((u) => setUsage((s) => ({ ...s, [kind]: u })))
        .catch((e) => setUsage((s) => ({ ...s, [kind]: String(e) })));
    }
  }, [active, signedKey, details]);

  return (
    <>
      <div className="ai-rows">
        {providers.list.map((p) => (
          <AIRow
            key={`${p.kind}-${lang}`}
            p={p}
            inUse={p.kind === inUse}
            canChoose={signedIn.length > 1}
            usage={usage[p.kind]}
            onUse={() => providers.setPreferred(p.kind)}
            onSetUp={() => setDetails(true)}
          />
        ))}
        {providers.loading && providers.list.length === 0 && (
          <p className="muted small">
            {t("Checking your AI apps…", "Revisando tus apps de IA…")}
          </p>
        )}
      </div>
      <button
        type="button"
        className="link-button"
        aria-expanded={details}
        onClick={() => setDetails((d) => !d)}
      >
        {details
          ? t("Hide usage details", "Ocultar detalles de uso")
          : t(
              "Usage details and troubleshooting",
              "Detalles de uso y solución de problemas",
            )}
      </button>
      {details && (
        <div className="ai-details">
          <Models
            providers={providers}
            active={active && details}
            lang={lang}
          />
        </div>
      )}
    </>
  );
}
