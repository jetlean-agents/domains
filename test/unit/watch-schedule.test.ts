import { describe, expect, it } from "vitest";
import { classifyWatchTier, nextCheckAt } from "../../src/watchlist/schedule.js";

const now = new Date("2026-01-01T00:00:00Z");

describe("classifyWatchTier", () => {
  it("is fast for pending_delete", () => {
    expect(classifyWatchTier("pending_delete", null, now, 7)).toBe("fast");
  });

  it("is fast for redemption", () => {
    expect(classifyWatchTier("redemption", null, now, 7)).toBe("fast");
  });

  it("is daily for a registered domain far from expiry", () => {
    expect(classifyWatchTier("registered", "2026-06-01T00:00:00Z", now, 7)).toBe("daily");
  });

  it("is fast for a registered domain close to expiry", () => {
    expect(classifyWatchTier("registered", "2026-01-05T00:00:00Z", now, 7)).toBe("fast");
  });

  it("is daily for a registered domain with no known expiry", () => {
    expect(classifyWatchTier("registered", null, now, 7)).toBe("daily");
  });

  it("is daily for available/unknown", () => {
    expect(classifyWatchTier("available", null, now, 7)).toBe("daily");
    expect(classifyWatchTier("unknown", null, now, 7)).toBe("daily");
  });
});

describe("nextCheckAt", () => {
  it("schedules a fast tier entry WATCH_FAST_INTERVAL seconds out", () => {
    expect(nextCheckAt("fast", now, 3600).toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  it("schedules a daily tier entry 24h out", () => {
    expect(nextCheckAt("daily", now, 3600).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});
