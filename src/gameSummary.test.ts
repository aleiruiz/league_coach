import { describe, expect, it } from "vitest";
import { clock, gameValue, kda, peersOf, standouts } from "./gameSummary";
import { GameStats } from "./history";
import { setLangForTests } from "./i18n";

function game(id: string, over: Partial<GameStats> = {}): GameStats {
  return {
    id,
    ended_at: 0,
    queue_id: 420,
    minutes: 30,
    champion: "Kayn",
    role: "JUNGLE",
    win: true,
    kills: 5,
    deaths: 4,
    assists: 6,
    kill_participation: 0.5,
    cs_per_min: 7,
    cs_at_10: 60,
    opponent: "Khazix",
    cs_diff_10: 5,
    gold_diff_15: 200,
    team_gold_diff_15: 500,
    vision_per_min: 0.8,
    wards_placed: 10,
    wards_killed: 3,
    control_wards: 2,
    damage_share: 0.22,
    early_deaths: 1,
    solo_deaths: 1,
    death_minutes: [8, 20, 25, 28],
    first_item_min: 12,
    ...over,
  };
}

describe("game summary", () => {
  setLangForTests("en");
  const usual = [game("a"), game("b"), game("c")];

  it("compares only with other games of the same role", () => {
    const g = game("x");
    const support = game("s", { role: "UTILITY", cs_per_min: 1 });
    expect(peersOf(g, [g, ...usual, support]).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("needs a few games in the role before comparing", () => {
    const g = game("x", { cs_per_min: 10 });
    expect(standouts(g, [g, game("a"), game("b")])).toEqual({
      better: [],
      worse: [],
    });
  });

  it("picks what is far from usual, in the metric's direction", () => {
    const g = game("x", {
      cs_per_min: 9,
      early_deaths: 3,
      vision_per_min: 0.82,
    });
    const { better, worse } = standouts(g, [g, ...usual]);
    expect(better.map((c) => c.key)).toEqual(["cs_per_min"]);
    expect(better[0].usual).toBe(7);
    // More early deaths is worse; vision 0.82 vs 0.8 is noise.
    expect(worse.map((c) => c.key)).toContain("early_deaths");
    expect([...better, ...worse].map((c) => c.key)).not.toContain(
      "vision_per_min",
    );
  });

  it("does not blow up small lane differences around zero", () => {
    // +8 vs usual +5 CS at 10: 3 CS is not a 60% swing.
    const g = game("x", { cs_diff_10: 8 });
    const { better } = standouts(g, [g, ...usual]);
    expect(better.map((c) => c.key)).not.toContain("cs_diff_10");
  });

  it("formats KDA and game time", () => {
    expect(kda(game("x"))).toBeCloseTo(2.75);
    expect(kda(game("x", { deaths: 0 }))).toBeNull();
    expect(clock(12.5)).toBe("12:30");
    expect(clock(0)).toBe("0:00");
    expect(gameValue(game("x"), "win_rate")).toBeNull();
  });
});

describe("game summary noise guards", () => {
  setLangForTests("en");

  it("ignores count stats less than one whole unit away", () => {
    const peers = [
      game("a", { early_deaths: 1 }),
      game("b", { early_deaths: 1 }),
      game("c", { early_deaths: 0 }),
      game("d", { early_deaths: 1 }),
      game("e", { early_deaths: 1 }),
    ];
    // 1 vs usual 0.8 would be a 25% gap, but it's the same game for a count.
    const g = game("x", { early_deaths: 1 });
    expect(standouts(g, [g, ...peers]).worse.map((c) => c.key)).not.toContain(
      "early_deaths",
    );
    const bad = game("y", { early_deaths: 2 });
    expect(standouts(bad, [bad, ...peers]).worse.map((c) => c.key)).toContain(
      "early_deaths",
    );
  });

  it("needs enough games with each stat, not just enough games", () => {
    const peers = [
      game("a", { cs_diff_10: 0 }),
      game("b", { cs_diff_10: null }),
      game("c", { cs_diff_10: null }),
    ];
    const g = game("x", { cs_diff_10: 40 });
    expect(standouts(g, [g, ...peers]).better.map((c) => c.key)).not.toContain(
      "cs_diff_10",
    );
  });
});

describe("support games", () => {
  it("are never compared on CS", () => {
    const sup = (id: string, cs: number) =>
      game(id, { role: "UTILITY", cs_per_min: cs, cs_diff_10: -20 });
    const g = game("x", { role: "UTILITY", cs_per_min: 3, cs_diff_10: 10 });
    const { better, worse } = standouts(g, [
      g,
      sup("a", 1),
      sup("b", 1),
      sup("c", 1),
    ]);
    const keys = [...better, ...worse].map((c) => c.key);
    expect(keys).not.toContain("cs_per_min");
    expect(keys).not.toContain("cs_diff_10");
  });
});
