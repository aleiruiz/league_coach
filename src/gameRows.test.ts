import { describe, expect, it } from "vitest";
import type { MatchDetail, PlayerDetail } from "./matchDetails";
import type { GameStats } from "./history";
import { bests, byDay, duration, gameFacts, matchPrompt, matchTitle, kdaRatio, killShare, laneOpponent, mainChampions, me, queueName, rowTags } from "./gameRows";

const player = (o: Partial<PlayerDetail>): PlayerDetail => ({
  name: "P",
  tag: "LAN",
  is_me: false,
  team_id: 100,
  position: "MIDDLE",
  champion: "Ahri",
  level: 16,
  kills: 2,
  deaths: 3,
  assists: 4,
  cs: 150,
  gold: 10_000,
  damage_dealt: 15_000,
  damage_taken: 20_000,
  vision_score: 20,
  wards_placed: 8,
  wards_killed: 2,
  control_wards: 2,
  items: [1, 2, 3, 4, 5, 6, 3340],
  spells: [4, 14],
  primary_style: 8100,
  secondary_style: 8300,
  runes: [8112],
  shards: [],
  largest_multikill: 1,
  double_kills: 0,
  triple_kills: 0,
  quadra_kills: 0,
  penta_kills: 0,
  first_blood: false,
  turret_kills: 0,
  time_dead_s: 60,
  solo_kills: null,
  kill_participation: null,
  lane_cs_10: null,
  turret_plates: null,
  max_cs_lead: null,
  epic_steals: null,
  ...o,
});

const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function game(mine: Partial<PlayerDetail>, o: Partial<MatchDetail> = {}): MatchDetail {
  const players = [100, 200].flatMap((team) =>
    POS.map((position, i) => player({ team_id: team, position, name: `${team}-${i}`, champion: `C${team}${i}` })),
  );
  players[2] = { ...players[2], is_me: true, ...mine };
  return {
    id: "LA1_1",
    patch: "26.22",
    queue_id: 420,
    duration_s: 1800,
    ended_at: new Date(2026, 10, 10, 18, 0).getTime(),
    teams: [
      { team_id: 100, win: true, bans: [], objectives: {} as MatchDetail["teams"][0]["objectives"] },
      { team_id: 200, win: false, bans: [], objectives: {} as MatchDetail["teams"][0]["objectives"] },
    ],
    players,
    ...o,
  };
}

const stats = (o: Partial<GameStats>): GameStats => ({ cs_diff_10: null, early_deaths: null, ...o }) as GameStats;

describe("game rows", () => {
  it("formats the basics", () => {
    expect(duration(1728)).toBe("28:48");
    expect(duration(65)).toBe("1:05");
    expect(queueName(420)).toBe("Ranked Solo/Duo");
    expect(queueName(420, true)).toBe("Ranked Solo");
    expect(kdaRatio(player({ kills: 8, deaths: 3, assists: 6 }))).toBe("4.7");
    expect(kdaRatio(player({ deaths: 0 }))).toBe("Perfect");
  });

  it("finds me, my lane opponent and my share of kills", () => {
    const g = game({ kills: 5, assists: 3 });
    expect(me(g)?.name).toBe("100-2");
    expect(laneOpponent(g, me(g)!)?.name).toBe("200-2");
    // Team kills: 2 × 4 others + 5 = 13; (5 + 3) / 13.
    expect(killShare(g, me(g)!)).toBeCloseTo(8 / 13);
    // Riot's own number wins when it's there.
    expect(killShare(g, { ...me(g)!, kill_participation: 0.5 })).toBe(0.5);
    expect(laneOpponent(g, { ...me(g)!, position: "" })).toBeUndefined();
  });

  it("groups by day with each day's record", () => {
    const now = new Date(2026, 10, 11, 9, 0).getTime();
    const today = game({}, { id: "a", ended_at: new Date(2026, 10, 11, 1, 0).getTime() });
    const y1 = game({}, { id: "b", ended_at: new Date(2026, 10, 10, 22, 0).getTime() });
    const y2 = game({ team_id: 200 }, { id: "c", ended_at: new Date(2026, 10, 10, 20, 0).getTime() });
    const days = byDay([today, y1, y2], now, "en-US");
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday"]);
    expect(days[1].games.map((g) => g.id)).toEqual(["b", "c"]);
    expect(days[1].record).toBe("1 win, 1 loss");
    expect(days[0].record).toBe("1 win, 0 losses");
  });

  it("tags what went well and what to improve, with numbers, three at most", () => {
    const g = game({ gold: 15_000, damage_dealt: 30_000, largest_multikill: 3, control_wards: 0, kills: 9, assists: 9 });
    const tags = rowTags(g, stats({ cs_diff_10: -14, early_deaths: 2 }));
    expect(tags.good).toEqual(["Triple kill", "Most gold in the game"]);
    expect(tags.bad).toEqual(["2 deaths before minute 14"]);
    // The row already shows minions at 10 and the share of kills; the full list has them.
    const all = gameFacts(g, stats({ cs_diff_10: -14, early_deaths: 2 }));
    expect(all.bad).toEqual(["14 minions behind at 10 min", "2 deaths before minute 14", "0 control wards"]);
    expect(all.good.some((x) => /^In \d+% of kills$/.test(x))).toBe(true);
  });

  it("leaves minions out for supports and needs a real game for wards", () => {
    const sup = game({ position: "UTILITY", control_wards: 0 }, { duration_s: 600 });
    const tags = rowTags(sup, stats({ cs_diff_10: -40 }));
    expect([...tags.good, ...tags.bad].join()).not.toMatch(/minions|control/);
  });

  it("lists the champions played at least twice, most played first", () => {
    const g = (c: string) => game({ champion: c });
    expect(mainChampions([g("Jax"), g("Ahri"), g("Ahri"), g("Jax"), g("Ahri"), g("Zed")])).toEqual(["Ahri", "Jax"]);
  });

  it("finds the best of the game in each number", () => {
    const g = game({ gold: 15_000, damage_taken: 40_000, kills: 10, deaths: 0, assists: 5 });
    g.players[7] = { ...g.players[7], cs: 300, damage_dealt: 50_000 };
    const b = Object.fromEntries(bests(g, "en-US").map((x) => [x.key, x]));
    expect(b.gold.player.is_me).toBe(true);
    expect(b.gold.value).toBe("15,000");
    expect(b.cs.player.name).toBe("200-2");
    expect(b.damage.player.name).toBe("200-2");
    expect(b.kda.value).toBe("Perfect (10/0/5)");
    expect(b.taken.player.is_me).toBe(true);
  });

  it("titles the game and tells the coach about it without anyone's name", () => {
    const g = game({ name: "MyName", tag: "MINE", champion: "Ahri", kills: 5 });
    g.players = g.players.map((x, i) => (x.is_me ? x : { ...x, name: `Player${i}`, tag: `T${i}` }));
    g.players[7] = { ...g.players[7], champion: "Zed" };
    const names = { champ: (c: string) => c, item: () => "Item", role: (r: string) => r.toLowerCase() };
    expect(matchTitle(g, names.champ, names.role)).toBe("Win as Ahri (middle) against Zed");
    const prompt = matchPrompt(g, stats({ cs_diff_10: 12, gold_diff_15: 300, team_gold_diff_15: 900, death_minutes: [4.2] } as Partial<GameStats>), names);
    expect(prompt).toContain("Win as Ahri (middle) against Zed");
    expect(prompt).toContain("Zed (middle)");
    expect(prompt).toContain("minions vs my lane opponent at 10 min: 12");
    expect(prompt).not.toMatch(/MyName|MINE|Player\d|T\d\b/);
  });
});
