// What the Games list shows for each game, worked out from the stored details.
// Pure functions: the screen only lays them out.

import type { MatchDetail, PlayerDetail } from "./games";
import type { GameStats } from "./history";
import { t } from "./i18n";

/** Full name, then the short one for the list. */
const QUEUES: Record<number, [string, string, string, string]> = {
  400: ["Normal Draft", "Normal (reclutamiento)", "Normal Draft", "Normal"],
  420: ["Ranked Solo/Duo", "Clasificatoria Solo/Dúo", "Ranked Solo", "Clasif. Solo"],
  430: ["Normal Blind", "Normal (a ciegas)", "Normal Blind", "A ciegas"],
  440: ["Ranked Flex", "Clasificatoria Flexible", "Ranked Flex", "Clasif. Flex"],
  480: ["Swiftplay", "Partida rápida", "Swiftplay", "Rápida"],
  490: ["Quickplay", "Juego rápido", "Quickplay", "Juego rápido"],
};

export const RANKED_QUEUES = [420, 440];

export function queueName(q: number, short = false): string {
  const n = QUEUES[q];
  if (!n) return short ? t("Rift", "Grieta") : t("Summoner's Rift", "Grieta del Invocador");
  return short ? t(n[2], n[3]) : t(n[0], n[1]);
}

/** 1728 → "28:48". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function me(d: MatchDetail): PlayerDetail | undefined {
  return d.players.find((p) => p.is_me);
}

/** The enemy in the same position, if positions were assigned. */
export function laneOpponent(d: MatchDetail, p: PlayerDetail): PlayerDetail | undefined {
  if (!p.position) return undefined;
  return d.players.find((x) => x.team_id !== p.team_id && x.position === p.position);
}

export function teamKills(d: MatchDetail, teamId: number): number {
  return d.players.filter((p) => p.team_id === teamId).reduce((n, p) => n + p.kills, 0);
}

/** Share of the team's kills the player took part in (0-1). */
export function killShare(d: MatchDetail, p: PlayerDetail): number {
  if (p.kill_participation !== null) return p.kill_participation;
  const k = teamKills(d, p.team_id);
  return k === 0 ? 0 : (p.kills + p.assists) / k;
}

/** (K + A) / D, with "Perfect" when there were no deaths. */
export function kdaRatio(p: PlayerDetail): string {
  if (p.deaths === 0) return t("Perfect", "Perfecto");
  return ((p.kills + p.assists) / p.deaths).toFixed(1);
}

export function perMinute(n: number, seconds: number): string {
  return seconds > 0 ? (n / (seconds / 60)).toFixed(1) : "0";
}

export const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** Local midnight of a time, as a key for grouping by day. */
function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayLabel(ms: number, now: number, locale: string): string {
  const days = Math.round((dayStart(now) - dayStart(ms)) / 86_400_000);
  if (days === 0) return t("Today", "Hoy");
  if (days === 1) return t("Yesterday", "Ayer");
  return new Date(ms).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

export function record(wins: number, losses: number): string {
  const w = wins === 1 ? t("1 win", "1 victoria") : t(`${wins} wins`, `${wins} victorias`);
  const l = losses === 1 ? t("1 loss", "1 derrota") : t(`${losses} losses`, `${losses} derrotas`);
  return `${w}, ${l}`;
}

export type Day = { key: number; label: string; record: string; games: MatchDetail[] };

/** Newest day first, keeping the games' order inside each day. */
export function byDay(games: MatchDetail[], now: number, locale: string): Day[] {
  const days: Day[] = [];
  for (const g of games) {
    const key = dayStart(g.ended_at);
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, label: dayLabel(g.ended_at, now, locale), record: "", games: [] };
      days.push(day);
    }
    day.games.push(g);
  }
  for (const d of days) {
    const wins = d.games.filter((g) => me(g) && won(g)).length;
    d.record = record(wins, d.games.length - wins);
  }
  return days;
}

export function won(d: MatchDetail): boolean {
  const p = me(d);
  return !!p && !!d.teams.find((x) => x.team_id === p.team_id)?.win;
}

export type Tags = { good: string[]; bad: string[] };

/**
 * Control wards bought, the count Improve compares across games; the
 * stored details' own count (wards placed) only when the summary is missing.
 */
export function controlWards(p: PlayerDetail, stats: GameStats | undefined): number {
  return stats?.control_wards ?? p.control_wards;
}

const MULTI: Record<number, [string, string]> = {
  3: ["Triple kill", "Triple asesinato"],
  4: ["Quadra kill", "Cuádruple asesinato"],
  5: ["Penta kill", "Pentakill"],
};

/**
 * Up to three facts about the player's game, each with its number: what went
 * well and what to improve. `stats` adds the timeline numbers (minions at 10,
 * early deaths) when the game has them.
 */
export function rowTags(d: MatchDetail, stats: GameStats | undefined): Tags {
  return pickThree(gameFacts(d, stats, true));
}

/**
 * Every fact about the player's game, each with its number. `onRow` leaves
 * out the ones the Games row already shows as numbers (minions at 10, share
 * of kills).
 */
export function gameFacts(
  d: MatchDetail,
  stats: GameStats | undefined,
  onRow = false,
  /** Metric keys already said another way (Match details compares them with the usual). */
  skip: ReadonlySet<string> = new Set(),
): Tags {
  const p = me(d);
  if (!p) return { good: [], bad: [] };
  const minutes = d.duration_s / 60;
  const support = p.position === "UTILITY";
  const good: string[] = [];
  const bad: string[] = [];
  const multi = Math.min(p.largest_multikill, 5);
  if (multi >= 3) good.push(t(...MULTI[multi]));
  if (p.deaths === 0) good.push(t("No deaths", "Sin muertes"));
  // The row is short; Match details adds the number.
  const num = (n: number) => (onRow ? "" : `: ${n.toLocaleString(t("en-US", "es-MX"))}`);
  if (d.players.every((x) => x.gold <= p.gold)) good.push(t("Most gold in the game", "Más oro de la partida") + num(p.gold));
  if (d.players.every((x) => x.damage_dealt <= p.damage_dealt)) {
    good.push(t("Most damage in the game", "Más daño de la partida") + num(p.damage_dealt));
  } else if (d.players.filter((x) => x.team_id === p.team_id).every((x) => x.damage_dealt <= p.damage_dealt)) {
    good.push(t("Most damage on your team", "Más daño de tu equipo") + num(p.damage_dealt));
  }
  const cs10 = support || onRow || skip.has("cs_diff_10") ? null : (stats?.cs_diff_10 ?? null);
  if (cs10 !== null && cs10 >= 10) good.push(t(`${cs10} minions ahead at 10 min`, `${cs10} súbditos arriba al min 10`));
  if (cs10 !== null && cs10 <= -10) bad.push(t(`${-cs10} minions behind at 10 min`, `${-cs10} súbditos abajo al min 10`));
  const early = skip.has("early_deaths") ? null : (stats?.early_deaths ?? null);
  if (early === 0 && minutes >= 14 && p.deaths > 0) good.push(t("No deaths before minute 14", "Sin muertes antes del min 14"));
  if (early !== null && early >= 2) bad.push(t(`${early} deaths before minute 14`, `${early} muertes antes del min 14`));
  const share = killShare(d, p);
  const kills = teamKills(d, p.team_id);
  const shareShown = onRow || skip.has("kill_participation");
  if (!shareShown && share >= 0.6) good.push(t(`In ${pctText(share)} of kills`, `En el ${pctText(share)} de las kills`));
  if (!shareShown && share < 0.35 && kills >= 10) bad.push(t(`In only ${pctText(share)} of kills`, `Solo en el ${pctText(share)} de las kills`));
  if (controlWards(p, stats) === 0 && minutes >= 15 && !skip.has("control_wards")) bad.push(t("0 control wards", "0 wards de control"));
  if (p.deaths >= 8) bad.push(t(`${p.deaths} deaths`, `${p.deaths} muertes`));
  return { good, bad };
}

/** Three at most: the first of each side, then the rest of what went well, then the rest to improve. */
function pickThree({ good, bad }: Tags): Tags {
  const picked: Tags = { good: good.slice(0, 1), bad: bad.slice(0, 1) };
  const more = [...good.slice(1).map((x) => ["good", x] as const), ...bad.slice(1).map((x) => ["bad", x] as const)];
  for (const [side, text] of more) {
    if (picked.good.length + picked.bad.length >= 3) break;
    picked[side].push(text);
  }
  return picked;
}

/** Champions played at least twice, most played first (for the filter chips). */
export function mainChampions(games: MatchDetail[], max = 3): string[] {
  const n = new Map<string, number>();
  for (const g of games) {
    const p = me(g);
    if (p) n.set(p.champion, (n.get(p.champion) ?? 0) + 1);
  }
  return [...n.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([c]) => c);
}

/** (K + A) / D as a number to compare players (deaths count as at least 1). */
export function kdaValue(p: PlayerDetail): number {
  return (p.kills + p.assists) / Math.max(1, p.deaths);
}

export type Best = { key: string; label: string; player: PlayerDetail; value: string };

/** "Best in this game": who led each number, of all ten players. Ties go to the first listed. */
export function bests(d: MatchDetail, locale: string): Best[] {
  const n = (x: number) => x.toLocaleString(locale);
  const top = (f: (p: PlayerDetail) => number) =>
    d.players.reduce((a, b) => (f(b) > f(a) ? b : a), d.players[0]);
  if (d.players.length === 0) return [];
  const gold = top((p) => p.gold);
  const dmg = top((p) => p.damage_dealt);
  const cs = top((p) => p.cs);
  const kda = top(kdaValue);
  const tank = top((p) => p.damage_taken);
  return [
    { key: "gold", label: t("Most gold", "Más oro"), player: gold, value: n(gold.gold) },
    { key: "damage", label: t("Most damage dealt", "Más daño hecho"), player: dmg, value: n(dmg.damage_dealt) },
    { key: "cs", label: t("Most minions", "Más súbditos"), player: cs, value: n(cs.cs) },
    { key: "kda", label: t("Best KDA", "Mejor KDA"), player: kda, value: `${kdaRatio(kda)} (${kda.kills}/${kda.deaths}/${kda.assists})` },
    { key: "taken", label: t("Most damage taken", "Más daño recibido"), player: tank, value: n(tank.damage_taken) },
  ];
}

/** ["Win", "as Ahri (Mid) against Syndra"]: the result apart, so only it is colored. */
export function matchTitleParts(d: MatchDetail, champ: (id: string) => string, role: (pos: string) => string): [string, string] {
  const p = me(d);
  if (!p) return ["", queueName(d.queue_id)];
  const opp = laneOpponent(d, p);
  const r = p.position ? ` (${role(p.position)})` : "";
  const vs = opp ? t(` against ${champ(opp.champion)}`, ` contra ${champ(opp.champion)}`) : "";
  return [won(d) ? t("Win", "Victoria") : t("Loss", "Derrota"), t(`as ${champ(p.champion)}${r}${vs}`, `con ${champ(p.champion)}${r}${vs}`)];
}

/** "Win as Ahri (Mid) against Syndra". */
export function matchTitle(d: MatchDetail, champ: (id: string) => string, role: (pos: string) => string): string {
  return matchTitleParts(d, champ, role).filter(Boolean).join(" ");
}

export type Names = { champ: (id: string) => string; item: (id: number) => string | undefined; role: (pos: string) => string };

/**
 * What "Ask the coach" is told about a finished game. Champions, roles and
 * numbers only: never another player's name or Riot ID.
 */
export function matchPrompt(d: MatchDetail, stats: GameStats | undefined, names: Names): string {
  const p = me(d);
  if (!p) return "";
  const minutes = d.duration_s / 60;
  const line = (x: PlayerDetail) =>
    `${names.champ(x.champion)}${x.position ? ` (${names.role(x.position)})` : ""} ${x.kills}/${x.deaths}/${x.assists}, ${x.cs} ${t("minions", "súbditos")}, ${x.gold} ${t("gold", "oro")}, ${x.damage_dealt} ${t("damage", "daño")}`;
  const team = (id: number) => d.players.filter((x) => x.team_id === id && !x.is_me).map(line).join("; ");
  const enemy = p.team_id === 100 ? 200 : 100;
  const obj = (id: number) => {
    const o = d.teams.find((x) => x.team_id === id)?.objectives;
    return o
      ? t(
          `${o.tower} towers, ${o.dragon} dragons, ${o.baron} barons, ${o.rift_herald} heralds, ${o.horde} void grubs`,
          `${o.tower} torres, ${o.dragon} dragones, ${o.baron} barones, ${o.rift_herald} heraldos, ${o.horde} larvas del vacío`,
        )
      : "";
  };
  const items = p.items
    .slice(0, 6)
    .filter(Boolean)
    .map((i) => names.item(i))
    .filter(Boolean)
    .join(", ");
  const facts = gameFacts(d, stats);
  const timeline = stats
    ? [
        stats.cs_diff_10 !== null && p.position !== "UTILITY" ? t(`minions vs my lane opponent at 10 min: ${stats.cs_diff_10}`, `súbditos vs mi rival al min 10: ${stats.cs_diff_10}`) : "",
        stats.gold_diff_15 !== null ? t(`gold vs my lane opponent at 15 min: ${Math.round(stats.gold_diff_15)}`, `oro vs mi rival al min 15: ${Math.round(stats.gold_diff_15)}`) : "",
        stats.team_gold_diff_15 !== null ? t(`my team's gold lead at 15 min: ${Math.round(stats.team_gold_diff_15)}`, `ventaja de oro de mi equipo al min 15: ${Math.round(stats.team_gold_diff_15)}`) : "",
        stats.death_minutes.length ? t(`my deaths at minutes ${stats.death_minutes.map((m) => Math.round(m)).join(", ")}`, `mis muertes en los minutos ${stats.death_minutes.map((m) => Math.round(m)).join(", ")}`) : "",
      ].filter(Boolean)
    : [];
  return [
    t("Context from League Coach (not my question): a finished game I want to review.", "Contexto de League Coach (no es mi pregunta): una partida terminada que quiero revisar."),
    `${matchTitle(d, names.champ, names.role)}. ${queueName(d.queue_id)}, ${duration(d.duration_s)}, ${t("patch", "parche")} ${d.patch}.`,
    t(
      `Me: ${p.kills}/${p.deaths}/${p.assists}, ${p.cs} minions (${perMinute(p.cs, d.duration_s)}/min), ${p.gold} gold, ${p.damage_dealt} damage to champions, ${p.damage_taken} taken, vision score ${p.vision_score}, ${controlWards(p, stats)} control wards, in ${pctText(killShare(d, p))} of my team's kills, ${Math.round(p.time_dead_s)}s dead in ${Math.round(minutes)} min.`,
      `Yo: ${p.kills}/${p.deaths}/${p.assists}, ${p.cs} súbditos (${perMinute(p.cs, d.duration_s)}/min), ${p.gold} de oro, ${p.damage_dealt} de daño a campeones, ${p.damage_taken} recibido, visión ${p.vision_score}, ${controlWards(p, stats)} wards de control, en el ${pctText(killShare(d, p))} de las kills de mi equipo, ${Math.round(p.time_dead_s)}s muerto en ${Math.round(minutes)} min.`,
    ),
    items ? t(`My items: ${items}.`, `Mis objetos: ${items}.`) : "",
    timeline.length ? `${timeline.join("; ")}.` : "",
    facts.good.length ? t(`Went well: ${facts.good.join("; ")}.`, `Salió bien: ${facts.good.join("; ")}.`) : "",
    facts.bad.length ? t(`To improve: ${facts.bad.join("; ")}.`, `A mejorar: ${facts.bad.join("; ")}.`) : "",
    t(`My team: ${team(p.team_id)}.`, `Mi equipo: ${team(p.team_id)}.`),
    t(`Enemy team: ${team(enemy)}.`, `Equipo rival: ${team(enemy)}.`),
    t(`Objectives, my team: ${obj(p.team_id)}. Enemy: ${obj(enemy)}.`, `Objetivos, mi equipo: ${obj(p.team_id)}. Rival: ${obj(enemy)}.`),
    t("Answer in plain text (not JSON), short and direct, as a few bullets.", "Responde en texto normal (no JSON), corto y directo, en unas pocas viñetas."),
  ]
    .filter(Boolean)
    .join("\n");
}
