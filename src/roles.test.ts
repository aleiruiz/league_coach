import { describe, expect, it } from "vitest";
import { guessRoles, KNOWN_CHAMPIONS, roleWeights } from "./roles";

describe("roleWeights", () => {
  it("every listed champion has valid roles and weights", () => {
    for (const id of KNOWN_CHAMPIONS) {
      const w = roleWeights(id);
      const entries = Object.entries(w);
      expect(entries.length, id).toBeGreaterThan(0);
      for (const [role, n] of entries) {
        expect(["top", "jungle", "mid", "adc", "support"], id).toContain(role);
        expect([1, 2, 3], id).toContain(n);
      }
      // Each champion has one main role.
      expect(Math.max(...entries.map(([, n]) => n)), id).toBe(3);
    }
  });

  it("falls back to class tags for a champion it doesn't know", () => {
    expect(roleWeights("Newchamp", ["Support", "Mage"])).toEqual({ support: 2, mid: 2 });
    expect(roleWeights("Newchamp")).toEqual({});
  });
});

describe("guessRoles", () => {
  const all = ["top", "jungle", "mid", "adc", "support"] as const;

  it("finds the most likely whole team, not champion by champion", () => {
    // Taliyah alone would go jungle, but Hecarim needs it more.
    expect(guessRoles([{ id: "Taliyah" }, { id: "Hecarim" }], [...all])).toEqual(["mid", "jungle"]);
    expect(guessRoles([{ id: "Lillia" }, { id: "Seraphine" }], [...all])).toEqual(["jungle", "support"]);
  });

  it("keeps fixed roles and avoids the jungle for those without Smite", () => {
    expect(guessRoles([{ id: "Ahri", fixed: "top" }, { id: "Yasuo" }], [...all])).toEqual(["top", "mid"]);
    // Darius with Smite is the jungler, even over a real jungler without it.
    expect(guessRoles([{ id: "Graves" }, { id: "Darius", smite: true }], [...all])).toEqual(["top", "jungle"]);
  });

  it("leaves out a champion when there are more champions than roles", () => {
    expect(guessRoles([{ id: "Jinx" }, { id: "Caitlyn" }], ["adc"])).toEqual(["adc", null]);
  });
});
