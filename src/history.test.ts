import { describe, expect, it } from "vitest";
import { riotIdOf, roleName, signed, trend } from "./history";
import { setLangForTests } from "./i18n";

describe("trend", () => {
  it("says whether the last games got better, taking the metric's direction into account", () => {
    expect(trend(7, 6, true)).toBe("up");
    expect(trend(1.5, 0.8, false)).toBe("down");
    expect(trend(0.5, 1.2, false)).toBe("up");
  });

  it("treats small changes as flat and missing data as unknown", () => {
    expect(trend(6.1, 6.0, true)).toBe("flat");
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
