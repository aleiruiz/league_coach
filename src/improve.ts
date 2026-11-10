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
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has("control ward", "pink", "centinela de control")) return "control_wards";
  if (has("vision", "visión", "ward")) return "vision_per_min";
  if (has("solo")) return "solo_deaths";
  if (has("death", "muerte", "die")) return has("14", "early", "temprana", "before", "antes") ? "early_deaths" : null;
  if (has("first item", "primer ítem", "primer item", "item timing")) return "first_item_min";
  if (has("kill participation", "kp", "participación")) return "kill_participation";
  if (has("gold", "oro")) return "gold_diff_15";
  if (has("cs", "minion", "farm", "súbdito", "subdito")) {
    if (has("/min", "per min", "por min")) return "cs_per_min";
    return "cs_diff_10";
  }
  if (has("win rate", "victorias")) return "win_rate";
  return null;
}

/** A number in plain words: "6 behind", "1.3 per game", "62%". */
export function plainValue(key: MetricKey, v: number): string {
  const n = Math.round(Math.abs(v));
  switch (key) {
    case "cs_diff_10":
      return v <= -0.5 ? t(`${n} behind`, `${n} por detrás`) : v >= 0.5 ? t(`${n} ahead`, `${n} por delante`) : t("even", "parejo");
    case "gold_diff_15":
      return v <= -50
        ? t(`${n.toLocaleString()} gold behind`, `${n.toLocaleString()} de oro por detrás`)
        : v >= 50
          ? t(`${n.toLocaleString()} gold ahead`, `${n.toLocaleString()} de oro por delante`)
          : t("even", "parejo");
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
