import type { Champion, Draft, Role } from "./game";

/** Estado editable de la pantalla Partida (antes de convertirlo en `Draft`). */
export type DraftState = {
  role: Role;
  me: string | null;
  allies: (string | null)[];
  enemies: (string | null)[];
  /** Rival de línea: siempre es uno de `enemies` o null. */
  lane: string | null;
};

export type Slot = { team: "me" | "ally" | "enemy"; index: number };

export const EMPTY_DRAFT: DraftState = {
  role: "top",
  me: null,
  allies: [null, null, null, null],
  enemies: [null, null, null, null, null],
  lane: null,
};

const put = (list: (string | null)[], i: number, v: string | null) => list.map((x, j) => (j === i ? v : x));

/** Pone (o quita, con `id` null) un campeón en una casilla. */
export function setSlot(s: DraftState, slot: Slot, id: string | null): DraftState {
  if (slot.team === "me") return { ...s, me: id };
  if (slot.team === "ally") return { ...s, allies: put(s.allies, slot.index, id) };
  const old = s.enemies[slot.index];
  const enemies = put(s.enemies, slot.index, id);
  // Si se reemplaza o quita al rival de línea, la estrella se va con él.
  // The lane opponent is set only in step 3 (setLane), never guessed.
  const lane = old === s.lane ? null : s.lane;
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
    // Free-text notes moved to the Ask panel; the build request has none.
    notes: null,
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
    a.lane_opponent === b.lane_opponent
  );
}

/**
 * Estimación con las valoraciones 0-10 de Riot. MISMOS umbrales que `damage`
 * y `team_profile` en src-tauri/src/recommend.rs: si cambias uno, cambia el otro.
 */
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

/** Champions of the current champ select or game, as `current_game` returns them. */
export type LiveDraft = {
  source: "champ_select" | "game";
  role: Role | null;
  me: string | null;
  allies: string[];
  enemies: string[];
};

/**
 * Fills the draft with what the client or Riot reports. A team the game
 * doesn't show yet (enemies early in champ select) keeps what was typed;
 * the lane opponent stays only if it's still among the enemies (it's never
 * guessed). Notes are kept. Unknown champion ids (a champion newer than the
 * loaded patch data) are left out.
 */
export function applyLive(s: DraftState, live: LiveDraft, known: (id: string) => boolean): DraftState {
  const ok = (l: string[]) => l.filter(known);
  const fill = (l: string[], n: number) => Array.from({ length: n }, (_, i) => l[i] ?? null);
  const allies = ok(live.allies);
  const enemies = ok(live.enemies);
  const me = live.me && known(live.me) ? live.me : s.me;
  // A kept (typed) team drops any champion the game now places elsewhere:
  // one champion can't be on both teams.
  const placed = new Set([me, ...allies, ...enemies].filter(Boolean));
  const keep = (l: (string | null)[]) => l.map((x) => (x && placed.has(x) ? null : x));
  const next: DraftState = {
    ...s,
    role: live.role ?? s.role,
    me,
    allies: allies.length ? fill(allies, s.allies.length) : keep(s.allies),
    enemies: enemies.length ? fill(enemies, s.enemies.length) : keep(s.enemies),
  };
  return { ...next, lane: next.lane && next.enemies.includes(next.lane) ? next.lane : null };
}

/**
 * Step 3 of Next game: who you lane against. The champion goes into the enemy
 * team (in the old lane opponent's slot, or the first free one) and is marked
 * as the lane opponent. `null` takes the lane opponent out of the enemy team.
 */
export function setLane(s: DraftState, id: string | null): DraftState {
  const at = s.lane ? s.enemies.indexOf(s.lane) : -1;
  if (id === null) {
    return at < 0 ? { ...s, lane: null } : { ...s, enemies: put(s.enemies, at, null), lane: null };
  }
  if (s.enemies.includes(id)) return { ...s, lane: id };
  const free = s.enemies.indexOf(null);
  const i = at >= 0 ? at : free >= 0 ? free : s.enemies.length - 1;
  return { ...s, enemies: put(s.enemies, i, id), lane: id };
}

/** The other enemy slots (all but the lane opponent's), with their index in `enemies`. */
export function otherEnemies(s: DraftState): { id: string | null; index: number }[] {
  const at = s.lane ? s.enemies.indexOf(s.lane) : -1;
  // Without a lane opponent, the first slot is kept for step 3.
  const skip = at >= 0 ? at : s.enemies.indexOf(null);
  return s.enemies.map((id, index) => ({ id, index })).filter((x) => x.index !== skip);
}

/** Champ-select order of the rows: top, jungle, mid, ADC, support. */
export const ROLE_ORDER: Role[] = ["top", "jungle", "mid", "adc", "support"];

/** The roles of the four allies' rows, in order: every role but yours. */
export function allyRoles(role: Role): Role[] {
  return ROLE_ORDER.filter((r) => r !== role);
}

/** Row of the enemy team that plays your role (your lane, by position). */
export function laneRow(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

/**
 * Picks an enemy into a row. Picked into your role's row, it becomes your
 * lane opponent unless another enemy was already marked as one: the player
 * put it in their lane themselves, so it isn't a guess.
 */
export function setEnemy(s: DraftState, index: number, id: string | null): DraftState {
  const old = s.enemies[index];
  const next = setSlot(s, { team: "enemy", index }, id);
  if (id && index === laneRow(s.role) && (s.lane === null || s.lane === old)) return { ...next, lane: id };
  return next;
}

/**
 * Changes your role keeping everyone in their row: the ally who was in the
 * new role's row moves to your old one. A lane opponent that was the enemy
 * in your old row follows you to the new row (or clears when it's empty);
 * one marked by hand in another row stays.
 */
export function changeRole(s: DraftState, role: Role): DraftState {
  if (role === s.role) return s;
  const byRole = new Map(allyRoles(s.role).map((r, i) => [r, s.allies[i]]));
  const allies = allyRoles(role).map((r) => (r === s.role ? (byRole.get(role) ?? null) : (byRole.get(r) ?? null)));
  const followed = s.lane !== null && s.enemies[laneRow(s.role)] === s.lane;
  const lane = followed ? s.enemies[laneRow(role)] : s.lane;
  return { ...s, role, allies, lane };
}
