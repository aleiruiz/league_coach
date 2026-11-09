import { Channel, invoke } from "@tauri-apps/api/core";
import type { ChatEvent, ProviderKind } from "./providers";

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

export type GameData = {
  version: string;
  patch: string;
  champions: Champion[];
  /** Aviso cuando se usa una copia local más vieja del parche. */
  notice: string | null;
};

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export const ROLES: { id: Role; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "jungle", label: "Jungla" },
  { id: "mid", label: "Mid" },
  { id: "adc", label: "ADC" },
  { id: "support", label: "Soporte" },
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
  };
  summoner_spells: Ref[];
  skill_order: { max: string[]; first_levels: string };
  game_plan: { early: string; mid: string; late: string };
  matchup_tips: string[];
  threats: { champion: string; why: string }[];
  caveat: string | null;
};

export type Recommendation = {
  card: Card;
  warnings: string[];
  session_id: string | null;
  patch: string;
  version: string;
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

/** Filtra campeones por nombre ignorando mayúsculas y acentos. */
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
