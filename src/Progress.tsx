import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProvidersState } from "./App";
import { Champion, gameData } from "./game";
import {
  GameStats,
  HistoryView,
  matchHistory,
  METRICS,
  PainPoint,
  pct,
  POLL_MS,
  reviewMatches,
  riotAccount,
  riotIdOf,
  RiotProfile,
  roleName,
  SavedReport,
  signed,
  syncMatches,
  trend,
} from "./history";
import { Lang, t } from "./i18n";
import { cancelPrompt, humanizeError, ProviderKind } from "./providers";

const EMPTY: HistoryView = { configured: false, games: [], summary: null, latest: null, previous: null, needs_review: false };

function ChampIcon({ id, byId, size = 28 }: { id: string; byId: Map<string, Champion>; size?: number }) {
  const c = byId.get(id.toLowerCase());
  return c ? (
    <img className="hist-champ" src={c.image} alt="" width={size} height={size} />
  ) : (
    <span className="hist-champ icon-missing" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function PainCard({
  n,
  p,
  games,
  byId,
}: {
  n: number;
  p: PainPoint;
  games: GameStats[];
  byId: Map<string, Champion>;
}) {
  const cited = p.games.map((id) => games.find((g) => g.id === id)).filter((g): g is GameStats => !!g);
  return (
    <article className="panel pain">
      <header className="pain-head">
        <span className="pain-n" aria-hidden="true">
          {n}
        </span>
        <h4>{p.title}</h4>
        {p.metric && <span className="badge patch">{p.metric}</span>}
      </header>
      {p.evidence && <p className="pain-evidence">{p.evidence}</p>}
      {p.why && <p className="muted">{p.why}</p>}
      <div className="pain-drill">
        <strong>{t("Practice", "Practica")}</strong>
        <p>{p.drill}</p>
      </div>
      {p.target && (
        <p className="pain-target">
          <strong>{t("Target", "Meta")}:</strong> {p.target}
        </p>
      )}
      {cited.length > 0 && (
        <div className="pain-games" aria-label={t("Games that show it", "Partidas que lo muestran")}>
          {cited.map((g) => (
            <span key={g.id} className={g.win ? "game-chip win" : "game-chip loss"} title={g.id}>
              <ChampIcon id={g.champion} byId={byId} size={18} />
              {g.kills}/{g.deaths}/{g.assists}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function Metrics({ view, latest, previous }: { view: HistoryView; latest: SavedReport | null; previous: SavedReport | null }) {
  const s = view.summary;
  if (!s) return null;
  return (
    <div className="panel">
      <h3 className="panel-title">
        {t(`Your numbers · last ${s.all.games} games`, `Tus números · últimas ${s.all.games} partidas`)}
      </h3>
      <div className="metric-grid">
        {METRICS.map((m) => {
          const v = s.all[m.key];
          if (v === null) return null;
          const tr = s.earlier.games > 0 ? trend(s.recent[m.key], s.earlier[m.key], m.higher) : null;
          const before = previous && latest ? previous.averages[m.key] : null;
          const now = latest ? latest.averages[m.key] : null;
          return (
            <div key={m.key} className="metric">
              <span className="metric-label">{m.label()}</span>
              <span className="metric-value">{m.format(v)}</span>
              {tr && s.recent[m.key] !== null && (
                <span className={`metric-trend ${tr}`}>
                  {tr === "up" ? "▲" : tr === "down" ? "▼" : "■"} {t("last 5", "últ. 5")}: {m.format(s.recent[m.key]!)}
                </span>
              )}
              {before !== null && now !== null && (
                <span className="muted small">
                  {t("previous review", "revisión anterior")}: {m.format(before)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small">
        {t(
          "Compared with your own earlier games and your lane opponents, not with averages per rank.",
          "Comparado con tus propias partidas anteriores y con tus rivales de línea, no con promedios por rango.",
        )}
        {s.behind_at_10[1] > 0 &&
          " " +
            t(
              `Behind your lane opponent in CS at 10 in ${s.behind_at_10[0]} of ${s.behind_at_10[1]} games.`,
              `Por detrás de tu rival de línea en CS al 10 en ${s.behind_at_10[0]} de ${s.behind_at_10[1]} partidas.`,
            )}
      </p>
    </div>
  );
}

function GameRow({ g, byId, lang }: { g: GameStats; byId: Map<string, Champion>; lang: Lang }) {
  const name = byId.get(g.champion.toLowerCase())?.name ?? g.champion;
  const opp = g.opponent ? (byId.get(g.opponent.toLowerCase())?.name ?? g.opponent) : null;
  const date = g.ended_at
    ? new Date(g.ended_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })
    : "";
  return (
    <li className={g.win ? "game-row win" : "game-row loss"}>
      <ChampIcon id={g.champion} byId={byId} />
      <div className="game-main">
        <strong>{name}</strong>
        <span className="muted small">
          {roleName(g.role)}
          {opp && ` · vs ${opp}`}
        </span>
      </div>
      <span className="game-result">{g.win ? t("Win", "Victoria") : t("Loss", "Derrota")}</span>
      <span className="num">
        {g.kills}/{g.deaths}/{g.assists}
      </span>
      <span className="num" title={t("CS per minute", "CS por minuto")}>
        {g.cs_per_min.toFixed(1)} CS/m
      </span>
      <span className="num" title={t("CS difference at 10 vs lane opponent", "Diferencia de CS al 10 vs rival de línea")}>
        {g.cs_diff_10 !== null ? `${signed(g.cs_diff_10)} @10` : "—"}
      </span>
      <span className="num" title={t("Kill participation", "Participación en kills")}>
        {pct(g.kill_participation)} KP
      </span>
      <span className="muted small">
        {date} · {Math.round(g.minutes)} min
      </span>
    </li>
  );
}

function Progress({
  providers,
  lang,
  accountVersion,
  onBusy,
  onGoToSettings,
  onGoToModels,
}: {
  providers: ProvidersState;
  lang: Lang;
  /** Changes when the Riot account is saved in Settings. */
  accountVersion: number;
  onBusy: (busy: boolean) => void;
  onGoToSettings: () => void;
  onGoToModels: () => void;
}) {
  const ready = useMemo(() => providers.list.filter((p) => p.logged_in), [providers.list]);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [profile, setProfile] = useState<RiotProfile | null>(null);
  const [view, setView] = useState<HistoryView>(EMPTY);
  const [champs, setChamps] = useState<Champion[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  // The background check reads the latest values without restarting its timer.
  const live = useRef({ kind, profile, busy: false });
  live.current = { kind, profile, busy: syncing || reviewing };

  useEffect(() => onBusy(reviewing), [reviewing, onBusy]);

  useEffect(() => {
    if (!ready.some((p) => p.kind === kind)) setKind(ready[0]?.kind ?? null);
  }, [ready, kind]);

  useEffect(() => {
    let current = true;
    gameData()
      .then((g) => current && setChamps(g.champions))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [lang]);

  const byId = useMemo(() => new Map(champs.map((c) => [c.id.toLowerCase(), c])), [champs]);

  const reload = useCallback(async () => {
    try {
      setView(await matchHistory());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    riotAccount()
      .then((a) => setProfile(a.profile))
      .catch(() => setProfile(null));
    reload();
  }, [accountVersion, reload]);

  const review = useCallback(async () => {
    const k = live.current.kind;
    if (!k) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    setReviewing(true);
    setError(null);
    setStatus(t("Reviewing your games…", "Revisando tus partidas…"));
    try {
      await reviewMatches(k, id, (ev) => {
        if (ev.type === "status") setStatus(ev.text);
      });
      await reload();
    } catch (e) {
      setError(humanizeError(String(e)));
    } finally {
      requestId.current = null;
      setReviewing(false);
      setStatus(null);
    }
  }, [reload]);

  /** `quiet`: background check; it only speaks up when something changed. */
  const sync = useCallback(
    async (quiet: boolean) => {
      if (live.current.busy) return;
      setSyncing(true);
      if (!quiet) {
        setError(null);
        setStatus(t("Looking for new games…", "Buscando partidas nuevas…"));
      }
      try {
        const r = await syncMatches((ev) => {
          if (ev.type === "status") setStatus(ev.text);
        });
        await reload();
        setSyncing(false);
        setStatus(null);
        if (!quiet && r.new_games === 0) setStatus(t("No new games.", "No hay partidas nuevas."));
        if (r.needs_review && (r.new_games > 0 || !quiet) && live.current.profile?.auto_analyze && live.current.kind) {
          await review();
        }
      } catch (e) {
        setSyncing(false);
        setStatus(null);
        setError(String(e));
      }
    },
    [reload, review],
  );

  const configured = !!profile && !!riotIdOf(profile) && !!profile.region;

  // Background check while the app is open: Riot publishes a game a few
  // minutes after it ends. It only reads finished games.
  useEffect(() => {
    if (!configured) return;
    const first = setTimeout(() => sync(true), 3000);
    const every = setInterval(() => sync(true), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [configured, accountVersion, sync]);

  const busy = syncing || reviewing;
  const latest = view.latest;
  const newSince = latest ? view.games.findIndex((g) => g.id === latest.newest_game) : -1;

  return (
    <section className="progress">
      <header className="draft-header">
        <h2>{t("My progress", "Mi progreso")}</h2>
        {profile && configured && <span className="badge">{riotIdOf(profile)}</span>}
        {ready.length > 1 && (
          <select
            aria-label={t("Model", "Modelo")}
            value={kind ?? ""}
            onChange={(e) => setKind(e.currentTarget.value as ProviderKind)}
            disabled={busy}
          >
            {ready.map((p) => (
              <option key={p.kind} value={p.kind}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {configured && (
          <>
            <button className="secondary" onClick={() => sync(false)} disabled={busy}>
              {t("Check for new games", "Buscar partidas nuevas")}
            </button>
            {reviewing ? (
              <button className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                {t("Stop", "Detener")}
              </button>
            ) : (
              <button onClick={review} disabled={busy || !kind || view.games.length < 3}>
                {t("Review my games", "Revisar mis partidas")}
              </button>
            )}
          </>
        )}
      </header>

      <p className="muted">
        {t(
          "After you play, the coach reads your finished games from Riot's official API and points out what to work on. It never reads a game in progress.",
          "Después de jugar, el coach lee tus partidas terminadas desde la API oficial de Riot y te dice qué trabajar. Nunca lee una partida en curso.",
        )}
      </p>

      {!configured && (
        <div className="panel">
          <p>
            {t(
              "Add your Riot ID, region and Riot API key in Settings to get started.",
              "Agrega tu Riot ID, tu región y tu API key de Riot en Ajustes para empezar.",
            )}
          </p>
          <button onClick={onGoToSettings}>{t("Open Settings", "Abrir Ajustes")}</button>
        </div>
      )}
      {configured && !ready.length && !providers.loading && (
        <p className="muted">
          {t("Connect Claude or ChatGPT to get the review.", "Conecta Claude o ChatGPT para recibir la revisión.")}{" "}
          <button className="link-button" onClick={onGoToModels}>
            {t("Connect models", "Conectar modelos")}
          </button>
        </p>
      )}

      <p className="message" role="status" aria-live="polite">
        {status}
      </p>
      {error && <p className="error">{error}</p>}

      {latest && (
        <div className="review">
          <div className="review-head">
            <h3>{latest.report.headline || t("What to work on", "Qué trabajar")}</h3>
            <span className="muted small">
              {new Date(latest.created_at).toLocaleString(lang === "es" ? "es-MX" : "en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {" · "}
              {t(`${latest.averages.games} games`, `${latest.averages.games} partidas`)}
            </span>
            {newSince > 0 && (
              <span className="badge warn">
                {newSince === 1
                  ? t("1 new game since this review", "1 partida nueva desde esta revisión")
                  : t(`${newSince} new games since this review`, `${newSince} partidas nuevas desde esta revisión`)}
              </span>
            )}
          </div>
          <div className="pain-grid">
            {latest.report.pain_points.map((p, i) => (
              <PainCard key={i} n={i + 1} p={p} games={view.games} byId={byId} />
            ))}
          </div>
          {latest.report.strength && (
            <p className="panel strength">
              <strong>{t("Keep doing", "Sigue así")}:</strong> {latest.report.strength}
            </p>
          )}
        </div>
      )}
      {configured && !latest && view.games.length > 0 && view.games.length < 3 && (
        <p className="muted">
          {t(
            "Play a few more Summoner's Rift games: the review needs at least 3.",
            "Juega algunas partidas más en la Grieta: la revisión necesita al menos 3.",
          )}
        </p>
      )}

      <Metrics view={view} latest={latest} previous={view.previous} />

      {view.games.length > 0 && (
        <div className="panel">
          <h3 className="panel-title">{t("Recent games", "Partidas recientes")}</h3>
          <ul className="game-list">
            {view.games.slice(0, 20).map((g) => (
              <GameRow key={g.id} g={g} byId={byId} lang={lang} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default Progress;
