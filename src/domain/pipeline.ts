import type { Pool } from "pg";
import { config } from "../config.js";
import { normalizeDomain, InvalidDomainError } from "./normalize.js";
import { hasNsRecords } from "./dns.js";
import { findRdapServers, queryRdap } from "./rdap.js";
import { resolveWhoisServer, queryWhois } from "./whois-client.js";
import { getWhoisParser } from "./parsers/index.js";
import { getCached, upsertCache, type CachedCheckResult } from "../db/queries.js";
import type { CheckResult, DomainStatus, Source } from "./types.js";

/**
 * A DNS-only cache hit (fast-path `source=dns`, no RDAP/whois lookup) is always `registered`
 * with no `expires_at`. For a deep check (watchlist), that's not good enough to raise/clear an
 * expiry warning, so a registered domain cached without `expires_at` must be treated as a cache
 * miss and re-resolved via RDAP/whois, regardless of which source originally produced it.
 */
function isStaleForDeepCheck(cached: CachedCheckResult): boolean {
  const isRegisteredLike =
    cached.status === "registered" || cached.status === "pending_delete" || cached.status === "redemption";
  return isRegisteredLike && cached.expires_at === null;
}

function ttlFor(status: DomainStatus): number {
  if (status === "registered" || status === "pending_delete" || status === "redemption") {
    return config.cacheTtlSeconds.registered;
  }
  if (status === "available") return config.cacheTtlSeconds.available;
  return config.cacheTtlSeconds.unknown;
}

async function resolveViaRdapOrWhois(
  ascii: string,
  publicSuffix: string,
): Promise<{
  status: DomainStatus;
  expiresAt: string | null;
  registrar: string | null;
  source: Exclude<Source, "cache" | "dns">;
}> {
  try {
    const servers = await findRdapServers(publicSuffix, config.rdapTimeoutMs);
    for (const base of servers) {
      const result = await queryRdap(base, ascii, config.rdapTimeoutMs);
      if (result === null) {
        return { status: "available", expiresAt: null, registrar: null, source: "rdap" };
      }
      return { ...result, source: "rdap" };
    }
  } catch {
    // fall through to whois
  }

  try {
    const server = await resolveWhoisServer(publicSuffix, config.whoisTimeoutMs);
    if (!server) return { status: "unknown", expiresAt: null, registrar: null, source: "whois" };
    const raw = await queryWhois(server, ascii, config.whoisTimeoutMs);
    const parsed = getWhoisParser(publicSuffix)(raw);
    return { ...parsed, expiresAt: parsed.expiresAt, source: "whois" };
  } catch {
    return { status: "unknown", expiresAt: null, registrar: null, source: "whois" };
  }
}

/** Runs the full DNS -> RDAP -> whois pipeline for one domain, using cache when available. */
export async function checkDomain(
  pool: Pool,
  rawInput: string,
  opts: { deep?: boolean } = {},
): Promise<CheckResult> {
  let normalized;
  try {
    normalized = normalizeDomain(rawInput);
  } catch (err) {
    if (err instanceof InvalidDomainError) {
      return {
        domain: rawInput,
        status: "unknown",
        expires_at: null,
        registrar: null,
        source: "dns",
        checked_at: new Date().toISOString(),
        error: "invalid_domain",
      };
    }
    throw err;
  }

  const { ascii, publicSuffix } = normalized;

  const cached = await getCached(pool, ascii);
  if (cached && !(opts.deep && isStaleForDeepCheck(cached))) {
    return { ...cached, source: "cache" };
  }

  if (!publicSuffix) {
    return {
      domain: ascii,
      status: "unknown",
      expires_at: null,
      registrar: null,
      source: "dns",
      checked_at: new Date().toISOString(),
      error: "unknown_suffix",
    };
  }

  if (!opts.deep) {
    const delegated = await hasNsRecords(ascii);
    if (delegated) {
      const result: CheckResult & { source: Exclude<Source, "cache"> } = {
        domain: ascii,
        status: "registered",
        expires_at: null,
        registrar: null,
        source: "dns",
        checked_at: new Date().toISOString(),
      };
      await upsertCache(pool, result, ttlFor(result.status));
      return result;
    }
  }

  const resolved = await resolveViaRdapOrWhois(ascii, publicSuffix);
  const result: CheckResult & { source: Exclude<Source, "cache"> } = {
    domain: ascii,
    status: resolved.status,
    expires_at: resolved.expiresAt,
    registrar: resolved.registrar,
    source: resolved.source,
    checked_at: new Date().toISOString(),
  };
  await upsertCache(pool, result, ttlFor(result.status));
  return result;
}
