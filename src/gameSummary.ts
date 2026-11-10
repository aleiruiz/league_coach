import { GameStats, MetricKey, METRICS } from "./history";

/** A number of one game next to the player's usual value in the same role. */
export type Compared = {
  key: MetricKey;
  label: string;
  value: number;
  usual: number;
  verdict: "better" | "worse";
  /** How far from usual, relative (0.3 = 30%). Used to rank. */
  gap: number;
};

/** The game's own value for a board metric (win rate has none). */
export function gameValue(g: GameStats, key: MetricKey): number | null {
  switch (key) {
    case "win_rate":
      return null;
    case "deaths":
      return g.deaths;
    default:
      return g[key];
  }
}

/** CS stats: not a support's job, so never compared for one. */
export const CS_KEYS: ReadonlySet<MetricKey> = new Set<MetricKey>([
  "cs_per_min",
  "cs_diff_10",
]);

/** Stats counted in whole numbers per game. */
export const COUNTS: ReadonlySet<MetricKey> = new Set<MetricKey>([
  "deaths",
  "early_deaths",
  "solo_deaths",
  "control_wards",
]);

/** Fewer than this many other games in the role: no comparison (too noisy). */
export const MIN_PEERS = 3;

/** Other games of the same role, the ones this game is compared with. */
export function peersOf(g: GameStats, games: GameStats[]): GameStats[] {
  return games.filter((o) => o.id !== g.id && o.role === g.role);
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * What stood out in this game against the player's other games in the same
 * role: the biggest gaps first, at least 15% away from usual (smaller gaps
 * are noise from one game). Nothing if there are too few games to compare;
 * each stat also needs MIN_PEERS games that have it.
 */
export function standouts(
  g: GameStats,
  games: GameStats[],
): { better: Compared[]; worse: Compared[] } {
  const peers = peersOf(g, games);
  if (peers.length < MIN_PEERS) return { better: [], worse: [] };
  const all: Compared[] = [];
  for (const m of METRICS) {
    // A support is never judged on CS (same rule as the review).
    if (g.role === "UTILITY" && CS_KEYS.has(m.key)) continue;
    const value = gameValue(g, m.key);
    if (value === null) continue;
    // Each stat needs its own MIN_PEERS games (CS vs opponent is missing
    // when Riot couldn't pair a lane opponent, for example).
    const known = peers
      .map((p) => gameValue(p, m.key))
      .filter((v): v is number => v !== null);
    if (known.length < MIN_PEERS) continue;
    const usual = mean(known)!;
    // Whole-number counts: 1 death vs 0.8 usual is not a real difference.
    if (COUNTS.has(m.key) && Math.abs(value - usual) < 1) continue;
    // Differences (CS/gold vs opponent) sit around 0: compare against a
    // floor so +3 vs +1 isn't "200% better". Counts (deaths) get a floor of 1.
    const floor =
      m.key === "cs_diff_10"
        ? 25
        : m.key === "gold_diff_15"
          ? 1000
          : m.key.endsWith("deaths") || m.key === "control_wards"
            ? 1
            : 1e-6;
    const gap = Math.abs(value - usual) / Math.max(Math.abs(usual), floor);
    if (gap < 0.15) continue;
    all.push({
      key: m.key,
      label: m.label(),
      value,
      usual,
      verdict: value > usual === m.higher ? "better" : "worse",
      gap,
    });
  }
  all.sort((a, b) => b.gap - a.gap);
  return {
    better: all.filter((c) => c.verdict === "better").slice(0, 3),
    worse: all.filter((c) => c.verdict === "worse").slice(0, 3),
  };
}

/** (Kills + assists) / deaths; null for a deathless ("perfect") game. */
export function kda(g: GameStats): number | null {
  return g.deaths === 0 ? null : (g.kills + g.assists) / g.deaths;
}

/** "12:30" for 12.5 minutes. */
export function clock(min: number): string {
  const s = Math.max(0, Math.round(min * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
