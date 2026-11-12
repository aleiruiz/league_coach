import { Channel, invoke } from "@tauri-apps/api/core";
import type { ChatEvent } from "./providers";

/** One game as the Games screen shows it: all ten players and both teams. */
export type MatchDetail = {
  id: string;
  /** Community patch name, e.g. "26.22". */
  patch: string;
  queue_id: number;
  duration_s: number;
  /** Unix time in ms. */
  ended_at: number;
  /** Blue (100) first. */
  teams: TeamDetail[];
  /** Blue team first, then red; Riot's order (top to support) inside each. */
  players: PlayerDetail[];
};

export type TeamDetail = {
  team_id: number;
  win: boolean;
  /** Numeric champion ids (`Champion.key`). */
  bans: number[];
  objectives: Objectives;
};

export type Objectives = {
  champion: number;
  tower: number;
  inhibitor: number;
  dragon: number;
  baron: number;
  rift_herald: number;
  horde: number;
  atakhan: number;
  first_blood: boolean;
  first_tower: boolean;
  first_dragon: boolean;
  first_baron: boolean;
};

export type PlayerDetail = {
  name: string;
  tag: string;
  is_me: boolean;
  team_id: number;
  /** TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY (or empty). */
  position: string;
  champion: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage_dealt: number;
  damage_taken: number;
  vision_score: number;
  wards_placed: number;
  wards_killed: number;
  control_wards: number;
  /** Seven slots, the last is the trinket; 0 is empty. */
  items: number[];
  /** Numeric summoner spell ids (`Spell.key`). */
  spells: number[];
  primary_style: number;
  secondary_style: number;
  /** Keystone first, then the other primary runes, then the secondary ones. */
  runes: number[];
  shards: number[];
  largest_multikill: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  first_blood: boolean;
  turret_kills: number;
  time_dead_s: number;
  solo_kills: number | null;
  kill_participation: number | null;
  lane_cs_10: number | null;
  turret_plates: number | null;
  max_cs_lead: number | null;
  epic_steals: number | null;
};

export type GamesView = {
  configured: boolean;
  /** Newest first; only games whose details are stored. */
  games: MatchDetail[];
  /** Stored games still without details (synced before details were kept). */
  missing: number;
  /** Most games kept: "Load older games" stops there. */
  keep: number;
};

export const matchDetails = () => invoke<GamesView>("match_details");

/** Reads the details of stored games that don't have them yet; returns how many. */
export function fillMatchDetails(onEvent: (ev: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("fill_match_details", { onEvent: channel });
}
