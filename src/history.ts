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
  in_wins: Averages;
  in_losses: Averages;
  roles: Count[];
  champions: Count[];
  behind_at_10: [number, number];
  thrown_leads: string[];
  counts: [string, number, number][];
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
  report: { headline: string; strength: string; caveat: string; pain_points: PainPoint[] };
  /** Match ids in G order at review time (G1 first). */
  game_refs: string[];
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

/** Error from `sync_matches`. `setup`: something to fix in Settings. */
export type SyncError = { kind: "setup" | "transient"; message: string };

export function asSyncError(e: unknown): SyncError {
  if (e && typeof e === "object" && "message" in e && "kind" in e) {
    const x = e as { kind: unknown; message: unknown };
    return { kind: x.kind === "setup" ? "setup" : "transient", message: String(x.message) };
  }
  return { kind: "transient", message: String(e) };
}

export function reviewMatches(kind: ProviderKind, requestId: string, onEvent: (ev: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<SavedReport>("review_matches", { kind, requestId, onEvent: channel });
}

/** How often the app looks for newly finished games while it's open. */
export const POLL_MS = 5 * 60 * 1000;

export type MetricKey = Exclude<keyof Averages, "games">;

/** Metrics shown on the "Improve" board. `higher`: is a bigger number better? */
export const METRICS: { key: MetricKey; label: () => string; higher: boolean; format: (v: number) => string }[] = [
  { key: "win_rate", label: () => t("Games won", "Partidas ganadas"), higher: true, format: pct },
  { key: "cs_per_min", label: () => t("Minions per minute", "Súbditos por minuto"), higher: true, format: (v) => v.toFixed(1) },
  { key: "cs_diff_10", label: () => t("Minions vs your opponent at 10 min", "Súbditos vs tu rival al minuto 10"), higher: true, format: signed },
  { key: "gold_diff_15", label: () => t("Gold vs your opponent at 15 min", "Oro vs tu rival al minuto 15"), higher: true, format: signed },
  { key: "kill_participation", label: () => t("Share of your team's kills you were in", "Parte de las kills de tu equipo en las que participaste"), higher: true, format: pct },
  { key: "early_deaths", label: () => t("Deaths before minute 14", "Muertes antes del minuto 14"), higher: false, format: (v) => v.toFixed(1) },
  { key: "solo_deaths", label: () => t("Deaths to a single enemy", "Muertes contra un solo rival"), higher: false, format: (v) => v.toFixed(1) },
  { key: "vision_per_min", label: () => t("Vision score per minute", "Puntuación de visión por minuto"), higher: true, format: (v) => v.toFixed(2) },
  { key: "control_wards", label: () => t("Control wards per game", "Control wards por partida"), higher: true, format: (v) => v.toFixed(1) },
  { key: "first_item_min", label: () => t("Minute of your first item", "Minuto de tu primer ítem"), higher: false, format: (v) => v.toFixed(1) },
];

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function signed(v: number): string {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : `${r}`;
}

export type Trend = {
  /** Which way the number moved. */
  arrow: "▲" | "▼" | "■";
  /** Whether that's good for the player (fewer deaths going down is better). */
  verdict: "better" | "worse" | "flat";
};

/**
 * Last 5 games compared with the ones before. Small changes are "flat" so
 * noise doesn't read as progress.
 */
export function trend(recent: number | null, earlier: number | null, higher: boolean): Trend | null {
  if (recent === null || earlier === null) return null;
  const scale = Math.max(Math.abs(earlier), Math.abs(recent), 1e-6);
  if (Math.abs(recent - earlier) / scale < 0.08) return { arrow: "■", verdict: "flat" };
  const rose = recent > earlier;
  return { arrow: rose ? "▲" : "▼", verdict: rose === higher ? "better" : "worse" };
}

/**
 * What's wrong with a Riot ID ("Name#TAG"), in words the player can act on,
 * or null if it looks right. Same rules as `parse_riot_id` in riot.rs.
 */
export function riotIdProblem(raw: string): string | null {
  const s = raw.trim();
  const hash = s.lastIndexOf("#");
  if (hash < 0) {
    return t(
      "Add your tag after a #, like Name#TAG (you can see it in your League client profile).",
      "Añade tu tag después de un #, como Nombre#TAG (lo ves en tu perfil del cliente de League).",
    );
  }
  const name = s.slice(0, hash).trim();
  const tag = s.slice(hash + 1).trim();
  const nameLen = [...name].length;
  const tagLen = [...tag].length;
  if (name.includes("#")) return t("Use a single # between name and tag.", "Usa un solo # entre el nombre y el tag.");
  if (nameLen < 3 || nameLen > 16) {
    return t(
      `The name before # has 3 to 16 characters (yours has ${nameLen}).`,
      `El nombre antes del # tiene de 3 a 16 caracteres (el tuyo tiene ${nameLen}).`,
    );
  }
  if (tagLen < 3 || tagLen > 5) {
    return t(
      `The tag after # has 3 to 5 characters (yours has ${tagLen}).`,
      `El tag después del # tiene de 3 a 5 caracteres (el tuyo tiene ${tagLen}).`,
    );
  }
  if (!/^[\p{L}\p{N}]+$/u.test(tag)) {
    return t(
      "The tag after # can only have letters and numbers.",
      "El tag después del # solo puede tener letras y números.",
    );
  }
  return null;
}

/** Client-side shape check before saving: "Name#TAG". */
export function looksLikeRiotId(s: string): boolean {
  return riotIdProblem(s) === null;
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

export type RankEntry = {
  queue_type: string;
  tier: string;
  rank: string;
  league_points: number;
  wins: number;
  losses: number;
};

export type SummonerPreview = {
  game_name: string;
  tag_line: string;
  region: string;
  level: number;
  icon_url: string | null;
  /** null: Riot didn't return the rank this time (not the same as unranked). */
  ranks: RankEntry[] | null;
};

/** Exact Riot ID lookup (Riot has no name search). */
export const lookupSummoner = (riotId: string, region: string) =>
  invoke<SummonerPreview>("lookup_summoner", { riotId, region });
