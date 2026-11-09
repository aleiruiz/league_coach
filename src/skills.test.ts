import { describe, expect, it } from "vitest";
import { parseKeys, skillPath } from "./skills";

describe("skillPath", () => {
  it("sigue los primeros niveles, R en 6/11/16 y maximiza en orden", () => {
    expect(skillPath(["Q", "E", "W"], "E-Q-W")?.join("")).toBe("EQWQQRQEQERE" + "EWWRWW");
  });

  it("acepta texto libre en los primeros niveles", () => {
    expect(parseKeys("Empieza con E, luego Q y W")).toEqual(["E", "Q", "W"]);
  });

  it("nunca pasa del rango que permite cada nivel y R solo en 6/11/16", () => {
    for (const [max, first] of [
      [["Q", "W", "E"], ""],
      [["E", "Q", "W"], "Q-Q-Q"],
      [["W", "E", "Q"], "W E Q"],
    ] as [string[], string][]) {
      const p = skillPath(max, first)!;
      expect(p).toHaveLength(18);
      const rank: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 };
      p.forEach((k, i) => {
        const level = i + 1;
        rank[k]++;
        if (k === "R") expect([6, 11, 16]).toContain(level);
        else expect(rank[k]).toBeLessThanOrEqual(Math.floor((level + 1) / 2));
      });
      for (const k of ["Q", "W", "E"]) expect(rank[k]).toBe(5);
    }
  });

  it("entiende «QWE» pegado", () => {
    expect(parseKeys("QWE")).toEqual(["Q", "W", "E"]);
    expect(parseKeys("Q→W→E")).toEqual(["Q", "W", "E"]);
  });

  it("sin orden de maximización no inventa nada", () => {
    expect(skillPath([], "Q-W-E")).toBeNull();
  });
});
