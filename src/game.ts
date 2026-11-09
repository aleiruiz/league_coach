import { Channel, invoke } from "@tauri-apps/api/core";
import type { ChatEvent, ProviderKind } from "./providers";
import { t } from "./i18n";

export type Champion = {
  id: string;
  name: string;
  title: string;
  tags: string[];
  attack: number;
  magic: number;
  defense: number;
  image: string;
};

export type Rune = { id: number; name: string; short_desc: string; icon: string };
export type RuneTree = { id: number; name: string; icon: string; slots: Rune[][] };
export type Shard = { name: string; short: string; icon: string };

export type GameData = {
  version: string;
  patch: string;
  champions: Champion[];
  rune_trees: RuneTree[];
  /** Stat shard rows, in the app language. */
  shards: Shard[][];
  /** Notice when an older local copy of the patch is used. */
  notice: string | null;
};

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export const ROLES: { id: Role; label: () => string }[] = [
  { id: "top", label: () => "Top" },
  { id: "jungle", label: () => t("Jungle", "Jungla") },
  { id: "mid", label: () => "Mid" },
  { id: "adc", label: () => "ADC" },
  { id: "support", label: () => t("Support", "Soporte") },
];

export type Draft = {
  role: Role;
  champion: string;
  allies: string[];
  enemies: string[];
  lane_opponent: string | null;
  notes: string | null;
};

export type Ref = { name: string; image: string | null; valid: boolean };

export type Card = {
  /** Direct answer to the player's notes, if they wrote any. */
  answer: string | null;
  summary: string;
  starting_items: Ref[];
  core_items: Ref[];
  boots: Ref;
  situational: { item: Ref; when: string }[];
  runes: {
    primary_tree: Ref;
    keystone: Ref;
    primary: Ref[];
    secondary_tree: Ref;
    secondary: Ref[];
    shards: Ref[];
  };
  summoner_spells: Ref[];
  skill_order: { max: string[]; first_levels: string };
  game_plan: { early: string; mid: string; late: string };
  matchup_tips: string[];
  threats: { champion: string; why: string }[];
  caveat: string | null;
  stats: Stat[];
  /** Figures the model gave that weren't in its search results. */
  stats_dropped: number;
  /** The model exposes its search sources (Claude does, Codex doesn't). */
  stats_verifiable: boolean;
};

/** Figure quoted from a stats site, with its source. */
export type Stat = {
  site: string;
  url: string;
  patch: string;
  about: string;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  games: number | null;
  tier: string | null;
  rank: string | null;
  current_patch: boolean;
};

export type Recommendation = {
  card: Card;
  warnings: string[];
  /** Parts of the card that came back empty, in the player's words. */
  incomplete: string[];
  /** Notes the build was requested with. */
  notes: string | null;
  /** Free-text analysis the card comes from. */
  analysis: string;
  /** The card couldn't be built; only the analysis remains. */
  card_error: string | null;
  session_id: string | null;
  patch: string;
  version: string;
  /** There was an automatic correction round. */
  retried: boolean;
};

export function gameData() {
  return invoke<GameData>("game_data");
}

export function recommendBuild(
  kind: ProviderKind,
  draft: Draft,
  requestId: string,
  onEvent: (ev: ChatEvent) => void,
) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<Recommendation>("recommend_build", { kind, draft, requestId, onEvent: channel });
}

/** Filters champions by name, ignoring case and accents. */
export function searchChampions(list: Champion[], query: string): Champion[] {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const q = norm(query);
  if (!q) return list;
  return list.filter((c) => norm(c.name).includes(q));
}
