import type { Pool } from "pg";
import { getPublicSuffix } from "tldts";
import { checkDomain } from "../domain/pipeline.js";
import { listWatchlist, updateWatchlistStatus, insertDrops } from "../db/queries.js";
import type { DomainStatus } from "../domain/types.js";

/** Statuses that, when newly reached, represent a "drop" worth surfacing in the feed. */
const DROP_STATUSES: ReadonlySet<DomainStatus> = new Set(["pending_delete", "redemption", "available"]);

export function isDropTransition(previous: DomainStatus, next: DomainStatus): boolean {
  return previous !== next && DROP_STATUSES.has(next);
}

/** Rechecks every watched .ua/.com.ua domain and records drops on status transitions into pending_delete/redemption/available. */
export async function recheckWatchlist(pool: Pool): Promise<{ checked: number; dropped: number }> {
  const watched = await listWatchlist(pool);
  let dropped = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of watched) {
    const result = await checkDomain(pool, entry.domain, { deep: true });
    if (isDropTransition(entry.status, result.status)) {
      const tld = getPublicSuffix(entry.domain) ?? "ua";
      await insertDrops(pool, [{ domain: entry.domain, tld, source: "rdap_watch", dropped_at: today }]);
      dropped += 1;
    }
    await updateWatchlistStatus(pool, entry.domain, result.status);
  }

  return { checked: watched.length, dropped };
}
