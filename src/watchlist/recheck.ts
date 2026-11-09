import type { Pool } from "pg";
import { checkDomain } from "../domain/pipeline.js";
import { config } from "../config.js";
import {
  claimDueWatchlistEntries,
  updateWatchlistAfterCheck,
  setWatchlistExpiryWarned,
  type WatchlistRow,
} from "../db/queries.js";
import { classifyWatchTier, nextCheckAt } from "./schedule.js";
import { isNotifiableStatusTransition, expiryWarningDueDate } from "./transitions.js";
import { notifyWatchEvent } from "./notify.js";

/** Safety margin for `claimDueWatchlistEntries`'s lease: long enough to cover one batch's worth
 *  of `checkDomain` round-trips (RDAP/whois + retries), so a crash mid-batch just delays a retry
 *  by this long instead of losing the entry. */
const CLAIM_LEASE_SECONDS = 300;

/**
 * Rechecks one watchlist entry; records/notifies a status transition and/or an expiry warning.
 * Safe to call concurrently for the same `entry` (an overlapping scheduler tick racing a manual
 * `/check`, or two overlapping ticks that both claimed it before a crash): `updateWatchlistAfterCheck`
 * and `setWatchlistExpiryWarned` are conditioned on the entry's previous value, so only the call
 * that actually "wins" that race notifies — a real transition never produces two notifications.
 */
export async function recheckWatchlistEntry(pool: Pool, entry: WatchlistRow, now: Date = new Date()): Promise<void> {
  const result = await checkDomain(pool, entry.domain, { deep: true });

  const tier = classifyWatchTier(result.status, result.expires_at, now, config.watchExpiryWarnDays);
  const nextCheck = nextCheckAt(tier, now, config.watchFastIntervalSeconds).toISOString();

  const wonStatusUpdate = await updateWatchlistAfterCheck(pool, entry.id, entry.status, {
    status: result.status,
    expiresAt: result.expires_at,
    nextCheckAt: nextCheck,
  });

  if (wonStatusUpdate && isNotifiableStatusTransition(entry.status, result.status)) {
    await notifyWatchEvent(pool, entry.id, {
      domain: entry.domain,
      eventType: "status_transition",
      fromStatus: entry.status,
      toStatus: result.status,
    });
  }

  const warnDate = expiryWarningDueDate(
    result.status,
    result.expires_at,
    now,
    config.watchExpiryWarnDays,
    entry.expiry_warned_for_date,
  );
  if (warnDate) {
    const wonWarning = await setWatchlistExpiryWarned(pool, entry.id, entry.expiry_warned_for_date, warnDate);
    if (wonWarning) {
      await notifyWatchEvent(pool, entry.id, {
        domain: entry.domain,
        eventType: "expiry_warning",
        expiresAt: result.expires_at,
      });
    }
  }
}

let recheckInFlight = false;

/**
 * Rechecks every watchlist entry currently due. Guarded against overlapping runs with an
 * in-process flag: the fast- and daily-interval schedulers each call this independently, and
 * without this guard a slow batch (many due entries, or a slow RDAP/whois upstream) could still
 * be running when the next tick fires, double-processing the same entries.
 */
export async function recheckDueWatchlist(pool: Pool): Promise<{ checked: number }> {
  if (recheckInFlight) return { checked: 0 };
  recheckInFlight = true;
  try {
    const claimed = await claimDueWatchlistEntries(pool, CLAIM_LEASE_SECONDS);
    const now = new Date();
    for (const entry of claimed) {
      await recheckWatchlistEntry(pool, entry, now);
    }
    return { checked: claimed.length };
  } finally {
    recheckInFlight = false;
  }
}
