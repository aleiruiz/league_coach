import { describe, expect, it } from "vitest";
import { rankText, remember, shortRegion, suggestions } from "./SummonerSearch";

describe("summoner search", () => {
  it("keeps starred searches and the last 8 others", () => {
    let list = remember([], "Star#1234", "la1", 0).map((s) => ({ ...s, saved: true }));
    for (let i = 0; i < 10; i++) list = remember(list, `P${i}#TAG`, "na1", i + 1);
    expect(list).toHaveLength(9);
    expect(list.some((s) => s.riotId === "Star#1234" && s.saved)).toBe(true);
    expect(list.some((s) => s.riotId === "P0#TAG")).toBe(false);
    // Searching again moves it up and keeps its star, ignoring case.
    list = remember(list, "star#1234", "la1", 99);
    expect(list[0]).toMatchObject({ riotId: "star#1234", saved: true });
    expect(list.filter((s) => s.region === "la1")).toHaveLength(1);
  });

  it("suggests matching past searches, starred first", () => {
    const list = [
      { riotId: "Faker#KR1", region: "kr", saved: false, at: 5 },
      { riotId: "Fake Fan#LAN", region: "la1", saved: true, at: 1 },
      { riotId: "Other#NA1", region: "na1", saved: false, at: 9 },
    ];
    expect(suggestions(list, "fak").map((s) => s.riotId)).toEqual(["Fake Fan#LAN", "Faker#KR1"]);
    expect(suggestions(list, "")).toHaveLength(3);
    expect(suggestions(list, "#na1").map((s) => s.riotId)).toEqual(["Other#NA1"]);
  });

  it("formats regions and ranks", () => {
    expect(shortRegion({ id: "la1", label: "Latin America North (LAN)" })).toBe("LAN");
    expect(shortRegion({ id: "xx", label: "Nowhere" })).toBe("XX");
    expect(
      rankText({ queue_type: "RANKED_SOLO_5x5", tier: "EMERALD", rank: "IV", league_points: 33, wins: 20, losses: 18 }),
    ).toBe("Emerald IV · 33 LP · 20W 18L (53%)");
    expect(
      rankText({ queue_type: "RANKED_SOLO_5x5", tier: "MASTER", rank: "I", league_points: 120, wins: 1, losses: 0 }),
    ).toMatch(/^Master · 120 LP/);
  });
});
