import { useCallback, useEffect, useMemo, useState } from "react";
import { Champion, GameData, gameData } from "./game";
import { GameDetail } from "./GameDetail";
import { fillMatchDetails, GamesView, MatchDetail, matchDetails, PlayerDetail } from "./games";
import {
  byDay,
  duration,
  kdaRatio,
  killShare,
  laneOpponent,
  mainChampions,
  me,
  pctText,
  perMinute,
  queueName,
  RANKED_QUEUES,
  record,
  rowTags,
  won,
} from "./gameRows";
import { GameStats, matchHistory, riotAccount, riotIdOf, roleName, asSyncError, syncMatches } from "./history";
import { plainValue } from "./improve";
import { Lang, t } from "./i18n";
import { humanizeError } from "./providers";

const EMPTY: GamesView = { configured: false, games: [], missing: 0 };
const PAGE = 10;

/** Images by Riot's ids: champions by name, spells and runes by number. */
type Art = {
  version: string;
  champ: (id: string) => Champion | undefined;
  spell: (key: number) => { name: string; image: string } | undefined;
  rune: (id: number) => { name: string; icon: string } | undefined;
  item: (id: number) => string | undefined;
};

function useArt(lang: Lang): Art | null {
  const [data, setData] = useState<GameData | null>(null);
  useEffect(() => {
    let current = true;
    gameData()
      .then((d) => current && setData(d))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [lang]);
  return useMemo(() => {
    if (!data) return null;
    const champs = new Map(data.champions.map((c) => [c.id.toLowerCase(), c]));
    const spells = new Map((data.spells ?? []).map((s) => [s.key, s]));
    const runes = new Map<number, { name: string; icon: string }>();
    for (const tree of data.rune_trees) {
      runes.set(tree.id, tree);
      for (const slot of tree.slots) for (const r of slot) runes.set(r.id, r);
    }
    const items = new Map((data.items ?? []).map((i) => [Number(i.id), i.name]));
    return {
      version: data.version,
      champ: (id) => champs.get(id.toLowerCase()),
      spell: (key) => spells.get(key),
      rune: (id) => runes.get(id),
      item: (id) => items.get(id),
    };
  }, [data]);
}

function Pic({ src, title, size, className }: { src?: string; title?: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className={className} src={src} alt="" title={title} width={size} height={size} onError={() => setBroken(true)} />
  ) : (
    <span className={`${className ?? ""} pic-missing`} title={title} style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function ChampPic({ art, id, size, className }: { art: Art | null; id: string; size: number; className?: string }) {
  const c = art?.champ(id);
  return <Pic src={c?.image} title={c?.name ?? id} size={size} className={className ?? "g-champ"} />;
}

const champName = (art: Art | null, id: string) => art?.champ(id)?.name ?? id;

/** Bought items packed to the left, the trinket kept last. */
function packed(items: number[]): number[] {
  const bought = items.slice(0, 6).filter(Boolean);
  return [...bought, ...Array(6 - bought.length).fill(0), items[6] ?? 0];
}

function Items({ p, art }: { p: PlayerDetail; art: Art | null }) {
  const label = t("Final items", "Objetos finales");
  return (
    <span className="g-items" aria-label={label}>
      {packed(p.items).map((id, i) =>
        id ? (
          <Pic
            key={i}
            className={i === 6 ? "g-item trinket" : "g-item"}
            src={art ? `https://ddragon.leagueoflegends.com/cdn/${art.version}/img/item/${id}.png` : undefined}
            title={art?.item(id)}
            size={26}
          />
        ) : (
          <span key={i} className={i === 6 ? "g-item empty trinket" : "g-item empty"} aria-hidden="true" />
        ),
      )}
    </span>
  );
}

function Team({ d, teamId, art, label }: { d: MatchDetail; teamId: number; art: Art | null; label: string }) {
  return (
    <span className="g-team" aria-label={label}>
      {d.players
        .filter((p) => p.team_id === teamId)
        .map((p, i) => (
          <ChampPic key={i} art={art} id={p.champion} size={22} className={p.is_me ? "g-mini me" : "g-mini"} />
        ))}
    </span>
  );
}

function GameRow({
  d,
  stats,
  history,
  art,
  open,
  onToggle,
}: {
  d: MatchDetail;
  stats: GameStats | undefined;
  history: GameStats[];
  art: Art | null;
  open: boolean;
  onToggle: () => void;
}) {
  const p = me(d);
  if (!p) return null;
  const win = won(d);
  const opp = laneOpponent(d, p);
  const tags = rowTags(d, stats);
  const spells = p.spells.map((k) => art?.spell(k));
  const keystone = art?.rune(p.runes[0]);
  const second = art?.rune(p.secondary_style);
  const cs10 = p.position !== "UTILITY" ? (stats?.cs_diff_10 ?? null) : null;
  const detailId = `games-detail-${d.id}`;
  return (
    <li className={`g-row ${win ? "win" : "loss"}${open ? " open" : ""}`}>
      <button
        type="button"
        className="g-row-head"
        aria-expanded={stats ? open : undefined}
        aria-controls={open ? detailId : undefined}
        disabled={!stats}
        onClick={onToggle}
      >
        <span className="g-result">
          <strong>{win ? t("Win", "Victoria") : t("Loss", "Derrota")}</strong>
          <span className="muted small">{queueName(d.queue_id, true)}</span>
          <span className="muted small">{duration(d.duration_s)}</span>
        </span>

        <span className="g-who">
          <span className="g-champ-wrap">
            <ChampPic art={art} id={p.champion} size={48} />
            <span className="g-level" title={t("Champion level", "Nivel del campeón")}>
              {p.level}
            </span>
          </span>
          <span className="g-setup" aria-hidden="true">
            {spells.map((s, i) => (
              <Pic key={i} className="g-spell" src={s?.image} title={s?.name} size={20} />
            ))}
            <Pic className="g-rune" src={keystone?.icon} title={keystone?.name} size={20} />
            <Pic className="g-rune second" src={second?.icon} title={second?.name} size={20} />
          </span>
          <span className="g-names">
            <strong>
              {champName(art, p.champion)}
              {opp && (
                <>
                  {" "}
                  <span className="muted">vs</span> {champName(art, opp.champion)}
                </>
              )}
            </strong>
            <span className="muted small">
              {roleName(p.position)}
              {keystone ? ` · ${keystone.name}` : ""}
              {spells.every(Boolean) ? ` · ${spells.map((s) => s!.name).join(", ")}` : ""}
            </span>
          </span>
        </span>

        <span className="g-kda">
          <strong>
            {p.kills} / <span className="deaths">{p.deaths}</span> / {p.assists}
          </strong>
          <span className="muted small">
            {kdaRatio(p)} KDA · {t(`${pctText(killShare(d, p))} of kills`, `en el ${pctText(killShare(d, p))} de las kills`)}
          </span>
        </span>

        <span className="g-cs">
          <strong>
            {p.cs} {t("minions", "súbditos")} <span className="muted">({perMinute(p.cs, d.duration_s)}/min)</span>
          </strong>
          {cs10 !== null && (
            <span className={cs10 >= 10 ? "small ahead" : cs10 <= -10 ? "small behind" : "small muted"}>
              {plainValue("cs_diff_10", cs10)} {t("at 10 min", "al min 10")}
            </span>
          )}
        </span>

        <span className="g-build">
          <Items p={p} art={art} />
          {tags.good.length + tags.bad.length > 0 && (
            <span className="g-tags">
              {tags.good.map((x) => (
                <span key={x} className="g-tag good">
                  {x}
                </span>
              ))}
              {tags.bad.map((x) => (
                <span key={x} className="g-tag bad">
                  {x}
                </span>
              ))}
            </span>
          )}
        </span>

        <span className="g-teams">
          <span className="g-portraits">
            <Team d={d} teamId={p.team_id} art={art} label={t("Your team", "Tu equipo")} />
            <Team d={d} teamId={p.team_id === 100 ? 200 : 100} art={art} label={t("Enemy team", "Equipo rival")} />
          </span>
          {stats && (
            <span className="g-more small" aria-hidden="true">
              {open ? t("Hide summary", "Ocultar resumen") : t("Summary", "Resumen")} ▾
            </span>
          )}
        </span>
      </button>
      {open && stats && <GameDetail g={stats} games={history} id={detailId} />}
    </li>
  );
}

type Filter = { kind: "all" } | { kind: "ranked" } | { kind: "champ"; id: string };

export default function Games({
  lang,
  active,
  version,
  onChanged,
  onGoToSettings,
}: {
  lang: Lang;
  /** The screen is showing: reload what may have changed meanwhile. */
  active: boolean;
  /** Changes when another screen synced games. */
  version: number;
  /** This screen added games or details: the others should reload. */
  onChanged: () => void;
  onGoToSettings: () => void;
}) {
  const art = useArt(lang);
  const [view, setView] = useState<GamesView>(EMPTY);
  const [history, setHistory] = useState<GameStats[]>([]);
  const [riotId, setRiotId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [shown, setShown] = useState(PAGE);
  const [openGame, setOpenGame] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<GamesView | null> => {
    try {
      const [v, h, a] = await Promise.all([matchDetails(), matchHistory(), riotAccount()]);
      setView(v);
      setHistory(h.games);
      setRiotId(riotIdOf(a.profile));
      return v;
    } catch (e) {
      setError(humanizeError(String(e)));
      return null;
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (active) reload();
  }, [active, version, reload]);

  // Another check already running is not an error: say so quietly.
  const failed = (e: unknown) => {
    const err = asSyncError(e);
    if (err.kind === "busy") {
      setStatus(err.message);
    } else {
      setStatus(null);
      setError(humanizeError(err.message));
    }
  };

  const update = async () => {
    setBusy(true);
    setError(null);
    setStatus(t("Looking for new games…", "Buscando partidas nuevas…"));
    try {
      const r = await syncMatches((ev) => ev.type === "status" && setStatus(ev.text));
      await reload();
      if (r.new_games > 0) onChanged();
      setStatus(r.new_games === 0 ? t("Up to date: no new games.", "Al día: no hay partidas nuevas.") : null);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  // Older games only have a summary until their details are read: one
  // request to Riot each, so only when the player asks.
  const fill = async () => {
    setBusy(true);
    setError(null);
    try {
      const before = view.missing;
      const n = await fillMatchDetails((ev) => ev.type === "status" && setStatus(ev.text));
      const v = await reload();
      if (n > 0) onChanged();
      // Riot keeps games for a limited time: the ones it no longer has are
      // remembered and not asked for again, and keep their summary in Improve.
      const gone = v ? Math.max(0, before - n - v.missing) : 0;
      setStatus(
        gone > 0
          ? t(
              `Riot no longer has the details of ${gone === 1 ? "1 older game" : `${gone} older games`}. ${gone === 1 ? "It keeps" : "They keep"} their summary in Improve and won't be asked for again.`,
              `Riot ya no tiene los detalles de ${gone === 1 ? "1 partida antigua" : `${gone} partidas antiguas`}. ${gone === 1 ? "Conserva" : "Conservan"} su resumen en Mejorar y no se volverán a pedir.`,
            )
          : null,
      );
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => new Map(history.map((g) => [g.id, g])), [history]);
  const champs = useMemo(() => mainChampions(view.games), [view.games]);
  const filtered = view.games.filter((g) => {
    if (filter.kind === "ranked") return RANKED_QUEUES.includes(g.queue_id);
    if (filter.kind === "champ") return me(g)?.champion === filter.id;
    return true;
  });
  const days = byDay(filtered.slice(0, shown), Date.now(), lang === "es" ? "es-MX" : "en-US");
  const wins = filtered.filter(won).length;
  const chip = (f: Filter, label: string) => {
    const on = f.kind === filter.kind && (f.kind !== "champ" || (filter.kind === "champ" && filter.id === f.id));
    return (
      <button
        key={label}
        type="button"
        role="radio"
        aria-checked={on}
        className={on ? "chip on" : "chip"}
        onClick={() => {
          setFilter(f);
          setShown(PAGE);
        }}
      >
        {label}
      </button>
    );
  };

  if (loaded && !view.configured) {
    return (
      <section className="games">
        <header className="moment-head">
          <div>
            <h2>{t("Games", "Partidas")}</h2>
          </div>
        </header>
        <p className="muted">
          {t("Add your Riot ID in Settings to see your games.", "Agrega tu Riot ID en Ajustes para ver tus partidas.")}{" "}
          <button type="button" className="link-button" onClick={onGoToSettings}>
            {t("Open Settings", "Abrir Ajustes")}
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="games" aria-busy={busy}>
      <header className="moment-head">
        <div>
          <h2>{t("Games", "Partidas")}</h2>
          {filtered.length > 0 && (
            <p className="muted">
              {t(`Your last ${filtered.length} games`, `Tus últimas ${filtered.length} partidas`)}
              {riotId ? t(` as ${riotId}`, ` como ${riotId}`) : ""}. {record(wins, filtered.length - wins)}.
            </p>
          )}
        </div>
        <div className="update">
          {status && (
            <span className="muted small" role="status">
              {status}
            </span>
          )}
          <button type="button" className="primary" disabled={busy} onClick={update}>
            {t("Update", "Actualizar")}
          </button>
        </div>
      </header>

      {error && <p className="error">⚠ {error}</p>}

      {view.missing > 0 && (
        <p className="g-missing">
          {t(
            `${view.missing} older games only have a summary.`,
            `${view.missing} partidas anteriores solo tienen un resumen.`,
          )}{" "}
          <button type="button" className="link-button" disabled={busy} onClick={fill}>
            {t("Load their details", "Cargar sus detalles")}
          </button>
        </p>
      )}

      {view.games.length > 0 && (
        <div className="g-filters" role="radiogroup" aria-label={t("Filter games", "Filtrar partidas")}>
          {chip({ kind: "all" }, t("All games", "Todas"))}
          {chip({ kind: "ranked" }, t("Ranked only", "Solo clasificatorias"))}
          {champs.map((c) => chip({ kind: "champ", id: c }, champName(art, c)))}
        </div>
      )}

      {loaded && view.games.length === 0 && view.missing === 0 && (
        <p className="muted">
          {t(
            "No games yet. Update after your next Summoner's Rift game.",
            "Aún no hay partidas. Actualiza después de tu próxima partida en la Grieta.",
          )}
        </p>
      )}

      {days.map((day) => (
        <section key={day.key} className="g-day" aria-label={day.label}>
          <h3>
            {day.label} <span className="muted">{day.record}</span>
          </h3>
          <ul className="g-list">
            {day.games.map((d) => (
              <GameRow
                key={d.id}
                d={d}
                stats={stats.get(d.id)}
                history={history}
                art={art}
                open={openGame === d.id}
                onToggle={() => setOpenGame((o) => (o === d.id ? null : d.id))}
              />
            ))}
          </ul>
        </section>
      ))}

      {filtered.length > shown && (
        <button type="button" className="g-older" onClick={() => setShown((n) => n + PAGE)}>
          {t("Show older games", "Ver partidas anteriores")}
        </button>
      )}
    </section>
  );
}
