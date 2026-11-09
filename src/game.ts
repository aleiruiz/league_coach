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

export type Rune = { id: number; name: string; short_desc: string; icon: string };
export type RuneTree = { id: number; name: string; icon: string; slots: Rune[][] };

export type GameData = {
  version: string;
  patch: string;
  champions: Champion[];
  rune_trees: RuneTree[];
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
  /** Respuesta directa a las notas del jugador, si las escribió. */
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
  /** Cifras que el modelo dio pero no salían en los resultados de su búsqueda. */
  stats_dropped: number;
  /** El modelo expone las fuentes de su búsqueda (Claude sí, Codex no). */
  stats_verifiable: boolean;
};

/** Cifra citada de un sitio de estadísticas, con su fuente. */
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

/** Fragmentos de estadística por fila (igual que en ddragon.rs): [nombre, etiqueta corta]. */
export const SHARD_ROWS: [string, string][][] = [
  [
    ["Fuerza adaptable", "Fuerza"],
    ["Velocidad de ataque", "Vel. ataque"],
    ["Velocidad de habilidades", "Vel. habilid."],
  ],
  [
    ["Fuerza adaptable", "Fuerza"],
    ["Velocidad de movimiento", "Vel. mov."],
    ["Vida escalable", "Vida esc."],
  ],
  [
    ["Vida", "Vida"],
    ["Tenacidad y resistencia a ralentizaciones", "Tenacidad"],
    ["Vida escalable", "Vida esc."],
  ],
];

export type Recommendation = {
  card: Card;
  warnings: string[];
  /** Partes de la tarjeta que llegaron vacías, en palabras para el jugador. */
  incomplete: string[];
  /** Notas con las que se pidió la build. */
  notes: string | null;
  /** Análisis en texto libre del que sale la tarjeta. */
  analysis: string;
  session_id: string | null;
  patch: string;
  version: string;
  /** Hubo una ronda de corrección automática. */
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
