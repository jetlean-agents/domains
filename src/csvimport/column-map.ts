export type Provider = "expireddomains" | "godaddy" | "dynadot" | "generic";

export interface ColumnMap {
  provider: Provider;
  domainCol: number;
  dateCol: number | null;
}

/**
 * Detects the CSV provider from its header row. Real-world exports vary a lot,
 * so this is a pragmatic heuristic based on a couple of distinguishing column
 * names rather than an exact header match:
 *  - ExpiredDomains.net exports include backlink/authority columns
 *    ("Backlinks", "DomainPopularity"/"Majestic") alongside "Domain Name".
 *  - GoDaddy auctions/expiring lists include an "Auction End" column.
 *  - Dynadot marketplace/expiring exports use "Domain Name" + "Price" without
 *    the above-mentioned columns.
 *  - Anything else falls back to "generic": first column = domain, optional
 *    second column = drop/available date.
 */
export function detectColumnMap(header: string[]): ColumnMap {
  const norm = header.map((h) => h.trim().toLowerCase());

  const domainCol = norm.findIndex((h) => h === "domain name" || h === "domain");
  if (domainCol === -1) {
    return { provider: "generic", domainCol: 0, dateCol: norm.length > 1 ? 1 : null };
  }

  const hasBacklinks = norm.some((h) => h.includes("backlink") || h.includes("majestic") || h.includes("domainpopularity"));
  const hasAuctionEnd = norm.some((h) => h.includes("auction end"));
  const hasPrice = norm.some((h) => h === "price" || h.includes("buy now price"));

  let provider: Provider = "generic";
  if (hasBacklinks) provider = "expireddomains";
  else if (hasAuctionEnd) provider = "godaddy";
  else if (hasPrice) provider = "dynadot";

  const dateCandidates = ["drop date", "drop_date", "available date", "auction end", "expiration date", "expiry date"];
  const dateCol = norm.findIndex((h) => dateCandidates.includes(h));

  return { provider, domainCol, dateCol: dateCol === -1 ? null : dateCol };
}
