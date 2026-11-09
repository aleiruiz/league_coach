import { Channel, invoke } from "@tauri-apps/api/core";
import type { ChatEvent, ProviderKind } from "./providers";
import { t } from "./i18n";

export type Region = { id: string; label: string };

export type RiotProfile = {
  game_name: string;
  tag_line: string;
  region: string;
  auto_analyze: boolean;
};

export type GameStats = {
  id: string;
  ended_at: number;
  queue_id: number;
  minutes: number;
  champion: string;
  role: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kill_participation: number;
  cs_per_min: number;
  cs_at_10: number | null;
  opponent: string | null;
  cs_diff_10: number | null;
  gold_diff_15: number | null;
  team_gold_diff_15: number | null;
  vision_per_min: number;
  wards_placed: number;
  wards_killed: number;
  control_wards: number;
  damage_share: number;
  early_deaths: number | null;
  solo_deaths: number | null;
  death_minutes: number[];
  first_item_min: number | null;
};

export type Averages = {
  games: number;
  win_rate: number | null;
  cs_per_min: number | null;
  cs_at_10: number | null;
  cs_diff_10: number | null;
  gold_diff_15: number | null;
  kill_participation: number | null;
  deaths: number | null;
  early_deaths: number | null;
  solo_deaths: number | null;
  vision_per_min: number | null;
  control_wards: number | null;
  damage_share: number | null;
  first_item_min: number | null;
};

export type Count = { name: string; games: number; wins: number };

export type Summary = {
  all: Averages;
  recent: Averages;
  earlier: Averages;
  roles: Count[];
  champions: Count[];
  behind_at_10: [number, number];
  thrown_leads: string[];
};

export type PainPoint = {
  title: string;
  metric: string;
  evidence: string;
  why: string;
  drill: string;
  target: string;
  games: string[];
};

export type SavedReport = {
  created_at: number;
  kind: ProviderKind;
  newest_game: string;
  averages: Averages;
  report: { headline: string; strength: string; pain_points: PainPoint[] };
};

export type HistoryView = {
  configured: boolean;
  games: GameStats[];
  summary: Summary | null;
  latest: SavedReport | null;
  previous: SavedReport | null;
  needs_review: boolean;
};

export const riotAccount = () => invoke<{ profile: RiotProfile; regions: Region[] }>("riot_account");

export const saveRiotAccount = (riotId: string, region: string, autoAnalyze: boolean) =>
  invoke<RiotProfile>("save_riot_account", { riotId, region, autoAnalyze });

export const matchHistory = () => invoke<HistoryView>("match_history");

export function syncMatches(onEvent: (ev: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<{ new_games: number; needs_review: boolean }>("sync_matches", { onEvent: channel });
}

export function reviewMatches(kind: ProviderKind, requestId: string, onEvent: (ev: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<SavedReport>("review_matches", { kind, requestId, onEvent: channel });
}

/** How often the app looks for newly finished games while it's open. */
export const POLL_MS = 5 * 60 * 1000;

export type MetricKey = Exclude<keyof Averages, "games">;

/** Metrics shown on the "My progress" board. `higher`: is a bigger number better? */
export const METRICS: { key: MetricKey; label: () => string; higher: boolean; format: (v: number) => string }[] = [
  { key: "win_rate", label: () => t("Win rate", "Victorias"), higher: true, format: pct },
  { key: "cs_per_min", label: () => t("CS/min", "CS/min"), higher: true, format: (v) => v.toFixed(1) },
  { key: "cs_diff_10", label: () => t("CS diff @10", "Dif. CS @10"), higher: true, format: signed },
  { key: "gold_diff_15", label: () => t("Gold diff @15", "Dif. oro @15"), higher: true, format: signed },
  { key: "kill_participation", label: () => t("Kill participation", "Participación en kills"), higher: true, format: pct },
  { key: "early_deaths", label: () => t("Deaths before 14:00", "Muertes antes del 14:00"), higher: false, format: (v) => v.toFixed(1) },
  { key: "solo_deaths", label: () => t("Solo deaths", "Muertes en solitario"), higher: false, format: (v) => v.toFixed(1) },
  { key: "vision_per_min", label: () => t("Vision/min", "Visión/min"), higher: true, format: (v) => v.toFixed(2) },
  { key: "control_wards", label: () => t("Control wards", "Control wards"), higher: true, format: (v) => v.toFixed(1) },
  { key: "first_item_min", label: () => t("First item (min)", "Primer ítem (min)"), higher: false, format: (v) => v.toFixed(1) },
];

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function signed(v: number): string {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * Last 5 games compared with the ones before. Small changes are "flat" so
 * noise doesn't read as progress.
 */
export function trend(recent: number | null, earlier: number | null, higher: boolean): "up" | "down" | "flat" | null {
  if (recent === null || earlier === null) return null;
  const scale = Math.max(Math.abs(earlier), Math.abs(recent), 1e-6);
  if (Math.abs(recent - earlier) / scale < 0.08) return "flat";
  return recent > earlier === higher ? "up" : "down";
}

const ROLE_NAMES: Record<string, [string, string]> = {
  TOP: ["Top", "Top"],
  JUNGLE: ["Jungle", "Jungla"],
  MIDDLE: ["Mid", "Mid"],
  BOTTOM: ["ADC", "ADC"],
  UTILITY: ["Support", "Soporte"],
};

export function roleName(role: string): string {
  const r = ROLE_NAMES[role];
  return r ? t(r[0], r[1]) : role || "?";
}

/** "Name#TAG" from the saved profile, or "" if there isn't one. */
export function riotIdOf(p: RiotProfile): string {
  return p.game_name && p.tag_line ? `${p.game_name}#${p.tag_line}` : "";
}
