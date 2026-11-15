import { describe, expect, it } from "vitest";
import { mainsToPrepare } from "./prepare";
import type { Main } from "./tierList";

const main = (champion: string, role: Main["role"]): Main => ({ champion, games: 3, wins: 1, role, kda: 2, pinned: false });

describe("mainsToPrepare", () => {
  it("keeps mains with a known role, in order, up to the limit", () => {
    const list = [main("Ahri", "mid"), main("Jax", null), main("Kayn", "jungle"), main("Lux", "support"), main("Zed", "mid")];
    expect(mainsToPrepare(list)).toEqual([
      { champion: "Ahri", role: "mid" },
      { champion: "Kayn", role: "jungle" },
      { champion: "Lux", role: "support" },
    ]);
    expect(mainsToPrepare(list, 1)).toEqual([{ champion: "Ahri", role: "mid" }]);
    expect(mainsToPrepare([])).toEqual([]);
  });
});
