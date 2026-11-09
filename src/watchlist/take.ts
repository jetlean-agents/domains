import type { Pool } from "pg";
import { createAutoregSite } from "./autoreg-client.js";
import { claimWatchlistForAutoreg, setWatchlistAutoregSiteId } from "../db/queries.js";

export interface TakeableEntry {
  id: string;
  domain: string;
  niche: string | null;
  desired_action: string;
  autoreg_site_id: string | null;
}

export interface TakeResult {
  siteId: string;
  created: boolean;
}

/** Thrown when another "взять в работу" attempt for this entry is already in flight. */
export class TakeInProgressError extends Error {
  constructor() {
    super("take_in_progress");
    this.name = "TakeInProgressError";
  }
}

// Generous but bounded: covers a slow Autoreg round-trip without leaving a crashed attempt
// permanently stuck (the claim expires and a retry becomes possible again).
const CLAIM_TTL_SECONDS = 60;

/**
 * Idempotently "takes" a watchlist entry into Autoreg. A pre-existing `autoreg_site_id`
 * short-circuits before any DB write or Autoreg call. Otherwise it claims the row with a
 * conditional UPDATE *before* calling Autoreg (`claimWatchlistForAutoreg`) — a losing concurrent
 * call (double-click, or two requests racing) never reaches Autoreg at all, so it can't create a
 * second site; it fails fast with `TakeInProgressError` instead.
 */
export async function takeToAutoreg(pool: Pool, entry: TakeableEntry): Promise<TakeResult> {
  if (entry.autoreg_site_id) {
    return { siteId: entry.autoreg_site_id, created: false };
  }
  if (!entry.niche) {
    throw new Error("missing_niche");
  }
  const claimed = await claimWatchlistForAutoreg(pool, entry.id, CLAIM_TTL_SECONDS);
  if (!claimed) {
    throw new TakeInProgressError();
  }
  const siteId = await createAutoregSite(entry.domain, entry.niche, entry.desired_action);
  await setWatchlistAutoregSiteId(pool, entry.id, siteId);
  return { siteId, created: true };
}
