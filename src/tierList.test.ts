import { beforeEach, describe, expect, it } from "vitest";
import { byTier, loadPins, mains, savePins, usualRole } from "./tierList";
import type { GameStats } from "./history";

const game = (champion: string, over: Partial<GameStats> = {}): GameStats =>
  ({
    id: Math.random().toString(),
    ended_at: 1,
    queue_id: 420,
    minutes: 30,
    champion,
    role: "MIDDLE",
    win: true,
    kills: 2,
    deaths: 1,
    assists: 2,
    ...over,
  }) as GameStats;

describe("mains", () => {
  it("lists the most played champions with 2+ games, pinned ones first", () => {
    const games = [
      game("Ahri"),
      game("Ahri", { win: false, deaths: 3 }),
      game("Ahri"),
      game("Zed", { role: "TOP" }),
      game("Zed", { role: "TOP", win: false }),
      game("Lux"),
    ];
    const m = mains(games, ["Jinx"]);
    expect(m.map((x) => x.champion)).toEqual(["Jinx", "Ahri", "Zed"]);
    expect(m[0]).toMatchObject({ pinned: true, games: 0, role: null, kda: null });
    expect(m[1]).toMatchObject({ games: 3, wins: 2, role: "mid" });
    // (6 + 6) / 5 deaths
    expect(m[1].kda).toBeCloseTo(2.4);
    expect(m[2].role).toBe("top");
  });

  it("a pinned champion isn't listed twice and the list is capped", () => {
    const games = ["A", "B", "C", "D", "E", "F", "G"].flatMap((c) => [game(c), game(c)]);
    const m = mains(games, ["B"], 3);
    expect(m.map((x) => x.champion)).toEqual(["B", "A", "C"]);
    expect(m.filter((x) => x.champion === "B")).toHaveLength(1);
  });

  it("ties go to more wins, then the most recent", () => {
    const games = [game("A", { win: false, ended_at: 9 }), game("A", { ended_at: 9 }), game("B"), game("B"), game("C", { ended_at: 5 }), game("C", { ended_at: 5 })];
    // B and C both 2 wins; C played more recently than B (ended_at 1).
    expect(mains(games, []).map((x) => x.champion)).toEqual(["C", "B", "A"]);
  });
});

describe("tier list helpers", () => {
  it("groups by tier in the site's order", () => {
    const e = (champion: string, tier: string) => ({ champion, tier, win_rate: null, pick_rate: null, ban_rate: null });
    const g = byTier([e("A", "S+"), e("B", "S+"), e("C", "S"), e("D", "A")]);
    expect(g.map((x) => [x.tier, x.entries.length])).toEqual([["S+", 2], ["S", 1], ["A", 1]]);
  });

  it("opens on the role played most", () => {
    expect(usualRole([])).toBeNull();
    expect(usualRole([game("A", { role: "UTILITY" }), game("B", { role: "UTILITY" }), game("C")])).toBe("support");
  });
});

describe("pins", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  });

  it("survive a reload and ignore broken data", () => {
    savePins(["Ahri", "Zed"]);
    expect(loadPins()).toEqual(["Ahri", "Zed"]);
    localStorage.setItem("league-coach.pinned-mains", "{oops");
    expect(loadPins()).toEqual([]);
  });

  it("work when storage is missing", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    savePins(["Ahri"]);
    expect(loadPins()).toEqual([]);
  });
});
