import { describe, expect, it } from "vitest";
import { metricFor, nameRefs, pointMetric, plainValue, worstGames } from "./improve";
import type { GameStats } from "./history";

describe("Improve", () => {
  it("finds the metric a review point is about", () => {
    expect(metricFor("CS diff at 10")).toBe("cs_diff_10");
    expect(metricFor("minions vs lane opponent at 10 min")).toBe("cs_diff_10");
    expect(metricFor("CS/min")).toBe("cs_per_min");
    expect(metricFor("deaths before 14:00")).toBe("early_deaths");
    expect(metricFor("solo deaths")).toBe("solo_deaths");
    expect(metricFor("control wards bought")).toBe("control_wards");
    expect(metricFor("vision score per minute")).toBe("vision_per_min");
    expect(metricFor("gold diff @15")).toBe("gold_diff_15");
    expect(metricFor("kill participation")).toBe("kill_participation");
    expect(metricFor("roaming timing")).toBeNull();
    expect(metricFor("deaths")).toBeNull();
    // Whole words only.
    expect(metricFor("moving toward the next wave")).toBeNull();
    expect(metricFor("muertes antes del 14 (solo en línea)")).toBe("early_deaths");
    expect(metricFor("Muertes en solitario")).toBe("solo_deaths");
    expect(metricFor("ward score")).toBe("vision_per_min");
  });

  it("says numbers in plain words", () => {
    expect(plainValue("cs_diff_10", -6.2)).toBe("6 behind");
    expect(plainValue("cs_diff_10", 3)).toBe("3 ahead");
    expect(plainValue("early_deaths", 1.3)).toBe("1.3 per game");
    expect(plainValue("control_wards", 1)).toBe("1 per game");
    expect(plainValue("kill_participation", 0.62)).toBe("62%");
  });

  it("picks the cited games where it was worst", () => {
    const g = (id: string, cs: number | null, deaths: number) => ({ id, cs_diff_10: cs, early_deaths: deaths }) as GameStats;
    const games = [g("a", -3, 0), g("b", -14, 2), g("c", null, 1), g("d", -9, 3)];
    expect(worstGames("cs_diff_10", ["a", "b", "c", "d"], games).map((x) => x.g.id)).toEqual(["b", "d"]);
    expect(worstGames("early_deaths", ["a", "b", "d"], games).map((x) => x.g.id)).toEqual(["d", "b"]);
  });
});

describe("game references", () => {
  it("names G codes the way the player remembers the game", () => {
    const refs = ["Ahri vs Syndra, Nov 9", "Orianna vs Yasuo, Nov 9"];
    expect(nameRefs("Behind in G1 and G2; see G12.", refs)).toBe("Behind in Ahri vs Syndra, Nov 9 and Orianna vs Yasuo, Nov 9; see G12.");
    expect(nameRefs("GG2 stays", refs)).toBe("GG2 stays");
  });
});

describe("review point metric", () => {
  it("shows no number when the title and the metric disagree", () => {
    expect(pointMetric({ title: "Deaths before 14:00", metric: "solo deaths" })).toBeNull();
    expect(pointMetric({ title: "You fall behind early", metric: "CS diff at 10" })).toBe("cs_diff_10");
    expect(pointMetric({ title: "Early deaths", metric: "" })).toBe("early_deaths");
  });
});
