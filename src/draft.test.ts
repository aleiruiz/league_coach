import { describe, expect, it } from "vitest";
import { allyRoles, applyLive, type DraftState, changeRole, damageProfile, EMPTY_DRAFT, laneOpponent, laneRow, markLane, sameDraft, setRole, setSlot, taken, toDraft } from "./draft";
import { Champion, searchChampions } from "./game";

const champ = (id: string, name: string): Champion => ({
  id,
  key: 0,
  name,
  title: "",
  tags: [],
  attack: 0,
  magic: 0,
  defense: 0,
  image: "",
});

describe("searchChampions", () => {
  const list = [champ("Kaisa", "Kai'Sa"), champ("Nunu", "Nunu y Willump"), champ("Rammus", "Rammus"), champ("Belveth", "Bel'Veth")];

  it("ignora apóstrofos, mayúsculas y acentos", () => {
    expect(searchChampions(list, "kaisa").map((c) => c.id)).toEqual(["Kaisa"]);
    expect(searchChampions(list, "RAMMUS").map((c) => c.id)).toEqual(["Rammus"]);
    expect(searchChampions(list, "bél veth").map((c) => c.id)).toEqual(["Belveth"]);
    expect(searchChampions(list, "nunu").map((c) => c.id)).toEqual(["Nunu"]);
  });

  it("sin texto devuelve todos", () => {
    expect(searchChampions(list, "  ")).toHaveLength(4);
  });
});

describe("draft", () => {
  const enemy = (i: number) => ({ team: "enemy" as const, index: i });
  const jax = setSlot(EMPTY_DRAFT, { team: "me", index: 0 }, "Jax");

  it("your lane opponent is the enemy across from you unless you mark another", () => {
    let s = setSlot(jax, enemy(1), "Vi");
    expect(laneOpponent(s)).toBeNull();
    s = setSlot(s, enemy(0), "Darius");
    expect(laneOpponent(s)).toBe("Darius");
    expect(toDraft(s)?.lane_opponent).toBe("Darius");
    expect(toDraft(s)?.lane_guessed).toBe(false);
    // Lanes swapped: the mark wins over the row.
    s = markLane(s, "Vi");
    expect(laneOpponent(s)).toBe("Vi");
    // Marking the one across again is the default, so no mark is kept.
    s = markLane(s, "Darius");
    expect(s.lane).toBeNull();
    expect(laneOpponent(s)).toBe("Darius");
  });

  it("replacing or removing the marked enemy drops the mark", () => {
    let s = markLane(setSlot(setSlot(jax, enemy(0), "Darius"), enemy(2), "Ahri"), "Ahri");
    expect(setSlot(s, enemy(0), null).lane).toBe("Ahri");
    s = setSlot(s, enemy(2), "Zed");
    expect(s.lane).toBeNull();
    expect(laneOpponent(s)).toBe("Darius");
  });

  it("only an enemy can be marked", () => {
    expect(markLane(EMPTY_DRAFT, "Darius").lane).toBeNull();
  });

  it("sin campeón propio no hay draft", () => {
    expect(toDraft(EMPTY_DRAFT)).toBeNull();
  });

  it("detecta cambios del draft pero no el orden de las casillas", () => {
    const a = markLane(setSlot(setSlot(jax, enemy(1), "Ahri"), enemy(2), "Darius"), "Darius");
    const b = setSlot(setSlot(setSlot(a, enemy(1), null), enemy(2), null), enemy(3), "Ahri");
    const c = markLane(setSlot(b, enemy(4), "Darius"), "Darius");
    expect(sameDraft(toDraft(a), toDraft(c))).toBe(true);
    expect(sameDraft(toDraft(a), toDraft(b))).toBe(false);
    expect(sameDraft(toDraft(a), toDraft({ ...a, role: "mid" }))).toBe(false);
    expect(taken(a)).toEqual(new Set(["Jax", "Darius", "Ahri"]));
  });
});

describe("damageProfile", () => {
  const c = (attack: number, magic: number, defense = 3, tags: string[] = []) => ({ ...champ("x", "x"), attack, magic, defense, tags });

  it("cuenta AD, AP y mixtos y reparte los mixtos a medias", () => {
    const p = damageProfile([c(9, 1), c(2, 8), c(5, 5, 8), c(8, 2, 3, ["Tank"])]);
    expect([p.ad, p.ap, p.mixed, p.tanks]).toEqual([2, 1, 1, 2]);
    expect(p.adPct).toBe(63);
    expect(p.apPct).toBe(38);
  });
});

describe("applyLive", () => {
  const known = (id: string) => id !== "Unknown";
  const base = EMPTY_DRAFT;

  it("guesses the roles of a game in progress from the champions", () => {
    const s = applyLive(base, { source: "game", role: null, me: "Kayn", allies: ["Darius", "Ahri"], enemies: ["Khazix", "Unknown"] }, known);
    expect(s.role).toBe(base.role);
    expect(s.me).toBe("Kayn");
    // You play top, so Darius gets the first role left; Ahri goes mid.
    expect(s.allies).toEqual(["Darius", "Ahri", null, null]);
    expect(s.guessed.allies).toEqual([true, true, false, false]);
    // Kha'Zix is a jungler: jungle row, guessed. Nobody is across from you.
    expect(s.enemies).toEqual([null, "Khazix", null, null, null]);
    expect(s.guessed.enemies[1]).toBe(true);
    expect(laneOpponent(s)).toBeNull();
  });

  it("puts champ-select allies in their role's row and guesses the rest", () => {
    const s = applyLive(
      base,
      { source: "champ_select", role: "top", me: "Jax", allies: ["Nami", "Jinx", "Zed"], ally_roles: ["support", "adc", null], enemies: [] },
      known,
    );
    // top player: rows jungle, mid, adc, support. Zed has no role: mid, guessed.
    expect(s.allies).toEqual([null, "Zed", "Jinx", "Nami"]);
    expect(s.guessed.allies).toEqual([false, true, false, false]);
  });

  it("guesses your lane opponent among the enemies champ select reveals", () => {
    const s = applyLive(
      base,
      { source: "champ_select", role: "jungle", me: "Hecarim", allies: ["Jinx"], ally_roles: ["adc"], enemies: ["Lillia", "Seraphine"] },
      known,
    );
    expect(s.enemies).toEqual([null, "Lillia", null, null, "Seraphine"]);
    expect(s.guessed.enemies).toEqual([false, true, false, false, true]);
    expect(laneOpponent(s)).toBe("Lillia");
    expect(toDraft(s)?.lane_opponent).toBe("Lillia");
    // The AI is told it's a guess, until the player sets the role.
    expect(toDraft(s)?.lane_guessed).toBe(true);
    expect(toDraft(setRole(s, "enemy", 1, "jungle"))?.lane_guessed).toBe(false);
  });

  it("Smite settles who the jungler is", () => {
    const live = { source: "game" as const, role: null, me: "Garen", allies: [], enemies: ["Ekko", "Talon"] };
    // Both are played mid and jungle: without Smite the first listed takes jungle.
    expect(applyLive({ ...base, role: "mid" }, live, known).enemies).toEqual([null, "Ekko", "Talon", null, null]);
    const s = applyLive({ ...base, role: "mid" }, { ...live, enemy_smite: [false, true] }, known);
    expect(s.enemies).toEqual([null, "Talon", "Ekko", null, null]);
    expect(laneOpponent(s)).toBe("Ekko");
  });

  it("guesses a champion the list doesn't know from its class tags", () => {
    const tags = (id: string) => (id === "Newchamp" ? ["Marksman"] : []);
    const s = applyLive(base, { source: "game", role: null, me: "Garen", allies: [], enemies: ["Newchamp"] }, known, tags);
    expect(s.enemies[3]).toBe("Newchamp");
  });

  it("keeps typed enemies until champ select reveals them, and the lane mark if it's still there", () => {
    const typed = { ...base, enemies: ["Zed", "Vi", null, null, null], lane: "Vi" };
    const early = applyLive(typed, { source: "champ_select", role: "mid", me: "Ahri", allies: [], enemies: [] }, known);
    expect(early.role).toBe("mid");
    expect(early.enemies[0]).toBe("Zed");
    expect(early.lane).toBe("Vi");
    const later = applyLive(early, { source: "champ_select", role: "mid", me: "Ahri", allies: [], enemies: ["Yasuo"] }, known);
    expect(later.enemies).toEqual([null, null, "Yasuo", null, null]);
    expect(later.lane).toBeNull();
    expect(laneOpponent(later)).toBe("Yasuo");
  });

  it("a hand pick into a row makes that row its role", () => {
    const s = applyLive(base, { source: "game", role: null, me: "Kayn", allies: [], enemies: ["Khazix"] }, known);
    const t = setSlot(s, { team: "enemy", index: 1 }, "Vi");
    expect(t.guessed.enemies[1]).toBe(false);
  });
});

describe("setting a role by hand", () => {
  const known = () => true;
  const filled = applyLive(
    { ...EMPTY_DRAFT, role: "jungle" },
    { source: "champ_select", role: "jungle", me: "Hecarim", allies: [], enemies: ["Lillia", "Seraphine"] },
    known,
  );

  it("moves the champion to that role's row and swaps whoever was there", () => {
    const s = setRole(filled, "enemy", 4, "jungle");
    expect(s.enemies).toEqual([null, "Seraphine", null, null, "Lillia"]);
    // Seraphine's role is known now; Lillia's is still a guess.
    expect(s.guessed.enemies).toEqual([false, false, false, false, true]);
    expect(laneOpponent(s)).toBe("Seraphine");
    // Into an empty row.
    const t = setRole(filled, "enemy", 4, "adc");
    expect(t.enemies).toEqual([null, "Lillia", null, "Seraphine", null]);
    expect(t.guessed.enemies[3]).toBe(false);
  });

  it("“this is my lane” on a guessed enemy moves it across from you", () => {
    const s = markLane(filled, "Seraphine");
    expect(s.enemies[1]).toBe("Seraphine");
    expect(s.lane).toBeNull();
    expect(laneOpponent(s)).toBe("Seraphine");
  });

  it("filling again keeps the roles set by hand", () => {
    const s = setRole(filled, "enemy", 4, "adc");
    const again = applyLive(s, { source: "champ_select", role: "jungle", me: "Hecarim", allies: [], enemies: ["Lillia", "Seraphine", "Thresh"] }, known);
    expect(again.enemies).toEqual([null, "Lillia", null, "Seraphine", "Thresh"]);
    expect(again.guessed.enemies).toEqual([false, true, false, false, true]);
  });

  it("an ally can't take your role", () => {
    const s = { ...EMPTY_DRAFT, role: "top" as const, allies: ["Ahri", null, null, null] };
    expect(setRole(s, "ally", 0, "top")).toBe(s);
    expect(setRole(s, "ally", 0, "mid").allies).toEqual([null, "Ahri", null, null]);
  });
});

describe("applyLive duplicates", () => {
  it("drops a typed enemy that the game now shows on my team", () => {
    const typed = { ...EMPTY_DRAFT, enemies: ["Zed", "Ahri", null, null, null] };
    const s = applyLive(typed, { source: "champ_select", role: null, me: "Kayn", allies: ["Zed"], enemies: [] }, () => true);
    // A top player's mid row: Zed is guessed mid.
    expect(s.allies[1]).toBe("Zed");
    expect(s.enemies).toEqual([null, "Ahri", null, null, null]);
  });
});

describe("champ-select rows", () => {
  it("keeps allies in their rows when your role changes", () => {
    let s: DraftState = { ...EMPTY_DRAFT, role: "top", me: "Jax" };
    // top player: rows jungle, mid, adc, support.
    s = { ...s, allies: ["LeeSin", "Ahri", "Jinx", "Nami"] };
    s = { ...s, enemies: ["Darius", "Vi", "Syndra", null, null] };
    const mid = changeRole(s, "mid");
    // mid player: rows top, jungle, adc, support. Ahri (was mid) moves to top.
    expect(allyRoles("mid")).toEqual(["top", "jungle", "adc", "support"]);
    expect(mid.allies).toEqual(["Ahri", "LeeSin", "Jinx", "Nami"]);
    expect(laneOpponent(mid)).toBe("Syndra");
    expect(laneOpponent(changeRole(mid, "adc"))).toBeNull();
    // A hand mark stays when the role changes.
    expect(laneOpponent(changeRole(markLane(s, "Vi"), "mid"))).toBe("Vi");
    expect(laneRow("support")).toBe(4);
  });
});
