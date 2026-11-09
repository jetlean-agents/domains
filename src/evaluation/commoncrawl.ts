import { request } from "undici";
import { config } from "../config.js";
import { MinIntervalQueue } from "./rate-queue.js";
import type { RetryableError } from "../domain/rate-limit.js";

const COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";
const COLLECTION_TTL_MS = 24 * 3600 * 1000;
const PAGE_LIMIT = 1000;
const USER_AGENT = "JetLeanDomains/1.0 (+https://domains.jetlean.com; internal domain evaluation tool)";

export const commonCrawlQueue = new MinIntervalQueue(config.commonCrawl.minIntervalMs);

let collectionCache: { id: string; fetchedAt: number } | null = null;

async function latestCollectionId(): Promise<string> {
  if (collectionCache && Date.now() - collectionCache.fetchedAt < COLLECTION_TTL_MS) {
    return collectionCache.id;
  }
  const id = await commonCrawlQueue.run(async () => {
    const res = await request(COLLINFO_URL, {
      method: "GET",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(config.commonCrawl.timeoutMs),
    });
    if (res.statusCode >= 400) throw new Error(`Common Crawl collinfo HTTP ${res.statusCode}`);
    const body = (await res.body.json()) as Array<{ id: string }>;
    if (body.length === 0) throw new Error("Common Crawl collinfo returned no collections");
    return body[0].id;
  });
  collectionCache = { id, fetchedAt: Date.now() };
  return id;
}

export interface CommonCrawlPresence {
  pageCount: number;
  method: string;
}

/**
 * Cheap, honest backlink proxy: Common Crawl's Index API can only answer "which URLs under this
 * domain did Common Crawl itself crawl", not "who links to this domain" — a true backlink count
 * needs the host-level web graph, which is only distributed as bulk multi-GB files, out of scope
 * here (documented in docs/evaluation.md). We use the domain's own crawl footprint (page count in
 * the latest CC index) as a weak presence/popularity signal instead, and report zero top anchors.
 */
export async function fetchCommonCrawlPresence(domain: string): Promise<CommonCrawlPresence> {
  const collectionId = await latestCollectionId();
  const url =
    `https://index.commoncrawl.org/${collectionId}-index?url=${encodeURIComponent(`*.${domain}`)}` +
    `&output=json&limit=${PAGE_LIMIT}`;
  const raw = await commonCrawlQueue.run(async () => {
    const res = await request(url, {
      method: "GET",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(config.commonCrawl.timeoutMs),
    });
    if (res.statusCode === 404) return "";
    if (res.statusCode === 429 || res.statusCode >= 500) {
      const err: RetryableError = new Error(`Common Crawl index ${res.statusCode} for ${domain}`);
      err.retryable = true;
      throw err;
    }
    // Common Crawl's Index API legitimately uses 404 for "no captures matched" — any other
    // non-200 means the request itself was rejected and must not be read as "zero pages".
    if (res.statusCode !== 200) {
      const err: RetryableError = new Error(`Common Crawl index ${res.statusCode} for ${domain}`);
      err.retryable = false;
      throw err;
    }
    return res.body.text();
  });
  const pageCount = raw ? raw.trim().split("\n").filter(Boolean).length : 0;
  return { pageCount, method: "cc_index_page_count" };
}
