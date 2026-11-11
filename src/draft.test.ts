import { describe, expect, it } from "vitest";
import { applyLive, damageProfile, EMPTY_DRAFT, sameDraft, setSlot, taken, toDraft, toggleLane, setLane, otherEnemies } from "./draft";
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

  it("reemplazar al rival de línea quita la estrella", () => {
    let s = setSlot(EMPTY_DRAFT, { team: "me", index: 0 }, "Jax");
    s = setLane(s, "Darius");
    expect(toDraft(s)?.lane_opponent).toBe("Darius");
    // Another enemy picked in the optional teams is never marked on its own.
    expect(setSlot(s, enemy(1), "Ahri").lane).toBe("Darius");
    expect(setSlot(EMPTY_DRAFT, enemy(0), "Ahri").lane).toBeNull();
    s = setSlot(s, enemy(0), "Garen");
    expect(s.lane).toBeNull();
    expect(toDraft(s)?.lane_opponent).toBeNull();
  });

  it("quitar otro rival no toca la estrella", () => {
    let s = setSlot(EMPTY_DRAFT, enemy(0), "Darius");
    s = setSlot(s, enemy(1), "Ahri");
    s = toggleLane(s, "Ahri");
    expect(s.lane).toBe("Ahri");
    s = setSlot(s, enemy(0), null);
    expect(s.lane).toBe("Ahri");
    s = toggleLane(s, "Ahri");
    expect(s.lane).toBeNull();
    // Con otros rivales ya elegidos, uno nuevo no se marca solo.
    s = setSlot(s, enemy(2), "Garen");
    expect(s.lane).toBeNull();
  });

  it("solo se marca como rival de línea a un rival", () => {
    expect(toggleLane(EMPTY_DRAFT, "Darius").lane).toBeNull();
  });

  it("sin campeón propio no hay draft", () => {
    expect(toDraft(EMPTY_DRAFT)).toBeNull();
  });

  it("detecta cambios del draft pero no el orden de las casillas", () => {
    let a = setSlot(EMPTY_DRAFT, { team: "me", index: 0 }, "Jax");
    a = setLane(setSlot(a, enemy(1), "Ahri"), "Darius");
    const b = setSlot(setSlot(setSlot(a, enemy(0), null), enemy(1), null), enemy(3), "Ahri");
    const c = toggleLane(setSlot(b, enemy(4), "Darius"), "Darius");
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

  it("fills role, me and both teams, never guessing the lane opponent", () => {
    const s = applyLive(base, { source: "game", role: null, me: "Kayn", allies: ["Darius", "Ahri"], enemies: ["Khazix", "Unknown"] }, known);
    expect(s.role).toBe(base.role);
    expect(s.me).toBe("Kayn");
    expect(s.allies).toEqual(["Darius", "Ahri", null, null]);
    expect(s.enemies).toEqual(["Khazix", null, null, null, null]);
    expect(s.lane).toBeNull();
  });

  it("keeps typed enemies until champ select reveals them, and the lane star if it's still there", () => {
    const typed = { ...base, enemies: ["Zed", null, null, null, null], lane: "Zed" };
    const early = applyLive(typed, { source: "champ_select", role: "mid", me: "Ahri", allies: [], enemies: [] }, known);
    expect(early.role).toBe("mid");
    expect(early.enemies[0]).toBe("Zed");
    expect(early.lane).toBe("Zed");
    const later = applyLive(early, { source: "champ_select", role: "mid", me: "Ahri", allies: [], enemies: ["Yasuo"] }, known);
    expect(later.enemies[0]).toBe("Yasuo");
    expect(later.lane).toBeNull();
  });
});

describe("applyLive duplicates", () => {
  it("drops a typed enemy that the game now shows on my team", () => {
    const typed = { ...EMPTY_DRAFT, enemies: ["Zed", "Ahri", null, null, null] };
    const s = applyLive(typed, { source: "champ_select", role: null, me: "Kayn", allies: ["Zed"], enemies: [] }, () => true);
    expect(s.allies[0]).toBe("Zed");
    expect(s.enemies).toEqual([null, "Ahri", null, null, null]);
  });
});

describe("lane opponent step", () => {
  it("puts the lane opponent in the enemy team and swaps it in place", () => {
    let s = setLane(EMPTY_DRAFT, "Darius");
    expect(s.enemies[0]).toBe("Darius");
    expect(s.lane).toBe("Darius");
    s = setSlot(s, { team: "enemy", index: 1 }, "Soraka");
    s = setLane(s, "Garen");
    expect(s.enemies.slice(0, 2)).toEqual(["Garen", "Soraka"]);
    expect(s.lane).toBe("Garen");
    // An enemy already in the team just becomes the lane opponent.
    s = setLane(s, "Soraka");
    expect(s.enemies.slice(0, 2)).toEqual(["Garen", "Soraka"]);
    expect(s.lane).toBe("Soraka");
    s = setLane(s, null);
    expect(s.enemies.slice(0, 2)).toEqual(["Garen", null]);
    expect(s.lane).toBeNull();
  });

  it("lists the other enemy slots without the lane opponent's", () => {
    const s = setLane(setSlot(EMPTY_DRAFT, { team: "enemy", index: 0 }, "Soraka"), "Darius");
    expect(s.enemies[1]).toBe("Darius");
    expect(otherEnemies(s).map((x) => x.index)).toEqual([0, 2, 3, 4]);
    expect(otherEnemies(EMPTY_DRAFT).map((x) => x.index)).toEqual([1, 2, 3, 4]);
  });
});
