import type { DomainStatus } from "../domain/types.js";

/** Statuses that, when newly reached, are worth a notification (not just a journal entry). */
const NOTIFIABLE_STATUSES: ReadonlySet<DomainStatus> = new Set(["pending_delete", "redemption", "available"]);

/** True when `previous -> next` is an actual change into a status worth notifying about. */
export function isNotifiableStatusTransition(previous: DomainStatus, next: DomainStatus): boolean {
  return previous !== next && NOTIFIABLE_STATUSES.has(next);
}

/**
 * Decides whether an "expires in N days" warning should (re-)fire: only once per concrete
 * `expiresAt` date (dedup across daily/fast recheck ticks), and only for `registered` domains
 * actually within `warnDays`. Returns null when no warning should be sent.
 */
export function expiryWarningDueDate(
  status: DomainStatus,
  expiresAt: string | null,
  now: Date,
  warnDays: number,
  warnedForDate: string | null,
): string | null {
  if (status !== "registered" || !expiresAt) return null;
  const expiryDate = expiresAt.slice(0, 10);
  const daysLeft = (new Date(expiresAt).getTime() - now.getTime()) / (24 * 3600 * 1000);
  if (daysLeft > warnDays || daysLeft < 0) return null;
  if (warnedForDate === expiryDate) return null;
  return expiryDate;
}
