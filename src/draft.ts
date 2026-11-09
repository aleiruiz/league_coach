import type { Draft, Role } from "./game";

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
  // Si se reemplaza o quita al rival de línea, la estrella se va con él.
  return { ...s, enemies: put(s.enemies, slot.index, id), lane: old === s.lane ? null : s.lane };
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
