import { describe, expect, it } from "vitest";
import { buildForPrompt } from "./DraftView";
import type { Card } from "./game";

const ref = (name: string) => ({ name, image: null, valid: true });

const card: Card = {
  answer: null,
  summary: "Split push and duel.",
  starting_items: [ref("Doran's Blade"), ref("Health Potion")],
  core_items: [ref("Trinity Force"), ref("Sterak's Gage"), ref("Death's Dance")],
  boots: ref("Plated Steelcaps"),
  situational: [{ item: ref("Randuin's Omen"), when: "vs crit", replaces: ref("Death's Dance") }],
  runes: {
    primary_tree: ref("Precision"),
    keystone: ref("Conqueror"),
    primary: [ref("Triumph"), ref("Legend: Alacrity"), ref("Last Stand")],
    secondary_tree: ref("Resolve"),
    secondary: [ref("Second Wind"), ref("Unflinching")],
    shards: [ref("Attack Speed"), ref("Adaptive Force"), ref("Health Scaling")],
  },
  summoner_spells: [ref("Flash"), ref("Teleport")],
  skill_order: { max: ["Q", "W", "E"], first_levels: "Q-E-W" },
  game_plan: { early: "", mid: "", late: "" },
  matchup_tips: [],
  threats: [],
  caveat: null,
  stats: [],
  stats_dropped: 0,
  stats_verifiable: true,
};

describe("Update build", () => {
  it("sends the build on screen as one paragraph to start from", () => {
    const p = buildForPrompt(card);
    expect(p).toContain("Runes: Conqueror (Precision: Triumph, Legend: Alacrity, Last Stand; Resolve: Second Wind, Unflinching;");
    expect(p).toContain("Summoner spells: Flash + Teleport.");
    expect(p).toContain("Starting items: Doran's Blade, Health Potion.");
    expect(p).toContain("Full build in buy order: Trinity Force, Sterak's Gage, Death's Dance.");
    expect(p).toContain("Boots: Plated Steelcaps.");
    expect(p).toContain("Options: Randuin's Omen instead of Death's Dance.");
    expect(p).toContain("Skill max order: Q > W > E.");
    // Fits the backend's cap with room to spare.
    expect(p.length).toBeLessThan(1500);
  });

  it("leaves out what the card doesn't have", () => {
    const p = buildForPrompt({ ...card, boots: ref(""), situational: [], starting_items: [] });
    expect(p).not.toContain("Boots:");
    expect(p).not.toContain("Options:");
    expect(p).not.toContain("Starting items:");
  });
});
