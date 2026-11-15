// Builds prepared ahead of time (src-tauri/src/prep.rs): the AI looks up a
// champion's usual build before the player asks, so Get build skips that
// search and answers in about half the time.
import { invoke } from "@tauri-apps/api/core";
import type { Role } from "./game";
import type { ProviderKind } from "./providers";
import type { Main } from "./tierList";

const KEY = "league-coach.prepare-builds";

/** How many mains are prepared when the app opens. */
export const PREPARE_MAINS = 3;

/** Wait after a pick before preparing it, so clicking through champions doesn't start a search for each. */
export const PICK_DELAY_MS = 2000;

/** On unless the player turned it off in Settings. */
export function loadPrepareOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function savePrepareOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not saved: it stays on for the next start.
  }
}

/** `true`: notes are ready; `false`: the same one is already running. */
export function prepareBuild(kind: ProviderKind, champion: string, role: Role) {
  return invoke<boolean>("prepare_build", { kind, champion, role });
}

/**
 * Lane matchup notes, searched in the background (or the search already
 * running, waited for). null: same champion on both sides.
 */
export function matchupNotes(kind: ProviderKind, champion: string, role: Role, opponent: string) {
  return invoke<string | null>("matchup_notes", { kind, champion, role, opponent });
}

/** The first `max` mains with a known role (a build needs one). */
export function mainsToPrepare(mains: Main[], max = PREPARE_MAINS): { champion: string; role: Role }[] {
  return mains
    .filter((m): m is Main & { role: Role } => !!m.role)
    .slice(0, max)
    .map((m) => ({ champion: m.champion, role: m.role }));
}

/** One after another, so it never runs several AI requests at once. Errors are skipped: it is only a head start. */
export async function prepareAll(kind: ProviderKind, list: { champion: string; role: Role }[]) {
  for (const m of list) {
    await prepareBuild(kind, m.champion, m.role).catch(() => false);
  }
}
