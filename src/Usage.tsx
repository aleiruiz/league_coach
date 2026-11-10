import { useEffect, useState } from "react";
import {
  LimitWindow,
  ModelOption,
  ProviderKind,
  ProviderModels,
  providerModels,
  ProviderUsage,
  setProviderModel,
  UsageBucket,
} from "./providers";
import { currentLang, t } from "./i18n";

const fmt = (n: number) => n.toLocaleString(currentLang() === "es" ? "es-MX" : "en-US");

/** Name of a limit window, from the provider's own id or its length. */
export function windowLabel(w: LimitWindow): string {
  const named: Record<string, [string, string]> = {
    five_hour: ["5-hour window", "Ventana de 5 horas"],
    seven_day: ["Weekly", "Semanal"],
    seven_day_opus: ["Weekly (Opus)", "Semanal (Opus)"],
    seven_day_sonnet: ["Weekly (Sonnet)", "Semanal (Sonnet)"],
  };
  const n = named[w.id];
  if (n) return t(n[0], n[1]);
  const m = w.window_minutes;
  if (m) {
    if (m === 7 * 24 * 60) return t("Weekly", "Semanal");
    if (m % (24 * 60) === 0) return t(`${m / 1440}-day window`, `Ventana de ${m / 1440} días`);
    if (m % 60 === 0) return t(`${m / 60}-hour window`, `Ventana de ${m / 60} horas`);
    return t(`${m}-minute window`, `Ventana de ${m} minutos`);
  }
  return w.id;
}

/** "resets in 2 h 14 min" or, past a day, "resets Tue 14:00". */
export function resetText(resetsAt: number | null, now = Date.now()): string | null {
  if (resetsAt === null) return null;
  const ms = resetsAt * 1000 - now;
  if (ms <= 0) return t("resets now", "se reinicia ahora");
  const mins = Math.ceil(ms / 60000);
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const span = h > 0 ? `${h} h ${m} min` : `${m} min`;
    return t(`resets in ${span}`, `se reinicia en ${span}`);
  }
  const when = new Date(resetsAt * 1000).toLocaleString(currentLang() === "es" ? "es-MX" : "en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return t(`resets ${when}`, `se reinicia ${when}`);
}

type Day = {
  key: string;
  label: string;
  long: string;
  /** New prompt tokens + written tokens (cache reads are counted apart). */
  tokens: number;
  input: number;
  cached: number;
  output: number;
  queries: number;
};

/** Hourly buckets grouped into the last 7 local days (oldest first, today last). */
export function lastDays(buckets: UsageBucket[], now = new Date()): Day[] {
  const locale = currentLang() === "es" ? "es-MX" : "en-US";
  const days: Day[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({
      key: d.toDateString(),
      label: d.toLocaleDateString(locale, { weekday: "narrow" }),
      long: d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
      tokens: 0,
      input: 0,
      cached: 0,
      output: 0,
      queries: 0,
    });
  }
  for (const b of buckets) {
    const day = days.find((d) => d.key === new Date(b.hour * 3600 * 1000).toDateString());
    if (!day) continue;
    day.input += b.input;
    day.cached += b.cached ?? 0;
    day.output += b.output;
    day.tokens += b.input + b.output;
    day.queries += b.queries;
  }
  return days;
}

/** The window reset after the provider reported it: that % is no longer true. */
export function hasReset(w: LimitWindow, now = Date.now()): boolean {
  return w.resets_at !== null && w.resets_at * 1000 <= now;
}

/**
 * The one limit that matters most right now: the most-used window that
 * hasn't reset since it was reported. Null when nothing is known.
 */
export function mainLimit(windows: LimitWindow[] | undefined, now = Date.now()): LimitWindow | null {
  const live = (windows ?? []).filter((w) => !hasReset(w, now));
  return live.reduce<LimitWindow | null>((top, w) => (!top || w.used_percent > top.used_percent ? w : top), null);
}

/** "84% of the weekly limit used. Resets in 2 h." / "Limit reached. Back in 25 min." */
export function limitSentence(w: LimitWindow, now = Date.now()): string {
  const pct = Math.round(w.used_percent);
  const reset = resetText(w.resets_at, now);
  if (pct >= 100) {
    return reset
      ? t(`Limit reached (${windowLabel(w).toLowerCase()}), ${reset}.`, `Límite alcanzado (${windowLabel(w).toLowerCase()}), ${reset}.`)
      : t("Limit reached.", "Límite alcanzado.");
  }
  const base = t(`${pct}% used (${windowLabel(w).toLowerCase()})`, `${pct}% usado (${windowLabel(w).toLowerCase()})`);
  return reset ? `${base}, ${reset}.` : `${base}.`;
}

function Meter({ w }: { w: LimitWindow }) {
  if (hasReset(w)) {
    const at = new Date((w.resets_at ?? 0) * 1000).toLocaleString(currentLang() === "es" ? "es-MX" : "en-US", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className="meter">
        <div className="meter-head">
          <span>{windowLabel(w)}</span>
          <span className="muted">{t("Reset", "Reiniciado")}</span>
        </div>
        <div className="meter-track" aria-hidden="true" />
        <p className="muted small">
          {t(
            `This window reset (${at}). Your new usage shows after your next answer.`,
            `Esta ventana se reinició (${at}). Tu uso nuevo aparece tras tu próxima respuesta.`,
          )}
        </p>
      </div>
    );
  }
  const pct = Math.round(w.used_percent);
  const level = pct >= 100 ? "full" : pct >= 80 ? "high" : "normal";
  const reset = resetText(w.resets_at);
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{windowLabel(w)}</span>
        <span>
          <strong>{pct}%</strong> {t("used", "usado")}
          {level === "full" && <span className="badge warn">{t("Limit reached", "Límite alcanzado")}</span>}
          {level === "high" && <span className="badge warn">{t("Almost used up", "Casi agotado")}</span>}
        </span>
      </div>
      <div
        className={`meter-track ${level}`}
        role="meter"
        aria-label={windowLabel(w)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, w.used_percent))}%` }} />
      </div>
      {reset && <p className="muted small">{reset}</p>}
    </div>
  );
}

function Limits({ kind, usage }: { kind: ProviderKind; usage: ProviderUsage | undefined }) {
  const limits = usage?.limits;
  const seen = limits
    ? new Date(limits.seen_at * 1000).toLocaleString(currentLang() === "es" ? "es-MX" : "en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="usage-block">
      <h4>{t("Plan limits", "Límites del plan")}</h4>
      {limits ? (
        <>
          {limits.windows.map((w) => (
            <Meter key={w.id} w={w} />
          ))}
          <p className="muted small">
            {usage?.limits_source === "live"
              ? t("Read from your plan just now.", "Leído de tu plan ahora mismo.")
              : kind === "claude_code"
                ? t(
                    `As reported with your last answer (${seen}). Claude Code only sends this when you ask something.`,
                    `Según tu última respuesta (${seen}). Claude Code solo lo informa cuando preguntas algo.`,
                  )
                : t(`Last read ${seen}.`, `Última lectura: ${seen}.`)}
          </p>
        </>
      ) : (
        <p className="muted small">
          {kind === "claude_code"
            ? t(
                "Ask the coach something and your 5-hour and weekly limits show up here.",
                "Pregúntale algo al coach y aquí aparecen tus límites de 5 horas y semanal.",
              )
            : usage?.limits_error
              ? t(`Codex didn't share your limits: ${usage.limits_error}`, `Codex no compartió tus límites: ${usage.limits_error}`)
              : t("Codex didn't report limits for your plan.", "Codex no informó límites para tu plan.")}
        </p>
      )}
      {limits && usage?.limits_error && (
        <p className="muted small">
          {t(`Couldn't refresh them: ${usage.limits_error}`, `No pude actualizarlos: ${usage.limits_error}`)}
        </p>
      )}
    </div>
  );
}

function Tokens({ usage }: { usage: ProviderUsage | undefined }) {
  const days = lastDays(usage?.buckets ?? []);
  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const [focus, setFocus] = useState<number | null>(null);
  const shown = days[focus ?? days.length - 1];
  const week = days.reduce((s, d) => s + d.tokens, 0);
  return (
    <div className="usage-block">
      <h4>{t("Tokens used by League Coach", "Tokens que usó League Coach")}</h4>
      <p className="usage-today">
        <strong>{fmt(today.tokens)}</strong> {t("today", "hoy")}
        <span className="muted small">
          {" · "}
          {t(`${fmt(week)} in the last 7 days`, `${fmt(week)} en los últimos 7 días`)}
        </span>
      </p>
      <div className="spark" onMouseLeave={() => setFocus(null)}>
        {days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            className={i === focus ? "spark-col focus" : "spark-col"}
            onMouseEnter={() => setFocus(i)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            aria-label={`${d.long}: ${fmt(d.tokens)} tokens`}
          >
            <span className="spark-bar" style={{ height: `${d.tokens ? Math.max(4, (d.tokens / max) * 100) : 0}%` }} />
            <span className="spark-label">{d.label}</span>
          </button>
        ))}
      </div>
      <p className="muted small" aria-live="polite">
        {shown.long}:{" "}
        {t(
          `${fmt(shown.input)} read · ${fmt(shown.output)} written · ${fmt(shown.cached)} from cache · ${shown.queries} ${shown.queries === 1 ? "answer" : "answers"}`,
          `${fmt(shown.input)} leídos · ${fmt(shown.output)} escritos · ${fmt(shown.cached)} de caché · ${shown.queries} ${shown.queries === 1 ? "respuesta" : "respuestas"}`,
        )}
      </p>
      <p className="muted small">
        {t(
          "Only what this app asked for. Your plan limits above are what really counts; tokens from cache (mostly the coach's instructions, re-read each answer) aren't in the totals.",
          "Solo lo que pidió esta app. Lo que de verdad cuenta son los límites de tu plan (arriba); los tokens de caché (sobre todo las instrucciones del coach, que se releen en cada respuesta) no están en los totales.",
        )}
      </p>
    </div>
  );
}

export function ModelPicker({ kind }: { kind: ProviderKind }) {
  const [models, setModels] = useState<ProviderModels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    providerModels(kind)
      .then((m) => live && setModels(m))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [kind]);

  async function choose(id: string) {
    const model = id === "" ? null : id;
    setSaved(false);
    try {
      await setProviderModel(kind, model);
      setModels((m) => (m ? { ...m, selected: model } : m));
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    }
  }

  if (!models) return <p className="muted small">{error ?? t("Loading models…", "Cargando modelos…")}</p>;
  const options: ModelOption[] = [...models.options];
  // A model chosen earlier that the list no longer offers stays visible.
  if (models.selected && !options.some((o) => o.id === models.selected)) {
    options.push({ id: models.selected, name: models.selected, description: "" });
  }
  const current = options.find((o) => o.id === models.selected);
  const defaultLabel = models.default_name
    ? t(`Default (${models.default_name})`, `Predeterminado (${models.default_name})`)
    : t("Default (your plan's)", "Predeterminado (el de tu plan)");
  return (
    <div className="usage-block">
      <label className="usage-model">
        <h4>{t("Model", "Modelo")}</h4>
        <select value={models.selected ?? ""} onChange={(e) => choose(e.target.value)}>
          <option value="">{defaultLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small" role="status">
        {current?.description ||
          t("The model the CLI picks for you.", "El modelo que el CLI elige por ti.")}
        {saved && ` ${t("Saved: new questions use it.", "Guardado: las preguntas nuevas lo usan.")}`}
      </p>
      {models.error && (
        <p className="muted small">
          {t(`Couldn't read the model list: ${models.error}`, `No pude leer la lista de modelos: ${models.error}`)}
        </p>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

/** Model picker, plan limits and token use of one signed-in provider. */
export function ProviderDetails({
  kind,
  usage,
  loading,
}: {
  kind: ProviderKind;
  /** A string is the error that the read returned. */
  usage: ProviderUsage | string | undefined;
  loading: boolean;
}) {
  const data = typeof usage === "object" ? usage : undefined;
  return (
    <div className="usage">
      <ModelPicker kind={kind} />
      {data ? (
        <>
          <Limits kind={kind} usage={data} />
          <Tokens usage={data} />
        </>
      ) : (
        <div className="usage-block">
          <h4>{t("Usage", "Uso")}</h4>
          {loading ? (
            <p className="muted small" role="status">
              {kind === "codex"
                ? t("Reading your plan limits from Codex…", "Leyendo los límites de tu plan desde Codex…")
                : t("Loading usage…", "Cargando el uso…")}
            </p>
          ) : (
            <p className="error small">
              {t("Couldn't read usage:", "No pude leer el uso:")} {String(usage ?? "")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
