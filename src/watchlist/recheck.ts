import type { Pool } from "pg";
import { checkDomain } from "../domain/pipeline.js";
import { config } from "../config.js";
import {
  listDueWatchlistEntries,
  updateWatchlistAfterCheck,
  setWatchlistExpiryWarned,
  type WatchlistRow,
} from "../db/queries.js";
import { classifyWatchTier, nextCheckAt } from "./schedule.js";
import { isNotifiableStatusTransition, expiryWarningDueDate } from "./transitions.js";
import { notifyWatchEvent } from "./notify.js";

/** Rechecks one watchlist entry; records/notifies a status transition and/or an expiry warning. */
export async function recheckWatchlistEntry(pool: Pool, entry: WatchlistRow, now: Date = new Date()): Promise<void> {
  const result = await checkDomain(pool, entry.domain, { deep: true });

  if (isNotifiableStatusTransition(entry.status, result.status)) {
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
    await notifyWatchEvent(pool, entry.id, {
      domain: entry.domain,
      eventType: "expiry_warning",
      expiresAt: result.expires_at,
    });
    await setWatchlistExpiryWarned(pool, entry.id, warnDate);
  }

  const tier = classifyWatchTier(result.status, result.expires_at, now, config.watchExpiryWarnDays);
  await updateWatchlistAfterCheck(pool, entry.id, {
    status: result.status,
    expiresAt: result.expires_at,
    nextCheckAt: nextCheckAt(tier, now, config.watchFastIntervalSeconds).toISOString(),
  });
}

/** Rechecks every watchlist entry currently due (`next_check_at <= now`); returns how many ran. */
export async function recheckDueWatchlist(pool: Pool): Promise<{ checked: number }> {
  const due = await listDueWatchlistEntries(pool);
  const now = new Date();
  for (const entry of due) {
    await recheckWatchlistEntry(pool, entry, now);
  }
  return { checked: due.length };
}
