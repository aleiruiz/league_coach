import { useEffect, useRef } from "react";
import { AskButton } from "./AskPanel";
import { Art, ChampPic, champName, Items, Pic } from "./gameArt";
import { formatCompared, GameDetail } from "./GameDetail";
import type { MatchDetail, PlayerDetail } from "./games";
import { bests, duration, gameFacts, kdaRatio, killShare, matchTitle, me, pctText, perMinute, queueName, won } from "./gameRows";
import { standouts } from "./gameSummary";
import { GameStats, roleName } from "./history";
import { Lang, t } from "./i18n";

const locale = (lang: Lang) => (lang === "es" ? "es-MX" : "en-US");

/** "What went well" / "To improve": facts with their number, and against the player's usual when there are enough games. */
function Verdict({ d, stats, history }: { d: MatchDetail; stats: GameStats | undefined; history: GameStats[] }) {
  const { better, worse } = stats ? standouts(stats, history) : { better: [], worse: [] };
  // A number compared with the usual isn't repeated as a plain fact.
  const facts = gameFacts(d, stats, false, new Set([...better, ...worse].map((c) => c.key)));
  const side = (title: string, cls: string, own: string[], vs: typeof better) =>
    own.length + vs.length > 0 && (
      <div className={`m-verdict ${cls}`}>
        <h3>{title}</h3>
        <ul>
          {own.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {vs.map((c) => (
            <li key={c.key}>
              {c.label}: <strong>{formatCompared(c, c.value, true)}</strong>{" "}
              <span className="muted small">
                ({t("usually", "normalmente")} {formatCompared(c, c.usual)})
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  const good = side(t("What went well", "Lo que salió bien"), "good", facts.good, better);
  const bad = side(t("To improve", "A mejorar"), "bad", facts.bad, worse);
  if (!good && !bad) return null;
  return (
    <section className="m-verdicts" aria-label={t("How the game went", "Cómo fue la partida")}>
      {good}
      {bad}
    </section>
  );
}

function Bests({ d, art, lang }: { d: MatchDetail; art: Art | null; lang: Lang }) {
  return (
    <section aria-labelledby="m-bests">
      <h3 id="m-bests" className="m-h">
        {t("Best in this game", "Lo mejor de la partida")}
      </h3>
      <ul className="m-bests">
        {bests(d, locale(lang)).map((b) => (
          <li key={b.key} className={b.player.is_me ? "me" : undefined}>
            <span className="muted small">{b.label}</span>
            <span className="m-best-who">
              <ChampPic art={art} id={b.player.champion} size={32} className="m-best-pic" />
              <span>
                <strong>{champName(art, b.player.champion)}</strong>
                {b.player.is_me && <span className="m-you">{t("You", "Tú")}</span>}
                <span className="m-best-value">{b.value}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="m-bar-cell">
      <span>{label}</span>
      <span className="m-bar" aria-hidden="true">
        <span style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
    </span>
  );
}

function TeamTable({ d, teamId, art, lang }: { d: MatchDetail; teamId: number; art: Art | null; lang: Lang }) {
  const players = d.players.filter((p) => p.team_id === teamId);
  const team = d.teams.find((x) => x.team_id === teamId);
  const mine = me(d)?.team_id === teamId;
  const maxDealt = Math.max(...d.players.map((p) => p.damage_dealt));
  const maxTaken = Math.max(...d.players.map((p) => p.damage_taken));
  const n = (x: number) => x.toLocaleString(locale(lang));
  const k = players.reduce((a, p) => a + p.kills, 0);
  const dd = players.reduce((a, p) => a + p.deaths, 0);
  const aa = players.reduce((a, p) => a + p.assists, 0);
  const caption = `${mine ? t("Your team", "Tu equipo") : t("Enemy team", "Equipo rival")} · ${
    team?.win ? t("Win", "Victoria") : t("Loss", "Derrota")
  } · ${k} / ${dd} / ${aa}`;
  const row = (p: PlayerDetail, i: number) => (
    <tr key={i} className={p.is_me ? "me" : undefined}>
      <th scope="row">
        <span className="m-player">
          <span className="g-champ-wrap">
            <ChampPic art={art} id={p.champion} size={32} />
            <span className="g-level">{p.level}</span>
          </span>
          <span className="m-player-names">
            <span>
              {p.name || champName(art, p.champion)}
              {p.is_me && <span className="m-you">{t("You", "Tú")}</span>}
            </span>
            <span className="muted small">
              {champName(art, p.champion)}
              {p.position ? ` · ${roleName(p.position)}` : ""}
            </span>
          </span>
        </span>
      </th>
      <td>
        <strong>
          {p.kills} / <span className="deaths">{p.deaths}</span> / {p.assists}
        </strong>
        <span className="muted small">{kdaRatio(p)} KDA</span>
      </td>
      <td>
        {p.cs}
        <span className="muted small">{perMinute(p.cs, d.duration_s)}/min</span>
      </td>
      <td>{pctText(killShare(d, p))}</td>
      <td>
        <Bar value={p.damage_dealt} max={maxDealt} label={n(p.damage_dealt)} />
      </td>
      <td>
        <Bar value={p.damage_taken} max={maxTaken} label={n(p.damage_taken)} />
      </td>
      <td>{n(p.gold)}</td>
      <td>
        <Items p={p} art={art} size={22} />
      </td>
    </tr>
  );
  return (
    <div className={`m-table-wrap ${mine ? "ally" : "enemy"}`}>
      <table className="m-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Player", "Jugador")}</th>
            <th scope="col">K / D / A</th>
            <th scope="col">{t("Minions", "Súbditos")}</th>
            <th scope="col">{t("In kills", "En kills")}</th>
            <th scope="col">{t("Damage dealt", "Daño hecho")}</th>
            <th scope="col">{t("Damage taken", "Daño recibido")}</th>
            <th scope="col">{t("Gold", "Oro")}</th>
            <th scope="col">{t("Items", "Objetos")}</th>
          </tr>
        </thead>
        <tbody>{players.map(row)}</tbody>
      </table>
    </div>
  );
}

function Objectives({ d, art }: { d: MatchDetail; art: Art | null }) {
  const p = me(d);
  const mineId = p?.team_id ?? 100;
  const teams = [...d.teams].sort((a) => (a.team_id === mineId ? -1 : 1));
  const rows: [string, (o: MatchDetail["teams"][0]["objectives"]) => number][] = [
    [t("Towers", "Torres"), (o) => o.tower],
    [t("Inhibitors", "Inhibidores"), (o) => o.inhibitor],
    [t("Dragons", "Dragones"), (o) => o.dragon],
    [t("Barons", "Barones"), (o) => o.baron],
    [t("Rift Heralds", "Heraldos"), (o) => o.rift_herald],
    [t("Void grubs", "Larvas del vacío"), (o) => o.horde],
  ];
  if (d.teams.some((x) => x.objectives?.atakhan > 0)) rows.push(["Atakhan", (o) => o.atakhan]);
  return (
    <section className="m-objectives" aria-labelledby="m-obj">
      <h3 id="m-obj" className="m-h">
        {t("Objectives", "Objetivos")}
      </h3>
      <table className="m-obj-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t("Objective", "Objetivo")}</span>
            </th>
            <th scope="col" className="ally">
              {t("Your team", "Tu equipo")}
            </th>
            <th scope="col" className="enemy">
              {t("Enemy", "Rival")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {teams.map((x) => (
                <td key={x.team_id}>{x.objectives ? f(x.objectives) : "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {d.teams.some((x) => x.bans.length > 0) && (
        <div className="m-bans">
          {teams.map((x) => (
            <p key={x.team_id}>
              <span className="muted small">
                {x.team_id === mineId ? t("Your bans", "Tus bans") : t("Their bans", "Sus bans")}
              </span>{" "}
              {x.bans.length === 0
                ? "—"
                : x.bans.map((key, i) => {
                    const c = art?.champByKey(key);
                    return (
                      <span key={i} className="m-ban">
                        <Pic src={c?.image} title={c?.name} size={22} className="g-mini" />
                        {c?.name ?? t("Unknown", "Desconocido")}
                      </span>
                    );
                  })}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One finished game in full: how it went for the player, who led each
 * number, both teams side by side, and the objectives. Ask the coach is told
 * about it without anyone's name.
 */
export default function Match({
  d,
  stats,
  history,
  art,
  lang,
  onBack,
  onAsk,
}: {
  d: MatchDetail;
  stats: GameStats | undefined;
  history: GameStats[];
  art: Art | null;
  lang: Lang;
  onBack: () => void;
  onAsk: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [d.id]);
  const p = me(d);
  const win = won(d);
  const when = new Date(d.ended_at).toLocaleString(locale(lang), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const title = matchTitle(d, (c) => champName(art, c), roleName);
  const enemy = (p?.team_id ?? 100) === 100 ? 200 : 100;
  return (
    <section className={`match ${win ? "win" : "loss"}`}>
      <button type="button" className="link-button m-back" onClick={onBack}>
        ← {t("All games", "Todas las partidas")}
      </button>
      <header className="moment-head m-head">
        <div className="m-title">
          {p && <ChampPic art={art} id={p.champion} size={56} />}
          <div>
            <h2 ref={heading} tabIndex={-1}>
              {title}
            </h2>
            <p className="muted">
              {queueName(d.queue_id)} · {duration(d.duration_s)} · {when} · {t("Patch", "Parche")} {d.patch}
            </p>
          </div>
        </div>
        <AskButton onClick={onAsk} label={t("Ask the coach about this game", "Preguntar al coach sobre esta partida")} />
      </header>

      <Verdict d={d} stats={stats} history={history} />
      <Bests d={d} art={art} lang={lang} />

      <section className="m-teams" aria-label={t("Both teams", "Ambos equipos")}>
        {[p?.team_id ?? 100, enemy].map((id) => (
          <TeamTable key={id} d={d} teamId={id} art={art} lang={lang} />
        ))}
      </section>

      <Objectives d={d} art={art} />

      {stats && (
        <section aria-labelledby="m-numbers">
          <h3 id="m-numbers" className="m-h">
            {t("Your numbers", "Tus números")}
          </h3>
          <GameDetail g={stats} games={history} id={`match-numbers-${d.id}`} compare={false} />
        </section>
      )}
    </section>
  );
}
