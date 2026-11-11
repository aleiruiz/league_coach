import { describe, expect, it } from "vitest";

// Every module under src, by its path ("./games.ts"). Not loaded, only listed.
const files = Object.keys(import.meta.glob(["./**/*.{ts,tsx,js,jsx}", "!**/node_modules/**"]));

describe("file names", () => {
  // Windows and macOS ignore case, so "./games" could load Games.tsx instead
  // of games.ts (#26). Two modules may not differ only by case.
  it("has no two modules whose import paths differ only by case", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of files) {
      const key = f.replace(/\.[jt]sx?$/, "").toLowerCase();
      const other = seen.get(key);
      if (other) clashes.push(`${other} / ${f}`);
      else seen.set(key, f);
    }
    expect(files.length).toBeGreaterThan(10);
    expect(clashes).toEqual([]);
  });
});
