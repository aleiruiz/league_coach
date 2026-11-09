import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, sameDraft, setSlot, taken, toDraft, toggleLane } from "./draft";
import { Champion, searchChampions } from "./game";

const champ = (id: string, name: string): Champion => ({
  id,
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
    s = setSlot(s, enemy(0), "Darius");
    // El primer rival queda marcado solo.
    expect(toDraft(s)?.lane_opponent).toBe("Darius");
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
    a = setSlot(setSlot(a, enemy(0), "Darius"), enemy(1), "Ahri");
    const b = setSlot(setSlot(setSlot(a, enemy(0), null), enemy(1), null), enemy(3), "Ahri");
    const c = toggleLane(setSlot(b, enemy(4), "Darius"), "Darius");
    expect(sameDraft(toDraft(a), toDraft(c))).toBe(true);
    expect(sameDraft(toDraft(a), toDraft(b))).toBe(false);
    expect(sameDraft(toDraft(a), toDraft({ ...a, role: "mid" }))).toBe(false);
    expect(taken(a)).toEqual(new Set(["Jax", "Darius", "Ahri"]));
  });
});
