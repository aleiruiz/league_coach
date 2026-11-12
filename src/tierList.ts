// "Champions": this patch's tier list (read by the AI from one stats site,
// never computed here) and the champions the player plays most.

import { Channel, invoke } from "@tauri-apps/api/core";
import type { Role } from "./game";
import type { GameStats } from "./history";
import type { ChatEvent, ProviderKind } from "./providers";

export type TierEntry = {
  /** Data Dragon id. */
  champion: string;
  tier: string;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
};

export type TierList = {
  role: Role;
  site: string;
  url: string;
  /** Patch the page said it shows ("" if it didn't say). */
  patch: string;
  /** Patch the app was on when the list was read. */
  app_patch: string;
  rank: string | null;
  entries: TierEntry[];
  dropped: number;
  fetched_at: number;
};

export const savedTierLists = () => invoke<Partial<Record<Role, TierList>>>("saved_tier_lists");

export function fetchTierList(kind: ProviderKind, role: Role, requestId: string, onEvent: (ev: ChatEvent) => void) {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<TierList>("fetch_tier_list", { kind, role, requestId, onEvent: channel });
}

/** Tiers in the order the site gave them (best first), each with its champions. */
export function byTier(entries: TierEntry[]): { tier: string; entries: TierEntry[] }[] {
  const groups: { tier: string; entries: TierEntry[] }[] = [];
  for (const e of entries) {
    const g = groups.find((x) => x.tier === e.tier);
    if (g) g.entries.push(e);
    else groups.push({ tier: e.tier, entries: [e] });
  }
  return groups;
}

/** Match-V5 position to the app's role. */
export const ROLE_OF: Record<string, Role> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

export type Main = {
  champion: string;
  games: number;
  wins: number;
  /** The role played most on it (null if never known). */
  role: Role | null;
  /** (K + A) / D over those games, deaths counted as at least 1. */
  kda: number | null;
  pinned: boolean;
};

/** Fewer than this many games on a champion isn't a main. */
export const MAIN_MIN_GAMES = 2;

/**
 * Pinned champions first (in the order they were pinned), then the most
 * played ones (at least MAIN_MIN_GAMES games), up to `max` in total.
 * Ties go to more wins, then to the one played most recently.
 */
export function mains(games: GameStats[], pinned: string[], max = 6): Main[] {
  type Acc = { games: number; wins: number; k: number; d: number; a: number; roles: Map<string, number>; last: number };
  const by = new Map<string, Acc>();
  for (const g of games) {
    const acc = by.get(g.champion) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0, roles: new Map(), last: 0 };
    acc.games++;
    if (g.win) acc.wins++;
    acc.k += g.kills;
    acc.d += g.deaths;
    acc.a += g.assists;
    if (g.role) acc.roles.set(g.role, (acc.roles.get(g.role) ?? 0) + 1);
    acc.last = Math.max(acc.last, g.ended_at);
    by.set(g.champion, acc);
  }
  const make = (champion: string, isPinned: boolean): Main => {
    const a = by.get(champion);
    if (!a) return { champion, games: 0, wins: 0, role: null, kda: null, pinned: isPinned };
    const top = [...a.roles.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    return {
      champion,
      games: a.games,
      wins: a.wins,
      role: top ? (ROLE_OF[top] ?? null) : null,
      kda: (a.k + a.a) / Math.max(1, a.d),
      pinned: isPinned,
    };
  };
  const pins = [...new Set(pinned)];
  const auto = [...by.entries()]
    .filter(([c, a]) => a.games >= MAIN_MIN_GAMES && !pins.includes(c))
    .sort(([, x], [, y]) => y.games - x.games || y.wins - x.wins || y.last - x.last)
    .map(([c]) => make(c, false));
  return [...pins.map((c) => make(c, true)), ...auto].slice(0, Math.max(max, pins.length));
}

/** The role the player plays most (for the tier list to open on), or null. */
export function usualRole(games: GameStats[]): Role | null {
  const n = new Map<Role, number>();
  for (const g of games) {
    const r = ROLE_OF[g.role];
    if (r) n.set(r, (n.get(r) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Pins and the last role are per-device conveniences: losing them only means
// picking again, so a broken or blocked storage is ignored.
const PINS = "league-coach.pinned-mains";
const ROLE = "league-coach.tier-role";

export function loadPins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINS) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function savePins(pins: string[]) {
  try {
    localStorage.setItem(PINS, JSON.stringify(pins));
  } catch {
    // ignored: see above
  }
}

export function loadRole(): Role | null {
  try {
    const v = localStorage.getItem(ROLE);
    return v && Object.values(ROLE_OF).includes(v as Role) ? (v as Role) : null;
  } catch {
    return null;
  }
}

export function saveRole(role: Role) {
  try {
    localStorage.setItem(ROLE, role);
  } catch {
    // ignored: see above
  }
}
