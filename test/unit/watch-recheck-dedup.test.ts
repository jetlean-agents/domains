import { describe, expect, it, vi } from "vitest";

// Fakes the two conditional-update SQL functions `recheck.ts` calls, with the same atomicity a
// real `UPDATE ... WHERE status = $prevStatus` (resp. `expiry_warned_for_date IS NOT DISTINCT
// FROM $prevDate`) guarantees: the check-and-set happens in one synchronous step, so of two
// concurrent callers racing on the SAME previous value, only one can ever win.
let row: { status: string; expiry_warned_for_date: string | null };

vi.mock("../../src/db/queries.js", () => ({
  claimDueWatchlistEntries: vi.fn(async () => []),
  updateWatchlistAfterCheck: vi.fn(
    async (_pool: unknown, _id: string, prevStatus: string, patch: { status: string }) => {
      if (row.status !== prevStatus) return false;
      row.status = patch.status;
      return true;
    },
  ),
  setWatchlistExpiryWarned: vi.fn(
    async (_pool: unknown, _id: string, prevWarnedForDate: string | null, date: string) => {
      if (row.expiry_warned_for_date !== prevWarnedForDate) return false;
      row.expiry_warned_for_date = date;
      return true;
    },
  ),
}));

const notifyWatchEvent = vi.fn(async () => {});
vi.mock("../../src/watchlist/notify.js", () => ({
  notifyWatchEvent: (...args: unknown[]) => notifyWatchEvent(...(args as [unknown, unknown, unknown])),
}));

vi.mock("../../src/domain/pipeline.js", () => ({
  checkDomain: vi.fn(async () => ({
    domain: "example.com",
    status: "available",
    expires_at: null,
    registrar: null,
    source: "rdap",
    checked_at: new Date().toISOString(),
  })),
}));

const { recheckWatchlistEntry } = await import("../../src/watchlist/recheck.js");

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry-1",
    domain: "example.com",
    niche: null,
    note: null,
    added_by: null,
    desired_action: "take",
    status: "registered",
    expires_at: null,
    last_checked_at: null,
    next_check_at: new Date().toISOString(),
    expiry_warned_for_date: null,
    autoreg_site_id: null,
    autoreg_take_started_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as any;
}

describe("recheckWatchlistEntry: dedup under concurrent rechecks of the same entry", () => {
  it("notifies exactly once when two concurrent rechecks observe the same status transition", async () => {
    row = { status: "registered", expiry_warned_for_date: null };
    notifyWatchEvent.mockClear();
    const entry = makeEntry({ status: "registered" });

    // Simulates an overlapping scheduler tick racing a manual `/check` (or two overlapping
    // ticks): both read the same stale `entry.status` before either has persisted anything.
    await Promise.all([recheckWatchlistEntry({} as any, entry), recheckWatchlistEntry({} as any, entry)]);

    const transitionCalls = notifyWatchEvent.mock.calls.filter(
      ([, , n]: [unknown, unknown, { eventType: string }]) => n.eventType === "status_transition",
    );
    expect(transitionCalls).toHaveLength(1);
    expect(row.status).toBe("available");
  });

  it("does not notify at all when the status didn't actually change", async () => {
    row = { status: "available", expiry_warned_for_date: null };
    notifyWatchEvent.mockClear();
    const entry = makeEntry({ status: "available" });

    await recheckWatchlistEntry({} as any, entry);

    expect(notifyWatchEvent).not.toHaveBeenCalled();
  });
});
