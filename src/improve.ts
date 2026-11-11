import { GameStats, MetricKey, METRICS, Summary } from "./history";
import { gameValue } from "./gameSummary";
import { t } from "./i18n";

/**
 * The board metric a review point is measured by. The review names it in
 * its own words ("CS diff at 10", "deaths before 14:00"), so this matches
 * keywords; null when it's something the board doesn't track.
 */
export function metricFor(text: string): MetricKey | null {
  const s = text.toLowerCase();
  // Whole words only: "toward" isn't a ward, Spanish "solo" ("only") isn't a solo death.
  const has = (...w: string[]) => w.some((x) => new RegExp(`(^|[^\\p{L}])${x}($|[^\\p{L}])`, "u").test(s));
  if (has("control wards?", "pinks?", "centinelas? de control", "wards? de control")) return "control_wards";
  if (has("vision", "visión", "wards?", "warding")) return "vision_per_min";
  if (has("solo deaths?", "solo kills?", "en solitario", "1v1", "1 ?vs ?1")) return "solo_deaths";
  if (has("deaths?", "muertes?", "dying", "die", "dies")) {
    return has("14", "14:00", "early", "tempranas?", "before", "antes", "laning") ? "early_deaths" : null;
  }
  if (has("first item", "primer [íi]tem", "item timing")) return "first_item_min";
  if (has("kill participation", "kp", "participación")) return "kill_participation";
  if (has("gold", "oro")) return "gold_diff_15";
  if (has("cs", "minions?", "farm", "farming", "súbditos?", "subditos?", "last-?hit(ting)?")) {
    if (has("cs/min", "per min(ute)?", "por minuto", "cs per minute")) return "cs_per_min";
    return "cs_diff_10";
  }
  if (has("win rate", "victorias")) return "win_rate";
  return null;
}

/**
 * The metric of a review point, from its metric name and its title. When the
 * two point at different metrics, none: a wrong number is worse than no number.
 */
export function pointMetric(p: { metric: string; title: string }): MetricKey | null {
  const m = metricFor(p.metric);
  const t = metricFor(p.title);
  if (m && t && m !== t) return null;
  return m ?? t;
}

/**
 * The review cites games as "G2"; the screen names them the way the player
 * remembers them. `refs[i]` is the name of G(i+1); unknown refs stay.
 */
export function nameRefs(text: string, refs: string[]): string {
  // A code we can't name (an older game no longer stored) is never shown raw.
  return text.replace(/\bG(\d{1,2})\b/g, (_, n) => refs[Number(n) - 1] ?? t("an older game", "una partida anterior"));
}

/** A number in plain words: "6 behind", "1.3 per game", "62%". */
export function plainValue(key: MetricKey, v: number): string {
  switch (key) {
    case "early_deaths":
    case "solo_deaths":
    case "control_wards":
      return t(`${v.toFixed(1).replace(/\.0$/, "")} per game`, `${v.toFixed(1).replace(/\.0$/, "")} por partida`);
    case "first_item_min":
      return t(`minute ${v.toFixed(1)}`, `minuto ${v.toFixed(1)}`);
    default:
      return METRICS.find((m) => m.key === key)!.format(v);
  }
}

/** The metric's own value: all games and the last five. */
export function focusNumbers(key: MetricKey, s: Summary | null): { all: number; recent: number | null } | null {
  const all = s?.all[key];
  if (all === null || all === undefined) return null;
  return { all, recent: s!.recent.games > 0 ? s!.recent[key] : null };
}

/** The cited games where the metric was worst, worst first. */
export function worstGames(key: MetricKey, ids: string[], games: GameStats[], n = 2): { g: GameStats; v: number }[] {
  const higher = METRICS.find((m) => m.key === key)!.higher;
  return ids
    .map((id) => games.find((g) => g.id === id))
    .filter((g): g is GameStats => !!g)
    .map((g) => ({ g, v: gameValue(g, key) }))
    .filter((x): x is { g: GameStats; v: number } => x.v !== null)
    .sort((a, b) => (higher ? a.v - b.v : b.v - a.v))
    .slice(0, n);
}
