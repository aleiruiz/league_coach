import { describe, expect, it } from "vitest";
import { parseKeys, skillPath } from "./skills";

describe("skillPath", () => {
  it("sigue los primeros niveles, R en 6/11/16 y maximiza en orden", () => {
    expect(skillPath(["Q", "E", "W"], "E-Q-W")?.join("")).toBe("EQWQQRQEQERE" + "EWWRWW");
  });

  it("acepta texto libre en los primeros niveles", () => {
    expect(parseKeys("Empieza con E, luego Q y W")).toEqual(["E", "Q", "W"]);
  });

  it("sin primeros niveles igual reparte sin pasarse de rango", () => {
    const p = skillPath(["Q", "W", "E"], "")!;
    expect(p).toHaveLength(18);
    for (const k of ["Q", "W", "E"]) expect(p.filter((x) => x === k)).toHaveLength(5);
    expect(p.filter((x) => x === "R")).toHaveLength(3);
    expect(p.slice(0, 3).join("")).toBe("QWQ".slice(0, 1) + p.slice(1, 3).join(""));
  });

  it("sin orden de maximización no inventa nada", () => {
    expect(skillPath([], "Q-W-E")).toBeNull();
  });
});
