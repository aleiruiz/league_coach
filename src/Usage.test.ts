import { describe, expect, it } from "vitest";
import { lastDays, resetText, windowLabel } from "./Usage";

describe("usage helpers", () => {
  it("names limit windows from the id or the length", () => {
    expect(windowLabel({ id: "five_hour", used_percent: 1, window_minutes: 300, resets_at: null })).toBe("5-hour window");
    expect(windowLabel({ id: "seven_day", used_percent: 1, window_minutes: null, resets_at: null })).toBe("Weekly");
    expect(windowLabel({ id: "primary", used_percent: 1, window_minutes: 300, resets_at: null })).toBe("5-hour window");
    expect(windowLabel({ id: "secondary", used_percent: 1, window_minutes: 10080, resets_at: null })).toBe("Weekly");
    expect(windowLabel({ id: "x", used_percent: 1, window_minutes: 2880, resets_at: null })).toBe("2-day window");
    expect(windowLabel({ id: "mystery", used_percent: 1, window_minutes: null, resets_at: null })).toBe("mystery");
  });

  it("says when a window resets", () => {
    const now = 1_000_000_000_000;
    expect(resetText(null, now)).toBeNull();
    expect(resetText(now / 1000 - 5, now)).toBe("resets now");
    expect(resetText(now / 1000 + 45 * 60, now)).toBe("resets in 45 min");
    expect(resetText(now / 1000 + 134 * 60, now)).toBe("resets in 2 h 14 min");
    expect(resetText(now / 1000 + 3 * 86400, now)).toMatch(/^resets /);
  });

  it("groups hourly buckets into the last 7 local days", () => {
    const now = new Date(2026, 10, 9, 15, 0);
    const hour = (d: Date) => Math.floor(d.getTime() / 3_600_000);
    const days = lastDays(
      [
        { hour: hour(new Date(2026, 10, 9, 9)), input: 100, cached: 500, output: 10, queries: 1 },
        { hour: hour(new Date(2026, 10, 9, 14)), input: 50, cached: 0, output: 5, queries: 2 },
        { hour: hour(new Date(2026, 10, 3, 12)), input: 7, cached: 0, output: 1, queries: 1 },
        { hour: hour(new Date(2026, 10, 1, 12)), input: 999, cached: 0, output: 9, queries: 1 },
      ],
      now,
    );
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ tokens: 165, input: 150, cached: 500, output: 15, queries: 3 });
    expect(days[0]).toMatchObject({ tokens: 8, queries: 1 });
    expect(days.reduce((s, d) => s + d.tokens, 0)).toBe(173);
  });
});

import { hasReset } from "./Usage";
describe("stale limits", () => {
  it("knows when a reported window has reset", () => {
    const w = { id: "five_hour", used_percent: 90, window_minutes: 300, resets_at: 1000 };
    expect(hasReset(w, 999_000)).toBe(false);
    expect(hasReset(w, 1_000_000)).toBe(true);
    expect(hasReset({ ...w, resets_at: null }, 5e12)).toBe(false);
  });
});
