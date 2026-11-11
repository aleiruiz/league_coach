// What the Games list shows for each game, worked out from the stored details.
// Pure functions: the screen only lays them out.

import type { MatchDetail, PlayerDetail } from "./games";
import type { GameStats } from "./history";
import { t } from "./i18n";

const QUEUES: Record<number, [string, string]> = {
  400: ["Normal Draft", "Normal (reclutamiento)"],
  420: ["Ranked Solo/Duo", "Clasificatoria Solo/Dúo"],
  430: ["Normal Blind", "Normal (a ciegas)"],
  440: ["Ranked Flex", "Clasificatoria Flexible"],
  480: ["Swiftplay", "Partida rápida"],
  490: ["Quickplay", "Juego rápido"],
};

export const RANKED_QUEUES = [420, 440];

export function queueName(q: number): string {
  const n = QUEUES[q];
  return n ? t(n[0], n[1]) : t("Summoner's Rift", "Grieta del Invocador");
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
  const p = me(d);
  if (!p) return { good: [], bad: [] };
  const minutes = d.duration_s / 60;
  const support = p.position === "UTILITY";
  const good: string[] = [];
  const bad: string[] = [];
  const multi = Math.min(p.largest_multikill, 5);
  if (multi >= 3) good.push(t(...MULTI[multi]));
  if (p.deaths === 0) good.push(t("No deaths", "Sin muertes"));
  if (d.players.every((x) => x.gold <= p.gold)) good.push(t("Most gold in the game", "Más oro de la partida"));
  if (d.players.every((x) => x.damage_dealt <= p.damage_dealt)) {
    good.push(t("Most damage in the game", "Más daño de la partida"));
  } else if (d.players.filter((x) => x.team_id === p.team_id).every((x) => x.damage_dealt <= p.damage_dealt)) {
    good.push(t("Most damage on your team", "Más daño de tu equipo"));
  }
  const cs10 = support ? null : (stats?.cs_diff_10 ?? null);
  if (cs10 !== null && cs10 >= 10) good.push(t(`${cs10} minions ahead at 10 min`, `${cs10} súbditos arriba al min 10`));
  if (cs10 !== null && cs10 <= -10) bad.push(t(`${-cs10} minions behind at 10 min`, `${-cs10} súbditos abajo al min 10`));
  const early = stats?.early_deaths ?? null;
  if (early === 0 && minutes >= 14 && p.deaths > 0) good.push(t("No deaths before minute 14", "Sin muertes antes del min 14"));
  if (early !== null && early >= 2) bad.push(t(`${early} deaths before minute 14`, `${early} muertes antes del min 14`));
  const share = killShare(d, p);
  const kills = teamKills(d, p.team_id);
  if (share >= 0.6) good.push(t(`In ${pctText(share)} of kills`, `En el ${pctText(share)} de las bajas`));
  if (share < 0.35 && kills >= 10) bad.push(t(`In only ${pctText(share)} of kills`, `Solo en el ${pctText(share)} de las bajas`));
  if (p.control_wards === 0 && minutes >= 15) bad.push(t("0 control wards", "0 guardianes de control"));
  if (p.deaths >= 8) bad.push(t(`${p.deaths} deaths`, `${p.deaths} muertes`));
  // Three at most: the first of each side, then the rest of what went well,
  // then the rest to improve.
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
