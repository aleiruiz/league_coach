import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProvidersState } from "./App";
import { Champion, gameData } from "./game";
import { GameDetail } from "./GameDetail";
import {
  GameStats,
  HistoryView,
  matchHistory,
  METRICS,
  PainPoint,
  POLL_MS,
  reviewMatches,
  riotAccount,
  riotIdOf,
  RiotProfile,
  roleName,
  SavedReport,
  asSyncError,
  SyncError,
  syncMatches,
  trend,
} from "./history";
import { focusNumbers, nameRefs, pointMetric, plainValue, worstGames } from "./improve";
import { Lang, t } from "./i18n";
import { AskButton, type AskContext } from "./AskPanel";
import { cancelPrompt, humanizeError, pickKind, ProviderKind } from "./providers";

const EMPTY: HistoryView = { configured: false, games: [], summary: null, latest: null, previous: null, needs_review: false };

function ChampIcon({ id, byId, size = 28 }: { id: string; byId: Map<string, Champion>; size?: number }) {
  const c = byId.get(id.toLowerCase());
  return c ? (
    <img className="hist-champ" src={c.image} alt="" width={size} height={size} />
  ) : (
    <span className="hist-champ icon-missing" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function gameDate(g: GameStats, lang: Lang): string {
  return g.ended_at
    ? new Date(g.ended_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" })
    : "";
}

function champName(id: string, byId: Map<string, Champion>): string {
  return byId.get(id.toLowerCase())?.name ?? id;
}

/** "Orianna vs Yasuo, Nov 9": a game named the way the player remembers it. */
function gameName(g: GameStats, byId: Map<string, Champion>, lang: Lang, date = true): string {
  const vs = g.opponent ? ` vs ${champName(g.opponent, byId)}` : "";
  return `${champName(g.champion, byId)}${vs}${date && g.ended_at ? ` (${gameDate(g, lang)})` : ""}`;
}

/** The one thing to work on: what, the drill, the goal and how it's going. */
function FocusCard({ p, view, byId, lang }: { p: PainPoint; view: HistoryView; byId: Map<string, Champion>; lang: Lang }) {
  const key = pointMetric(p);
  const nums = key ? focusNumbers(key, view.summary) : null;
  const m = key ? METRICS.find((x) => x.key === key) : undefined;
  const worst = key ? worstGames(key, p.games, view.games) : [];
  const tr = m && nums && nums.recent !== null && view.summary && view.summary.earlier.games > 0
    ? trend(nums.recent, view.summary.earlier[m.key], m.higher)
    : null;
  return (
    <article className="focus" aria-labelledby="focus-title">
      <div className="focus-main">
        <span className="focus-kicker">{t("Your focus", "Tu enfoque")}</span>
        <h3 id="focus-title">{p.title}</h3>
        {p.evidence && <p className="muted">{p.evidence}</p>}
        <p className="focus-drill-label small">{t("Do this for your next 5 games", "Haz esto en tus próximas 5 partidas")}</p>
        <p className="focus-drill">{p.drill}</p>
        {p.why && (
          <details className="pain-why">
            <summary>{t("Why it matters", "Por qué importa")}</summary>
            <p className="muted">{p.why}</p>
          </details>
        )}
      </div>
      <div className="focus-side">
        <div className="focus-labels small muted">
          <span>{m ? m.label() : p.metric}</span>
          {p.target && <span>{t("Goal:", "Meta:")} {p.target}</span>}
        </div>
        {key && nums && (
          <p className="focus-value">
            <strong>{plainValue(key, nums.all)}</strong>
            {nums.recent !== null && tr && (
              <span className={`small ${tr.verdict}`}>
                {plainValue(key, nums.recent)} {t("in your last 5", "en tus últimas 5")}
              </span>
            )}
          </p>
        )}
        {worst.length > 0 && key && (
          <>
            <p className="small muted">{t("Where it showed most", "Donde más se notó")}</p>
            <ul className="focus-games">
              {worst.map(({ g, v }) => (
                <li key={g.id}>
                  <ChampIcon id={g.champion} byId={byId} />
                  <span>{gameName(g, byId, lang)}</span>
                  <strong>{plainValue(key, v)}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}

/** A smaller point: its number, its goal, and the drill on click. */
function WatchRow({ p, view }: { p: PainPoint; view: HistoryView }) {
  const [open, setOpen] = useState(false);
  const key = pointMetric(p);
  const nums = key ? focusNumbers(key, view.summary) : null;
  const line = [key && nums ? plainValue(key, nums.all) : p.evidence, p.target ? t(`Goal: ${p.target}`, `Meta: ${p.target}`) : ""]
    .filter(Boolean)
    .join(". ");
  return (
    <li className="watch">
      <div className="watch-head">
        <div>
          <strong>{p.title}</strong>
          {line && <span className="muted small">{line}</span>}
        </div>
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t("Hide drill", "Ocultar ejercicio") : t("See drill", "Ver ejercicio")}
        </button>
      </div>
      {open && (
        <div className="watch-body small">
          <p>{p.drill}</p>
          {p.evidence && !line.includes(p.evidence) && <p className="muted">{p.evidence}</p>}
        </div>
      )}
    </li>
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
                <span
                  className={`metric-trend ${tr.verdict}`}
                  title={
                    tr.verdict === "better" ? t("Better", "Mejor") : tr.verdict === "worse" ? t("Worse", "Peor") : t("About the same", "Igual")
                  }
                >
                  {tr.arrow} {t("last 5", "últ. 5")}: {m.format(s.recent[m.key]!)}
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
              `Behind your lane opponent in minions at 10 min in ${s.behind_at_10[0]} of ${s.behind_at_10[1]} games.`,
              `Por detrás de tu rival de línea en súbditos al minuto 10 en ${s.behind_at_10[0]} de ${s.behind_at_10[1]} partidas.`,
            )}
      </p>
    </div>
  );
}

function GameRow({
  g,
  games,
  byId,
  lang,
  open,
  onToggle,
}: {
  g: GameStats;
  games: GameStats[];
  byId: Map<string, Champion>;
  lang: Lang;
  open: boolean;
  onToggle: () => void;
}) {
  const detailId = `game-detail-${g.id}`;
  return (
    <li className={`game-row ${g.win ? "win" : "loss"}${open ? " open" : ""}`}>
      <button
        type="button"
        className="game-row-head"
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        title={open ? t("Hide the summary", "Ocultar el resumen") : t("Show the game summary", "Ver el resumen de la partida")}
        onClick={onToggle}
      >
        <span className="game-result">{g.win ? t("Win", "Victoria") : t("Loss", "Derrota")}</span>
        <ChampIcon id={g.champion} byId={byId} />
        <span className="game-main">
          <strong>{gameName(g, byId, lang, false)}</strong>
          <span className="muted small">{roleName(g.role)}</span>
        </span>
        <span className="num">
          {g.kills}/{g.deaths}/{g.assists}
        </span>
        <span
          className={g.cs_diff_10 !== null && g.cs_diff_10 <= -10 ? "num bad" : "num"}
          title={t("Minions vs your opponent at 10 min", "Súbditos vs tu rival al minuto 10")}
        >
          {g.role !== "UTILITY" && g.cs_diff_10 !== null ? plainValue("cs_diff_10", g.cs_diff_10) : ""}
        </span>
        <span className="muted small">{gameDate(g, lang)}</span>
        <span className="game-chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && <GameDetail g={g} games={games} id={detailId} />}
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
  onAsk,
  onContext,
}: {
  providers: ProvidersState;
  lang: Lang;
  /** Changes when the Riot account is saved in Settings. */
  accountVersion: number;
  onBusy: (busy: boolean) => void;
  onGoToSettings: () => void;
  onGoToModels: () => void;
  /** Opens "Ask the coach". */
  onAsk: () => void;
  /** What Ask should know about this screen (null: no review yet). */
  onContext: (c: AskContext | null) => void;
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
  /** Last failed sync: a setup problem is shown in red with a way to fix it. */
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  /** The saved account and the local history have been read once. */
  const [loaded, setLoaded] = useState(false);
  /** At least one sync finished (or failed) since the account was set. */
  const [synced, setSynced] = useState(false);
  const requestId = useRef<string | null>(null);
  // The background check reads the latest values without restarting its timer.
  const live = useRef({ kind, profile, busy: false });
  live.current = { kind, profile, busy: syncing || reviewing };

  useEffect(() => onBusy(reviewing), [reviewing, onBusy]);

  useEffect(() => {
    if (!ready.some((p) => p.kind === kind)) setKind(pickKind(ready, providers.preferred));
  }, [ready, kind, providers.preferred]);

  // A new default chosen in Models applies here unless a request is running.
  useEffect(() => {
    const p = providers.preferred;
    if (p && !(syncing || reviewing) && ready.some((r) => r.kind === p)) setKind(p);
    // Only when the default itself changes.
  }, [providers.preferred]);

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
      setError(humanizeError(String(e)));
    }
  }, []);

  useEffect(() => {
    let current = true;
    setSynced(false);
    setSyncError(null);
    Promise.all([
      riotAccount()
        .then((a) => current && setProfile(a.profile))
        .catch(() => current && setProfile(null)),
      reload(),
    ]).finally(() => current && setLoaded(true));
    return () => {
      current = false;
    };
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
      setError(
        `${humanizeError(String(e))} ${t(
          "The next Update tries the review again (one request to your AI).",
          "El próximo Actualizar vuelve a intentar la revisión (una consulta a tu IA).",
        )}`,
      );
    } finally {
      requestId.current = null;
      setReviewing(false);
      setStatus(null);
    }
  }, [reload]);

  /**
   * `quiet`: background check; it only speaks up when something changed.
   * `update`: the Update button, which also reviews new games even with the
   * automatic review off.
   */
  const sync = useCallback(
    async (quiet: boolean, update = false) => {
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
        setSynced(true);
        setSyncError(null);
        setStatus(null);
        if (!quiet && r.new_games === 0 && !r.needs_review) setStatus(t("Up to date: no new games.", "Al día: no hay partidas nuevas."));
        const auto = live.current.profile?.auto_analyze && (r.new_games > 0 || !quiet);
        if (r.needs_review && update && !live.current.kind) {
          setStatus(t("New games to review: connect an AI in Settings › Your AI.", "Hay partidas por revisar: conecta una IA en Ajustes › Tu IA."));
        }
        if (r.needs_review && (auto || update) && live.current.kind) {
          await review();
        }
      } catch (e) {
        const err = asSyncError(e);
        setSyncing(false);
        setSynced(true);
        // A background blip (offline, Riot busy) is a quiet line, not an alarm;
        // a setup problem stays visible until it's fixed.
        setSyncError({ ...err, message: humanizeError(err.message) });
        setStatus(null);
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
  const tooFew = view.games.length < 3;
  const latest = view.latest;
  const newSince = latest ? view.games.findIndex((g) => g.id === latest.newest_game) : -1;
  const toReview = latest ? (newSince < 0 ? 0 : newSince) : view.games.length >= 3 ? view.games.length : 0;
  /** Game whose summary is open in the list (one at a time). */
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [allGames, setAllGames] = useState(false);
  const [numbers, setNumbers] = useState(false);
  // The review cites games as G1, G2…; the screen names them instead.
  const refNames = useMemo(
    () =>
      (latest?.game_refs ?? []).map((id) => {
        const g = view.games.find((x) => x.id === id);
        return g ? gameName(g, byId, lang) : t("an older game", "una partida anterior");
      }),
    [latest, view.games, byId, lang],
  );
  const named = (x: string) => nameRefs(x, refNames);
  const points = (latest?.report.pain_points ?? []).map((p) => ({
    ...p,
    title: named(p.title),
    evidence: named(p.evidence),
    why: named(p.why),
    drill: named(p.drill),
    target: named(p.target),
  }));
  const [focus, ...watch] = points;
  const contextPrompt = focus
    ? [
        t("Context from League Coach (not my question):", "Contexto de League Coach (no es mi pregunta):"),
        t(
          `From my last ${view.games.length} games, the main thing to fix is: ${focus.title}. ${focus.evidence}`,
          `De mis últimas ${view.games.length} partidas, lo principal a corregir es: ${focus.title}. ${focus.evidence}`,
        ),
        t(`My drill: ${focus.drill}`, `Mi ejercicio: ${focus.drill}`),
        focus.target ? t(`My goal: ${focus.target}`, `Mi meta: ${focus.target}`) : "",
        watch.length ? t(`Also watching: ${watch.map((p) => p.title).join("; ")}.`, `También vigilo: ${watch.map((p) => p.title).join("; ")}.`) : "",
        t(
          "Answer in plain text (not JSON), short and direct, as a few bullets.",
          "Responde en texto normal (no JSON), corto y directo, en unas pocas viñetas.",
        ),
      ]
        .filter(Boolean)
        .join("\n")
    : null;
  const focusTitle = focus?.title ?? null;
  useEffect(() => {
    onContext(
      contextPrompt && focusTitle
        ? {
            label: focusTitle,
            prompt: contextPrompt,
            suggestions: t(
              ["How do I practice this in a normal game?", "Why does this lose me games?", "What should I look for in a replay?"],
              ["¿Cómo practico esto en una partida normal?", "¿Por qué esto me hace perder partidas?", "¿Qué miro en una repetición?"],
            ),
          }
        : null,
    );
  }, [contextPrompt, focusTitle, lang, onContext]);
  const shown = allGames ? view.games : view.games.slice(0, 5);

  return (
    <section className="progress">
      <header className="moment-head">
        <div>
          <h2>{t("Improve", "Mejorar")}</h2>
          {configured && profile && (
            <p className="muted">
              {latest
                ? t(
                    `From your last ${view.games.length} games as ${riotIdOf(profile)}.`,
                    `De tus últimas ${view.games.length} partidas como ${riotIdOf(profile)}.`,
                  )
                : t(`Your games as ${riotIdOf(profile)}.`, `Tus partidas como ${riotIdOf(profile)}.`)}
            </p>
          )}
        </div>
        <div className="update">
        {configured && (
          <>
            {toReview > 0 && !busy && (
              <span className="warn-text small">
                {toReview === 1
                  ? t("1 new game to review", "1 partida nueva por revisar")
                  : t(`${toReview} new games to review`, `${toReview} partidas nuevas por revisar`)}
              </span>
            )}
            {reviewing ? (
              <button className="danger" onClick={() => requestId.current && cancelPrompt(requestId.current)}>
                {t("Stop", "Detener")}
              </button>
            ) : (
              <button
                onClick={() => sync(false, true)}
                disabled={busy}
                title={t(
                  "Looks for finished games and, if there are new ones, reviews them with your AI.",
                  "Busca partidas terminadas y, si hay nuevas, las revisa con tu IA.",
                )}
              >
                {syncing ? t("Updating…", "Actualizando…") : t("Update", "Actualizar")}
              </button>
            )}
          </>
        )}
          <AskButton onClick={onAsk} />
        </div>
      </header>

      {!loaded && <p className="muted">{t("Loading…", "Cargando…")}</p>}
      {loaded && !configured && (
        <div className="panel">
          <p>
            {t(
              "After you play, the coach reads your finished games from Riot and tells you what to work on. It never reads a game in progress.",
              "Después de jugar, el coach lee tus partidas terminadas desde Riot y te dice qué trabajar. Nunca lee una partida en curso.",
            )}
          </p>
          <p className="muted">
            {t(
              "Add your Riot ID, region and Riot key in Settings to get started.",
              "Agrega tu Riot ID, tu región y tu key de Riot en Ajustes para empezar.",
            )}
          </p>
          <button onClick={onGoToSettings}>{t("Open Settings", "Abrir Ajustes")}</button>
        </div>
      )}
      {configured && !ready.length && !providers.loading && (
        <p className="muted">
          {t("Connect Claude or ChatGPT to get the review.", "Conecta Claude o ChatGPT para recibir la revisión.")}{" "}
          <button className="link-button" onClick={onGoToModels}>
            {t("Connect an AI", "Conectar una IA")}
          </button>
        </p>
      )}

      <p className="message" role="status" aria-live="polite">
        {status}
      </p>
      {error && <p className="error">{error}</p>}
      {syncError?.kind === "setup" && (
        <div className="panel sync-error">
          <p className="error">{syncError.message}</p>
          <button className="secondary" onClick={onGoToSettings}>
            {t("Open Settings", "Abrir Ajustes")}
          </button>
        </div>
      )}
      {syncError?.kind === "transient" && (
        <p className="muted small">
          {t("Couldn't check for new games; will try again in a few minutes.", "No pude buscar partidas nuevas; lo intento de nuevo en unos minutos.")}{" "}
          ({syncError.message})
        </p>
      )}
      {loaded && configured && view.games.length === 0 && !syncError && (
        <div className="panel">
          <p className="muted">
            {!synced || syncing
              ? t("Looking for your games…", "Buscando tus partidas…")
              : t(
                  "No Summoner's Rift games yet. Play one and it shows up here a few minutes after it ends, or press Update.",
                  "Aún no hay partidas en la Grieta. Juega una y aparecerá aquí unos minutos después de terminar, o pulsa Actualizar.",
                )}
          </p>
        </div>
      )}
      {configured && !latest && view.games.length > 0 && tooFew && (
        <p className="muted">
          {t(
            "Play a few more Summoner's Rift games: the review needs at least 3.",
            "Juega algunas partidas más en la Grieta: la revisión necesita al menos 3.",
          )}
        </p>
      )}
      {configured && !latest && !tooFew && !busy && (
        <p className="muted">
          {t("Press Update to get your first review.", "Pulsa Actualizar para recibir tu primera revisión.")}
        </p>
      )}

      {latest && focus && (
        <>
          {latest.report.caveat && <p className="caveat">{named(latest.report.caveat)}</p>}
          <FocusCard p={focus} view={view} byId={byId} lang={lang} />
          {watch.length > 0 && (
            <section className="also-watch" aria-labelledby="watch-title">
              <h3 id="watch-title">{t("Also watch", "Vigila también")}</h3>
              <ul>
                {watch.map((p, i) => (
                  <WatchRow key={i} p={p} view={view} />
                ))}
              </ul>
            </section>
          )}
          {latest.report.strength && (
            <p className="keep-doing">
              <strong>{t("Keep doing", "Sigue así")}</strong> {named(latest.report.strength)}
            </p>
          )}
        </>
      )}

      {view.games.length > 0 && (
        <section className="recent" aria-labelledby="recent-title">
          <div className="recent-head">
            <h3 id="recent-title">{t("Recent games", "Partidas recientes")}</h3>
            <div className="recent-links">
              {view.games.length > 5 && (
                <button type="button" className="link-button" aria-expanded={allGames} onClick={() => setAllGames((v) => !v)}>
                  {allGames ? t("Show fewer", "Ver menos") : t(`Show all ${view.games.length}`, `Ver las ${view.games.length}`)}
                </button>
              )}
              {view.summary && (
                <button type="button" className="link-button" aria-expanded={numbers} onClick={() => setNumbers((v) => !v)}>
                  {numbers ? t("Hide your numbers", "Ocultar tus números") : t("All your numbers", "Todos tus números")}
                </button>
              )}
            </div>
          </div>
          <ul className="game-list">
            {shown.map((g) => (
              <GameRow
                key={g.id}
                g={g}
                byId={byId}
                lang={lang}
                games={view.games}
                open={openGame === g.id}
                onToggle={() => setOpenGame((o) => (o === g.id ? null : g.id))}
              />
            ))}
          </ul>
          {numbers && <Metrics view={view} latest={latest} previous={view.previous} />}
        </section>
      )}
    </section>
  );
}

export default Progress;
