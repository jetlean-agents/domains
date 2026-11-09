import { request } from "undici";
import type { DomainStatus } from "./types.js";
import { HostRateLimiter } from "./rate-limit.js";
import type { RetryableError } from "./rate-limit.js";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 3600 * 1000;

interface BootstrapEntry {
  suffixes: string[];
  urls: string[];
}

let bootstrapCache: { entries: BootstrapEntry[]; fetchedAt: number } | null = null;

async function loadBootstrap(timeoutMs: number): Promise<BootstrapEntry[]> {
  if (bootstrapCache && Date.now() - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrapCache.entries;
  }
  const res = await request(BOOTSTRAP_URL, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.body.json()) as { services: [string[], string[]][] };
  const entries: BootstrapEntry[] = body.services.map(([suffixes, urls]) => ({
    suffixes,
    urls,
  }));
  bootstrapCache = { entries, fetchedAt: Date.now() };
  return entries;
}

/** Finds the RDAP base URL(s) for a public suffix (e.g. "com", "com.ua"). */
export async function findRdapServers(
  publicSuffix: string,
  timeoutMs: number,
): Promise<string[]> {
  const entries = await loadBootstrap(timeoutMs);
  const match = entries.find((e) => e.suffixes.includes(publicSuffix));
  return match?.urls ?? [];
}

export interface RdapResult {
  status: DomainStatus;
  expiresAt: string | null;
  registrar: string | null;
}

const RDAP_STATUS_MAP: Record<string, DomainStatus> = {
  "pending delete": "pending_delete",
  "redemption period": "redemption",
  "pending delete restorable": "redemption",
};

export function mapRdapStatuses(statuses: string[] | undefined): DomainStatus {
  if (!statuses || statuses.length === 0) return "registered";
  for (const s of statuses) {
    const mapped = RDAP_STATUS_MAP[s.toLowerCase()];
    if (mapped) return mapped;
  }
  return "registered";
}

function extractRegistrar(entities: any[] | undefined): string | null {
  if (!entities) return null;
  const registrar = entities.find((e) => (e.roles ?? []).includes("registrar"));
  if (!registrar) return null;
  const vcard = registrar.vcardArray?.[1] as any[] | undefined;
  const fn = vcard?.find((entry) => entry[0] === "fn");
  return fn?.[3] ?? registrar.handle ?? null;
}

function extractExpiry(events: any[] | undefined): string | null {
  if (!events) return null;
  const expiry = events.find((e) => e.eventAction === "expiration");
  return expiry?.eventDate ?? null;
}

const limiter = new HostRateLimiter(
  Number(process.env.PER_HOST_CONCURRENCY ?? 2),
  Number(process.env.PER_HOST_RPS ?? 1),
);

/** Queries an RDAP server for a domain; returns null on a definitive "not found" (= available). */
export async function queryRdap(
  rdapBaseUrl: string,
  domain: string,
  timeoutMs: number,
): Promise<RdapResult | null> {
  const host = new URL(rdapBaseUrl).host;
  const url = `${rdapBaseUrl.replace(/\/$/, "")}/domain/${domain}`;
  return limiter.run(host, async () => {
    const res = await request(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/rdap+json" },
    });
    if (res.statusCode === 404) return null;
    if (res.statusCode === 429 || res.statusCode >= 500) {
      const err: RetryableError = new Error(`RDAP ${res.statusCode} for ${domain}`);
      err.retryable = true;
      throw err;
    }
    if (res.statusCode >= 400) {
      const err: RetryableError = new Error(`RDAP ${res.statusCode} for ${domain}`);
      err.retryable = false;
      throw err;
    }
    const body = (await res.body.json()) as any;
    return {
      status: mapRdapStatuses(body.status),
      expiresAt: extractExpiry(body.events),
      registrar: extractRegistrar(body.entities),
    };
  });
}
