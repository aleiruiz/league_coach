import { describe, expect, it } from "vitest";
// Vitest stubs CSS imports (even ?raw), so read the file itself. No @types/node here.
// @ts-expect-error node:fs has no type declarations in this project
import { readFileSync } from "node:fs";

describe("App.css", () => {
  it("closes every block (an open @media swallows every rule after it)", () => {
    const css = (
      readFileSync(new URL("./App.css", import.meta.url), "utf8") as string
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.length).toBeGreaterThan(10000);
    let depth = 0;
    for (const ch of css) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
