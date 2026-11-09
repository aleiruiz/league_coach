import { describe, expect, it } from "vitest";
import { asSyncError, looksLikeRiotId, riotIdOf, riotIdProblem, roleName, signed, trend } from "./history";
import { setLangForTests } from "./i18n";

describe("trend", () => {
  it("says whether the last games got better, taking the metric's direction into account", () => {
    expect(trend(7, 6, true)).toEqual({ arrow: "▲", verdict: "better" });
    expect(trend(1.5, 0.8, false)).toEqual({ arrow: "▲", verdict: "worse" });
    // Fewer deaths: the arrow points down, and it's better.
    expect(trend(0.5, 1.2, false)).toEqual({ arrow: "▼", verdict: "better" });
  });

  it("treats small changes as flat and missing data as unknown", () => {
    expect(trend(6.1, 6.0, true)?.verdict).toBe("flat");
    expect(trend(null, 6, true)).toBeNull();
  });
});

describe("formatting", () => {
  it("signs differences", () => {
    expect(signed(12.4)).toBe("+12");
    expect(signed(-3.6)).toBe("-4");
    expect(signed(0)).toBe("0");
  });

  it("names roles in the app language", () => {
    setLangForTests("en");
    expect(roleName("UTILITY")).toBe("Support");
    setLangForTests("es");
    expect(roleName("JUNGLE")).toBe("Jungla");
    expect(roleName("")).toBe("?");
    setLangForTests("en");
  });

  it("builds the Riot ID only when both parts exist", () => {
    expect(riotIdOf({ game_name: "Name", tag_line: "LAN", region: "la1", auto_analyze: true })).toBe("Name#LAN");
    expect(riotIdOf({ game_name: "", tag_line: "", region: "", auto_analyze: true })).toBe("");
  });
});

describe("sync errors and Riot IDs", () => {
  it("keeps the backend's kind and falls back to transient", () => {
    expect(asSyncError({ kind: "setup", message: "expired" })).toEqual({ kind: "setup", message: "expired" });
    expect(asSyncError("boom")).toEqual({ kind: "transient", message: "boom" });
  });

  it("checks the Name#TAG shape", () => {
    expect(looksLikeRiotId(" Faker Fan#LAN1 ")).toBe(true);
    expect(looksLikeRiotId("NoTag")).toBe(false);
    expect(looksLikeRiotId("ab#LAN")).toBe(false);
    expect(riotIdProblem("Faker#KR1234")).toMatch(/tag after # has 3 to 5 characters \(yours has 6\)/);
    expect(riotIdProblem("Faker")).toMatch(/Add your tag/);
    expect(riotIdProblem("ab#LAN")).toMatch(/name before # has 3 to 16 characters \(yours has 2\)/);
    expect(riotIdProblem("Faker#K-R")).toMatch(/only have letters and numbers/);
    expect(riotIdProblem("Faker#KR1")).toBeNull();
  });
});
