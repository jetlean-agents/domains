import { createAutoregSite } from "./autoreg-client.js";

export interface TakeableEntry {
  domain: string;
  niche: string | null;
  desired_action: string;
  autoreg_site_id: string | null;
}

export interface TakeResult {
  siteId: string;
  created: boolean;
}

/**
 * Idempotently "takes" a watchlist entry into Autoreg: a pre-existing `autoreg_site_id` short-
 * circuits before any Autoreg call (repeat clicks of "взять в работу" are free and safe).
 */
export async function takeToAutoreg(entry: TakeableEntry): Promise<TakeResult> {
  if (entry.autoreg_site_id) {
    return { siteId: entry.autoreg_site_id, created: false };
  }
  if (!entry.niche) {
    throw new Error("missing_niche");
  }
  const siteId = await createAutoregSite(entry.domain, entry.niche, entry.desired_action);
  return { siteId, created: true };
}
