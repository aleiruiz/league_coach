import type { Champion, Draft, Role } from "./game";

/** Estado editable de la pantalla Partida (antes de convertirlo en `Draft`). */
export type DraftState = {
  role: Role;
  me: string | null;
  allies: (string | null)[];
  enemies: (string | null)[];
  /** Rival de línea: siempre es uno de `enemies` o null. */
  lane: string | null;
  notes: string;
};

export type Slot = { team: "me" | "ally" | "enemy"; index: number };

export const EMPTY_DRAFT: DraftState = {
  role: "top",
  me: null,
  allies: [null, null, null, null],
  enemies: [null, null, null, null, null],
  lane: null,
  notes: "",
};

const put = (list: (string | null)[], i: number, v: string | null) => list.map((x, j) => (j === i ? v : x));

/** Pone (o quita, con `id` null) un campeón en una casilla. */
export function setSlot(s: DraftState, slot: Slot, id: string | null): DraftState {
  if (slot.team === "me") return { ...s, me: id };
  if (slot.team === "ally") return { ...s, allies: put(s.allies, slot.index, id) };
  const old = s.enemies[slot.index];
  const enemies = put(s.enemies, slot.index, id);
  // Si se reemplaza o quita al rival de línea, la estrella se va con él.
  let lane = old === s.lane ? null : s.lane;
  // El primer rival que se elige queda como rival de línea (se puede cambiar).
  if (id && !lane && s.enemies.every((e) => !e)) lane = id;
  return { ...s, enemies, lane };
}

export function toggleLane(s: DraftState, id: string): DraftState {
  if (!s.enemies.includes(id)) return s;
  return { ...s, lane: s.lane === id ? null : id };
}

export function taken(s: DraftState): Set<string> {
  return new Set([s.me, ...s.allies, ...s.enemies].filter((x): x is string => !!x));
}

export function toDraft(s: DraftState): Draft | null {
  if (!s.me) return null;
  const ids = (l: (string | null)[]) => l.filter((x): x is string => !!x);
  return {
    role: s.role,
    champion: s.me,
    allies: ids(s.allies),
    enemies: ids(s.enemies),
    lane_opponent: s.lane && s.enemies.includes(s.lane) ? s.lane : null,
    notes: s.notes.trim() || null,
  };
}

/** ¿Siguen siendo la misma partida? (el orden de las casillas no importa). */
export function sameDraft(a: Draft | null, b: Draft | null): boolean {
  if (!a || !b) return a === b;
  const set = (l: string[]) => [...l].sort().join(",");
  return (
    a.role === b.role &&
    a.champion === b.champion &&
    set(a.allies) === set(b.allies) &&
    set(a.enemies) === set(b.enemies) &&
    a.lane_opponent === b.lane_opponent &&
    a.notes === b.notes
  );
}

/** Igual que `damage` en recommend.rs: estimación con las valoraciones 0-10 de Riot. */
export function damageType(c: Champion): "ad" | "ap" | "mixed" {
  if (c.magic >= c.attack + 3) return "ap";
  if (c.attack >= c.magic + 3) return "ad";
  return "mixed";
}

export function damageProfile(champs: Champion[]) {
  const count = (t: string) => champs.filter((c) => damageType(c) === t).length;
  const ad = count("ad");
  const ap = count("ap");
  const mixed = count("mixed");
  // Un campeón mixto cuenta mitad y mitad en los porcentajes.
  const total = champs.length || 1;
  const adPct = Math.round(((ad + mixed / 2) / total) * 100);
  const apPct = Math.round(((ap + mixed / 2) / total) * 100);
  const tanks = champs.filter((c) => c.defense >= 7 || c.tags.includes("Tank")).length;
  return { ad, ap, mixed, adPct, apPct, tanks };
}
