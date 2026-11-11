import { describe, expect, it } from "vitest";

// Every module under src, by its path ("./games.ts"). Not loaded, only listed.
const files = Object.keys(import.meta.glob(["./**/*.{ts,tsx,js,jsx}", "!**/node_modules/**"]));

/**
 * Pairs of modules an extensionless import ("./games") can't tell apart on a
 * case-insensitive disk (Windows, macOS): same path once the extension is
 * dropped and case is ignored.
 */
export function caseClashes(paths: string[]): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const f of paths) {
    const key = f.replace(/\.[jt]sx?$/, "").toLowerCase();
    const other = seen.get(key);
    if (other) clashes.push(`${other} / ${f}`);
    else seen.set(key, f);
  }
  return clashes;
}

describe("file names", () => {
  it("finds the clash that broke the Windows build (#26)", () => {
    expect(caseClashes(["./games.ts", "./Games.tsx"])).toEqual(["./games.ts / ./Games.tsx"]);
    expect(caseClashes(["./a/B.ts", "./a/b.tsx"])).toHaveLength(1);
    expect(caseClashes(["./gameRows.ts", "./gameRows.test.ts", "./App.tsx"])).toEqual([]);
  });

  it("has no two modules whose import paths differ only by case", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(caseClashes(files)).toEqual([]);
  });
});
