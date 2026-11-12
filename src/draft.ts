import type { Champion, Draft, Role } from "./game";
import { guessRoles, type RoleGuessInput } from "./roles";

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
   * Rows whose role is a guess: filled from a live list without positions
   * (enemies in champ select, everyone from Spectator) and placed by where
   * the champion is usually played (see `guessRoles`). The row still counts
   * as its role (the enemy across from you is your lane opponent) until the
   * player sets another role by hand.
   */
  guessed: { allies: boolean[]; enemies: boolean[] };
};

export type Slot = { team: "me" | "ally" | "enemy"; index: number };

export const EMPTY_DRAFT: DraftState = {
  role: "top",
  me: null,
  allies: [null, null, null, null],
  enemies: [null, null, null, null, null],
  lane: null,
  guessed: { allies: [false, false, false, false], enemies: [false, false, false, false, false] },
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
      guessed: { ...s.guessed, allies: put(s.guessed.allies, slot.index, false) },
    };
  }
  const old = s.enemies[slot.index];
  const enemies = put(s.enemies, slot.index, id);
  // Replacing or removing the marked lane opponent drops the mark.
  const lane = old === s.lane ? null : s.lane;
  return { ...s, enemies, lane, guessed: { ...s.guessed, enemies: put(s.guessed.enemies, slot.index, false) } };
}

/**
 * Who you lane against, the one answer every part of the screen shows: the
 * enemy marked by hand, else the enemy in your role's row (its role known or
 * guessed), else nobody.
 */
export function laneOpponent(s: DraftState): string | null {
  if (s.lane && s.enemies.includes(s.lane)) return s.lane;
  return s.enemies[laneRow(s.role)];
}

/**
 * Marks an enemy as your lane opponent. One whose role was only guessed
 * moves into your lane's row instead (the guess was wrong); one across from
 * you needs no mark.
 */
export function markLane(s: DraftState, id: string): DraftState {
  const i = s.enemies.indexOf(id);
  if (i < 0) return s;
  if (s.guessed.enemies[i]) return setRole(s, "enemy", i, s.role);
  const across = laneRow(s.role);
  return { ...s, lane: s.enemies[across] === id ? null : id };
}

/**
 * Sets a champion's role by hand: it moves to that role's row, and whoever
 * was there takes its old row (keeping its guessed mark). The moved one's
 * role is now known. An ally can't take your role.
 */
export function setRole(s: DraftState, team: "ally" | "enemy", index: number, role: Role): DraftState {
  const roles = team === "ally" ? allyRoles(s.role) : ROLE_ORDER;
  const to = roles.indexOf(role);
  const list = team === "ally" ? s.allies : s.enemies;
  const flags = team === "ally" ? s.guessed.allies : s.guessed.enemies;
  if (to < 0 || !list[index]) return s;
  const swap = <T,>(l: T[], moved: T) => l.map((x, j) => (j === to ? moved : j === index ? l[to] : x));
  const ids = swap(list, list[index]);
  const guessed = to === index ? put(flags, index, false) : swap(flags, false);
  if (team === "ally") return { ...s, allies: ids, guessed: { ...s.guessed, allies: guessed } };
  // Rows say the lane now: a hand mark on someone else would contradict it.
  const lane = s.lane && role === s.role ? null : s.lane;
  return { ...s, enemies: ids, lane, guessed: { ...s.guessed, enemies: guessed } };
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
  /** Whether each ally carries Smite, in the order of `allies` (empty when not known). */
  ally_smite?: boolean[];
  enemies: string[];
  /** Whether each enemy carries Smite (a game in progress only; champ select hides it). */
  enemy_smite?: boolean[];
};

/**
 * Fills the draft with what the client or Riot reports. Allies with a known
 * role (champ select) go into their role's row. Everyone else gets the most
 * likely role left from their champion and Smite (`guessRoles`) and is
 * marked `guessed`. A champion whose row was set by hand (typed, or a role
 * set) keeps it, and an enemy marked as your lane opponent goes across from
 * you. A team the game doesn't show yet (enemies early in champ select)
 * keeps what was typed. Unknown champion ids (a champion newer than the
 * loaded patch data) are left out. `tagsOf` gives a champion's class tags,
 * the guess for one the role list doesn't know.
 */
export function applyLive(
  s: DraftState,
  live: LiveDraft,
  known: (id: string) => boolean,
  tagsOf: (id: string) => string[] = () => [],
): DraftState {
  const role = live.role ?? s.role;
  const allies = live.allies
    .map((id, i) => ({ id, role: live.ally_roles?.[i] ?? null, smite: !!live.ally_smite?.[i] }))
    .filter((x) => known(x.id));
  const enemies = live.enemies.map((id, i) => ({ id, role: null as Role | null, smite: !!live.enemy_smite?.[i] })).filter((x) => known(x.id));
  const me = live.me && known(live.me) ? live.me : s.me;
  // A kept (typed) team drops any champion the game now places elsewhere:
  // one champion can't be on both teams.
  const placed = new Set([me, ...allies.map((x) => x.id), ...enemies.map((x) => x.id)].filter(Boolean));
  const keep = (l: (string | null)[]) => l.map((x) => (x && placed.has(x) ? null : x));
  /** Roles already set by hand on the current board, by champion. */
  const handRoles = (list: (string | null)[], flags: boolean[], roles: Role[]) =>
    new Map(list.flatMap((id, i) => (id && !flags[i] ? [[id, roles[i]] as const] : [])));
  /** Known and hand-set roles stay; the rest are guessed among the roles left. */
  const rows = (list: { id: string; role: Role | null; smite: boolean }[], roles: Role[], hand: Map<string, Role>) => {
    const inputs: RoleGuessInput[] = list.map((x) => {
      const fixed = x.role ?? hand.get(x.id);
      return { id: x.id, tags: tagsOf(x.id), smite: x.smite, fixed: fixed && roles.includes(fixed) ? fixed : undefined };
    });
    const got = guessRoles(inputs, roles);
    const ids: (string | null)[] = roles.map(() => null);
    const guessed = roles.map(() => false);
    list.forEach((x, i) => {
      const r = got[i];
      if (!r) return;
      const row = roles.indexOf(r);
      ids[row] = x.id;
      guessed[row] = inputs[i].fixed !== r;
    });
    return { ids, guessed };
  };
  const allyHand = handRoles(s.allies, s.guessed.allies, allyRoles(s.role));
  const enemyHand = handRoles(s.enemies, s.guessed.enemies, ROLE_ORDER);
  // A lane opponent marked by hand plays your role.
  if (s.lane) enemyHand.set(s.lane, role);
  const a = allies.length ? rows(allies, allyRoles(role), allyHand) : { ids: keep(s.allies), guessed: s.guessed.allies };
  const e = enemies.length ? rows(enemies, ROLE_ORDER, enemyHand) : { ids: keep(s.enemies), guessed: s.guessed.enemies };
  const next = {
    ...s,
    role,
    me,
    allies: a.ids,
    enemies: e.ids,
    guessed: { allies: a.guessed, enemies: e.guessed },
    lane: s.lane && e.ids.includes(s.lane) ? s.lane : null,
  };
  // The mark is now the row across from you: no mark needed.
  return next.lane && next.enemies[laneRow(role)] === next.lane ? { ...next, lane: null } : next;
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
  const next = { ...s, role, allies: swap(s.allies, null), guessed: { ...s.guessed, allies: swap(s.guessed.allies, false) } };
  // A mark on the enemy now across from you is the default: no mark needed.
  return s.lane ? markLane(next, s.lane) : next;
}
