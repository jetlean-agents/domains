import { describe, expect, it } from "vitest";
import { isNotifiableStatusTransition, expiryWarningDueDate } from "../../src/watchlist/transitions.js";

describe("isNotifiableStatusTransition", () => {
  it("flags a transition into pending_delete", () => {
    expect(isNotifiableStatusTransition("registered", "pending_delete")).toBe(true);
  });

  it("flags a transition into redemption", () => {
    expect(isNotifiableStatusTransition("registered", "redemption")).toBe(true);
  });

  it("flags a transition into available", () => {
    expect(isNotifiableStatusTransition("pending_delete", "available")).toBe(true);
  });

  it("does not flag a no-op (same status) — dedup across repeated rechecks", () => {
    expect(isNotifiableStatusTransition("registered", "registered")).toBe(false);
    expect(isNotifiableStatusTransition("pending_delete", "pending_delete")).toBe(false);
  });

  it("does not flag a transition into registered or unknown", () => {
    expect(isNotifiableStatusTransition("unknown", "registered")).toBe(false);
    expect(isNotifiableStatusTransition("registered", "unknown")).toBe(false);
  });
});

describe("expiryWarningDueDate", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("fires for a registered domain within warnDays", () => {
    expect(expiryWarningDueDate("registered", "2026-01-05T00:00:00Z", now, 7, null)).toBe("2026-01-05");
  });

  it("does not fire outside warnDays", () => {
    expect(expiryWarningDueDate("registered", "2026-02-01T00:00:00Z", now, 7, null)).toBeNull();
  });

  it("does not fire for a non-registered status", () => {
    expect(expiryWarningDueDate("pending_delete", "2026-01-05T00:00:00Z", now, 7, null)).toBeNull();
  });

  it("does not fire without an expiry date", () => {
    expect(expiryWarningDueDate("registered", null, now, 7, null)).toBeNull();
  });

  it("dedups: already warned for the same expiry date doesn't fire again", () => {
    expect(expiryWarningDueDate("registered", "2026-01-05T00:00:00Z", now, 7, "2026-01-05")).toBeNull();
  });

  it("re-fires when the expiry date changed (e.g. domain was renewed then flagged again)", () => {
    expect(expiryWarningDueDate("registered", "2026-01-06T00:00:00Z", now, 7, "2026-01-05")).toBe("2026-01-06");
  });

  it("does not fire for an already-passed expiry date", () => {
    expect(expiryWarningDueDate("registered", "2025-12-01T00:00:00Z", now, 7, null)).toBeNull();
  });
});
