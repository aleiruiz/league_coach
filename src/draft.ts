import type { Champion, Draft, Role } from "./game";

/** Estado editable de la pantalla Partida (antes de convertirlo en `Draft`). */
export type DraftState = {
  role: Role;
  me: string | null;
  allies: (string | null)[];
  enemies: (string | null)[];
  /**
   * Lane opponent marked by hand: always one of `enemies`, or null. Without
   * one, it's the enemy in your role's row (see `laneOpponent`).
   */
  lane: string | null;
  /**
   * Champions whose role isn't known: filled from a live list in pick order
   * (enemies in champ select, everyone from Spectator). Their row isn't their
   * role, so it isn't labeled with one and isn't anyone's lane.
   */
  unplaced: { allies: boolean[]; enemies: boolean[] };
};

export type Slot = { team: "me" | "ally" | "enemy"; index: number };

export const EMPTY_DRAFT: DraftState = {
  role: "top",
  me: null,
  allies: [null, null, null, null],
  enemies: [null, null, null, null, null],
  lane: null,
  unplaced: { allies: [false, false, false, false], enemies: [false, false, false, false, false] },
};

const put = <T,>(list: T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x));

/** Pone (o quita, con `id` null) un campeón en una casilla. */
export function setSlot(s: DraftState, slot: Slot, id: string | null): DraftState {
  if (slot.team === "me") return { ...s, me: id };
  // Picked by hand into a row: that row is now the champion's role.
  if (slot.team === "ally") {
    return {
      ...s,
      allies: put(s.allies, slot.index, id),
      unplaced: { ...s.unplaced, allies: put(s.unplaced.allies, slot.index, false) },
    };
  }
  const old = s.enemies[slot.index];
  const enemies = put(s.enemies, slot.index, id);
  // Replacing or removing the marked lane opponent drops the mark.
  const lane = old === s.lane ? null : s.lane;
  return { ...s, enemies, lane, unplaced: { ...s.unplaced, enemies: put(s.unplaced.enemies, slot.index, false) } };
}

/**
 * Who you lane against, the one answer every part of the screen shows: the
 * enemy marked by hand, else the enemy in your role's row (when its role is
 * known), else nobody.
 */
export function laneOpponent(s: DraftState): string | null {
  if (s.lane && s.enemies.includes(s.lane)) return s.lane;
  const row = laneRow(s.role);
  return s.unplaced.enemies[row] ? null : s.enemies[row];
}

/** "Set as my lane": marks an enemy as your lane opponent (the one across from you needs no mark). */
export function markLane(s: DraftState, id: string): DraftState {
  if (!s.enemies.includes(id)) return s;
  const across = laneRow(s.role);
  return { ...s, lane: s.enemies[across] === id && !s.unplaced.enemies[across] ? null : id };
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
    lane_opponent: laneOpponent(s),
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
  /** Champ select only: each ally's assigned role, in the order of `allies` (null in blind pick). */
  ally_roles?: (Role | null)[];
  enemies: string[];
};

/**
 * Fills the draft with what the client or Riot reports. Allies with a known
 * role (champ select) go into their role's row; everyone else fills the free
 * rows in the order the game lists them and is marked `unplaced`, so the row
 * doesn't claim a role. A team the game doesn't show yet (enemies early in
 * champ select) keeps what was typed. A lane opponent marked by hand stays if
 * it's still among the enemies. Unknown champion ids (a champion newer than
 * the loaded patch data) are left out.
 */
export function applyLive(s: DraftState, live: LiveDraft, known: (id: string) => boolean): DraftState {
  const role = live.role ?? s.role;
  const allies = live.allies.map((id, i) => ({ id, role: live.ally_roles?.[i] ?? null })).filter((x) => known(x.id));
  const enemies = live.enemies.filter(known).map((id) => ({ id, role: null as Role | null }));
  const me = live.me && known(live.me) ? live.me : s.me;
  // A kept (typed) team drops any champion the game now places elsewhere:
  // one champion can't be on both teams.
  const placed = new Set([me, ...allies.map((x) => x.id), ...enemies.map((x) => x.id)].filter(Boolean));
  const keep = (l: (string | null)[]) => l.map((x) => (x && placed.has(x) ? null : x));
  /** Rows by role first, then the rest in list order, marked unplaced. */
  const rows = (list: { id: string; role: Role | null }[], roles: Role[]) => {
    const ids: (string | null)[] = roles.map(() => null);
    const unplaced = roles.map(() => false);
    const rest: string[] = [];
    for (const x of list) {
      const i = x.role ? roles.indexOf(x.role) : -1;
      if (i >= 0 && ids[i] === null) ids[i] = x.id;
      else rest.push(x.id);
    }
    for (const id of rest) {
      const i = ids.indexOf(null);
      if (i < 0) break;
      ids[i] = id;
      unplaced[i] = true;
    }
    return { ids, unplaced };
  };
  const a = allies.length ? rows(allies, allyRoles(role)) : { ids: keep(s.allies), unplaced: s.unplaced.allies };
  const e = enemies.length ? rows(enemies, ROLE_ORDER) : { ids: keep(s.enemies), unplaced: s.unplaced.enemies };
  return {
    ...s,
    role,
    me,
    allies: a.ids,
    enemies: e.ids,
    unplaced: { allies: a.unplaced, enemies: e.unplaced },
    lane: s.lane && e.ids.includes(s.lane) ? s.lane : null,
  };
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
 * Changes your role keeping everyone in their row: the ally who was in the
 * new role's row moves to your old one. The lane opponent across from you is
 * whoever is in the new row; one marked by hand stays.
 */
export function changeRole(s: DraftState, role: Role): DraftState {
  if (role === s.role) return s;
  const swap = <T,>(list: T[], empty: T) => {
    const byRole = new Map(allyRoles(s.role).map((r, i) => [r, list[i]]));
    return allyRoles(role).map((r) => (r === s.role ? (byRole.get(role) ?? empty) : (byRole.get(r) ?? empty)));
  };
  const next = { ...s, role, allies: swap(s.allies, null), unplaced: { ...s.unplaced, allies: swap(s.unplaced.allies, false) } };
  // A mark on the enemy now across from you is the default: no mark needed.
  return s.lane ? markLane(next, s.lane) : next;
}
