import { describe, expect, it } from "vitest";
import { limitSentence, mainLimit } from "./Usage";
import { keyAge } from "./Settings";

const now = 1_000_000_000_000;
const win = (id: string, used_percent: number, resetsInMin: number | null) => ({
  id,
  used_percent,
  window_minutes: null,
  resets_at: resetsInMin === null ? null : now / 1000 + resetsInMin * 60,
});

describe("Your AI row", () => {
  it("shows the most-used window that hasn't reset", () => {
    expect(mainLimit(undefined, now)).toBeNull();
    expect(
      mainLimit([win("five_hour", 90, -5), win("seven_day", 40, 600)], now)?.id,
    ).toBe("seven_day");
    expect(
      mainLimit([win("five_hour", 20, 60), win("seven_day", 40, 600)], now)?.id,
    ).toBe("seven_day");
  });

  it("says the limit in one sentence", () => {
    expect(limitSentence(win("seven_day", 84.4, 45), now)).toBe(
      "84% used (weekly), resets in 45 min.",
    );
    expect(limitSentence(win("five_hour", 100, 25), now)).toBe(
      "Limit reached (5-hour window), resets in 25 min.",
    );
    expect(limitSentence(win("five_hour", 100, null), now)).toBe(
      "Limit reached.",
    );
  });
});

describe("Riot key age", () => {
  it("counts down a development key and flags it after a day", () => {
    expect(keyAge(null, now)).toBeNull();
    expect(keyAge(now - 2 * 3_600_000, now)).toEqual({
      text: expect.stringContaining("about 22 h"),
      stale: false,
    });
    expect(keyAge(now - 25 * 3_600_000, now)?.stale).toBe(true);
  });
});
