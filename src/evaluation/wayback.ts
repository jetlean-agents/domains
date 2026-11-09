import { request } from "undici";
import { config } from "../config.js";
import { MinIntervalQueue } from "./rate-queue.js";
import type { RetryableError } from "../domain/rate-limit.js";

const CDX_BASE = "https://web.archive.org/cdx/search/cdx";
const SNAPSHOT_BASE = "https://web.archive.org/web";
// archive.org responds 400/403 to some requests with no User-Agent at all; a descriptive one
// also lets them identify/throttle us specifically instead of lumping us in with generic bot traffic.
const USER_AGENT = "JetLeanDomains/1.0 (+https://domains.jetlean.com; internal domain evaluation tool)";

export const waybackQueue = new MinIntervalQueue(config.wayback.minIntervalMs);

export interface CdxRow {
  timestamp: string;
  original: string;
  statuscode: string;
}

/** Parses a Wayback CDX `output=json` response: first row is the header, rest are data rows. */
export function parseCdxResponse(raw: string): CdxRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return [];
  const header = parsed[0] as string[];
  const tsIdx = header.indexOf("timestamp");
  const originalIdx = header.indexOf("original");
  const statusIdx = header.indexOf("statuscode");
  if (tsIdx < 0) return [];
  const rows: CdxRow[] = [];
  for (const row of parsed.slice(1) as string[][]) {
    rows.push({
      timestamp: row[tsIdx],
      original: originalIdx >= 0 ? row[originalIdx] : "",
      statuscode: statusIdx >= 0 ? row[statusIdx] : "200",
    });
  }
  return rows;
}

/** Fetches the full CDX snapshot list for a domain, deduplicated by content digest, oldest first. */
export async function fetchCdx(domain: string): Promise<CdxRow[]> {
  const url =
    `${CDX_BASE}?url=${encodeURIComponent(domain)}&matchType=domain&output=json` +
    `&collapse=digest&filter=statuscode:200&fl=timestamp,original,statuscode&limit=10000`;
  const raw = await waybackQueue.run(async () => {
    const res = await request(url, {
      method: "GET",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(config.wayback.timeoutMs),
    });
    if (res.statusCode === 429 || res.statusCode >= 500) {
      const err: RetryableError = new Error(`Wayback CDX ${res.statusCode} for ${domain}`);
      err.retryable = true;
      throw err;
    }
    // A real "no snapshots" result is always HTTP 200 (with an empty/header-only body) — any
    // other 4xx means our request was rejected outright and must not be mistaken for "no_history".
    if (res.statusCode !== 200) {
      const err: RetryableError = new Error(`Wayback CDX ${res.statusCode} for ${domain}`);
      err.retryable = false;
      throw err;
    }
    return res.body.text();
  });
  const rows = parseCdxResponse(raw);
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return rows;
}

export interface WaybackSummary {
  firstSnapshot: string | null;
  lastSnapshot: string | null;
  snapshotCount: number;
  snapshotsByYear: Record<string, number>;
  ageYears: number | null;
}

function toIso(timestamp: string): string {
  // CDX timestamps are "YYYYMMDDhhmmss" UTC.
  const y = timestamp.slice(0, 4);
  const m = timestamp.slice(4, 6);
  const d = timestamp.slice(6, 8);
  const hh = timestamp.slice(8, 10) || "00";
  const mm = timestamp.slice(10, 12) || "00";
  const ss = timestamp.slice(12, 14) || "00";
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}

/** Summarizes a CDX row list into first/last snapshot, per-year counts and domain age in years. */
export function summarizeSnapshots(rows: CdxRow[]): WaybackSummary {
  if (rows.length === 0) {
    return { firstSnapshot: null, lastSnapshot: null, snapshotCount: 0, snapshotsByYear: {}, ageYears: null };
  }
  const snapshotsByYear: Record<string, number> = {};
  for (const row of rows) {
    const year = row.timestamp.slice(0, 4);
    snapshotsByYear[year] = (snapshotsByYear[year] ?? 0) + 1;
  }
  const first = rows[0].timestamp;
  const last = rows[rows.length - 1].timestamp;
  const firstDate = new Date(toIso(first));
  const ageYears = (Date.now() - firstDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  return {
    firstSnapshot: toIso(first),
    lastSnapshot: toIso(last),
    snapshotCount: rows.length,
    snapshotsByYear,
    ageYears: Math.round(ageYears * 100) / 100,
  };
}

/** Picks up to `sampleSize` snapshots spread across distinct years (oldest, newest, evenly spaced between). */
export function pickSampleSnapshots(rows: CdxRow[], sampleSize: number): CdxRow[] {
  if (rows.length === 0) return [];
  const byYear = new Map<string, CdxRow>();
  for (const row of rows) {
    byYear.set(row.timestamp.slice(0, 4), row);
  }
  const years = [...byYear.keys()].sort();
  if (years.length <= sampleSize) {
    return years.map((y) => byYear.get(y)!);
  }
  const picked: CdxRow[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.round((i * (years.length - 1)) / (sampleSize - 1));
    picked.push(byYear.get(years[idx])!);
  }
  return [...new Map(picked.map((r) => [r.timestamp, r])).values()];
}

/** Fetches one archived snapshot's raw (unmodified, `id_`) HTML content. */
export async function fetchSnapshotContent(row: CdxRow): Promise<string | null> {
  const url = `${SNAPSHOT_BASE}/${row.timestamp}id_/${row.original}`;
  return waybackQueue.run(async () => {
    try {
      const res = await request(url, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(config.wayback.timeoutMs),
      });
      if (res.statusCode === 429 || res.statusCode >= 500) {
        const err: RetryableError = new Error(`Wayback snapshot ${res.statusCode} for ${row.original}`);
        err.retryable = true;
        throw err;
      }
      if (res.statusCode >= 400) return null;
      return await res.body.text();
    } catch (err) {
      if ((err as RetryableError)?.retryable) throw err;
      return null;
    }
  });
}
