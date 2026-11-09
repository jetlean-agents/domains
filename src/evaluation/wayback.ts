import { request } from "undici";
import { config } from "../config.js";
import { MinIntervalQueue, getHeader, parseRetryAfterMs, type QueueError } from "./rate-queue.js";

const CDX_BASE = "https://web.archive.org/cdx/search/cdx";
const SNAPSHOT_BASE = "https://web.archive.org/web";
// archive.org responds 400/403 to some requests with no User-Agent at all; a descriptive one
// also lets them identify/throttle us specifically instead of lumping us in with generic bot traffic.
const USER_AGENT = "JetLeanDomains/1.0 (+https://domains.jetlean.com; internal domain evaluation tool)";

export const waybackQueue = new MinIntervalQueue(config.wayback.minIntervalMs, "wayback");

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

/**
 * Builds a CDX query for exactly one host (no `matchType=domain`, which pulls in every indexed
 * URL of every subdomain — far too heavy for a domain like an old `.com`). `collapse=timestamp:6`
 * keeps at most one capture per calendar month, which is plenty of resolution for a yearly sample.
 */
export function buildCdxUrl(host: string): string {
  return (
    `${CDX_BASE}?url=${encodeURIComponent(host)}&output=json` +
    `&collapse=timestamp:6&filter=statuscode:200&fl=timestamp,original,statuscode&limit=10000`
  );
}

/** Merges two CDX row lists, de-duplicated by (timestamp, original), sorted oldest first. */
export function mergeCdxRows(a: CdxRow[], b: CdxRow[]): CdxRow[] {
  const seen = new Set<string>();
  const merged: CdxRow[] = [];
  for (const row of [...a, ...b]) {
    const key = `${row.timestamp}|${row.original}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  merged.sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  return merged;
}

function cdxError(statusCode: number, headers: Record<string, string | string[] | undefined>, host: string): QueueError {
  const err: QueueError = new Error(`Wayback CDX ${statusCode} for ${host}`);
  err.statusCode = statusCode;
  if (statusCode === 429 || statusCode === 503) {
    err.retryable = true;
    err.retryAfterMs = parseRetryAfterMs(getHeader(headers, "retry-after"));
  } else if (statusCode >= 500) {
    err.retryable = true;
  } else {
    // A real "no snapshots" result is always HTTP 200 (with an empty/header-only body) — any
    // other 4xx means our request was rejected outright and must not be mistaken for "no_history".
    err.retryable = false;
  }
  return err;
}

/** True for an `AbortSignal.timeout()` rejection (Node/undici raise it as a DOMException-like Error). */
function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

/** A single CDX request scoped to a `[fromYear, toYear]` window, so each query stays cheap. */
export function buildCdxUrlForRange(host: string, fromYear: number, toYear: number): string {
  return `${buildCdxUrl(host)}&from=${fromYear}&to=${toYear}`;
}

async function fetchCdxUrl(url: string, host: string, opts?: { retries?: number }): Promise<CdxRow[]> {
  const raw = await waybackQueue.run(
    async () => {
      const res = await request(url, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(config.wayback.timeoutMs),
      });
      if (res.statusCode !== 200) {
        throw cdxError(res.statusCode, res.headers as Record<string, string | string[] | undefined>, host);
      }
      return res.body.text();
    },
    opts,
  );
  return parseCdxResponse(raw);
}

const RANGE_CHUNK_YEARS = 5;
// Wayback's earliest captures are from 1996; no point paginating further back than that.
const WAYBACK_FIRST_YEAR = 1996;

/**
 * Fallback for hosts whose full-history CDX query times out (e.g. `yahoo.com`, decades of
 * captures): splits the same query into small `[from, to]` year windows so each request stays
 * cheap for the upstream to compute, instead of raising `WAYBACK_TIMEOUT_MS` for everyone.
 */
async function fetchCdxForHostByRanges(host: string): Promise<CdxRow[]> {
  const currentYear = new Date().getUTCFullYear();
  const rows: CdxRow[] = [];
  for (let from = WAYBACK_FIRST_YEAR; from <= currentYear; from += RANGE_CHUNK_YEARS) {
    const to = Math.min(from + RANGE_CHUNK_YEARS - 1, currentYear);
    rows.push(...(await fetchCdxUrl(buildCdxUrlForRange(host, from, to), host)));
  }
  return rows;
}

async function fetchCdxForHost(host: string): Promise<CdxRow[]> {
  try {
    // Fail fast (no retry) on the full-range query: a timeout here is likely to time out again,
    // and we'd rather spend that time on the ranged fallback below than on more full-range retries.
    return await fetchCdxUrl(buildCdxUrl(host), host, { retries: 0 });
  } catch (err) {
    if (!isTimeoutError(err)) throw err;
    console.warn(`fetchCdxForHost: full-range CDX query for ${host} timed out, retrying by year range`);
    return fetchCdxForHostByRanges(host);
  }
}

/**
 * Fetches the CDX snapshot list for a domain: the bare host plus `www.<host>` (two cheap,
 * host-scoped queries instead of one `matchType=domain` query over every subdomain/path), merged
 * and de-duplicated. If the `www.` query fails after retries, falls back to apex-only history
 * rather than losing an otherwise-successful result.
 */
export async function fetchCdx(domain: string): Promise<CdxRow[]> {
  const apex = await fetchCdxForHost(domain);
  if (domain.startsWith("www.")) return apex;
  try {
    const www = await fetchCdxForHost(`www.${domain}`);
    return mergeCdxRows(apex, www);
  } catch (err) {
    console.warn(
      `fetchCdx: www.${domain} query failed, using apex-only history:`,
      err instanceof Error ? err.message : err,
    );
    return apex;
  }
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

/** Fetches one archived snapshot's raw (unmodified, `id_`) HTML content; null if unavailable. */
export async function fetchSnapshotContent(row: CdxRow): Promise<string | null> {
  const url = `${SNAPSHOT_BASE}/${row.timestamp}id_/${row.original}`;
  try {
    return await waybackQueue.run(async () => {
      const res = await request(url, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(config.wayback.timeoutMs),
      });
      if (res.statusCode !== 200) {
        throw cdxError(res.statusCode, res.headers as Record<string, string | string[] | undefined>, row.original);
      }
      return res.body.text();
    });
  } catch {
    // One missing sample degrades the analysis (fewer years sampled) but isn't fatal — the
    // domain-level CDX list fetch above is what must succeed for the evaluation to proceed.
    return null;
  }
}
