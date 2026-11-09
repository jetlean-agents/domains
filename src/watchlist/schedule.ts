import type { DomainStatus } from "../domain/types.js";

export type WatchTier = "fast" | "daily";

const FAST_STATUSES: ReadonlySet<DomainStatus> = new Set(["pending_delete", "redemption"]);

const MS_PER_DAY = 24 * 3600 * 1000;

/**
 * Classifies a watchlist entry into a check-frequency tier: `fast` for domains already in
 * `pending_delete`/`redemption`, or `registered` domains within `warnDays` of `expiresAt` (worth
 * watching closely for the drop); `daily` otherwise.
 */
export function classifyWatchTier(
  status: DomainStatus,
  expiresAt: string | null,
  now: Date,
  warnDays: number,
): WatchTier {
  if (FAST_STATUSES.has(status)) return "fast";
  if (status === "registered" && expiresAt) {
    const daysLeft = (new Date(expiresAt).getTime() - now.getTime()) / MS_PER_DAY;
    if (daysLeft <= warnDays) return "fast";
  }
  return "daily";
}

/** Next `next_check_at` for an entry just checked, given its (just-computed) tier. */
export function nextCheckAt(tier: WatchTier, now: Date, fastIntervalSeconds: number): Date {
  if (tier === "fast") return new Date(now.getTime() + fastIntervalSeconds * 1000);
  return new Date(now.getTime() + MS_PER_DAY);
}
