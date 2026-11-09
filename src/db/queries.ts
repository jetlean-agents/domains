import type { Pool } from "pg";
import type { CheckResult, DomainStatus, Source } from "../domain/types.js";

export interface DropInsert {
  domain: string;
  tld: string;
  source: string;
  dropped_at: string;
}

/** Bulk-inserts drops, de-duplicating on (domain, source, dropped_at). */
export async function insertDrops(pool: Pool, drops: DropInsert[]): Promise<number> {
  if (drops.length === 0) return 0;
  const values: string[] = [];
  const params: unknown[] = [];
  drops.forEach((d, i) => {
    const base = i * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(d.domain, d.tld, d.source, d.dropped_at);
  });
  const { rowCount } = await pool.query(
    `INSERT INTO drops (domain, tld, source, dropped_at) VALUES ${values.join(", ")}
     ON CONFLICT (domain, source, dropped_at) DO NOTHING`,
    params,
  );
  return rowCount ?? 0;
}

export interface DropsFilter {
  tld?: string;
  source?: string;
  since?: string;
  q?: string;
  minLen?: number;
  maxLen?: number;
  noDigits?: boolean;
  noHyphens?: boolean;
  limit: number;
  offset: number;
}

export interface DropRow {
  id: string;
  domain: string;
  tld: string;
  source: string;
  dropped_at: string;
  created_at: string;
}

/** Builds the WHERE clause + params for `drops` list filters; pure, no DB access (unit-testable). */
export function buildDropsWhere(filter: DropsFilter): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.tld) {
    params.push(filter.tld);
    clauses.push(`tld = $${params.length}`);
  }
  if (filter.source) {
    params.push(filter.source);
    clauses.push(`source = $${params.length}`);
  }
  if (filter.since) {
    params.push(filter.since);
    clauses.push(`dropped_at >= $${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    clauses.push(`domain ILIKE $${params.length}`);
  }
  if (filter.minLen !== undefined) {
    params.push(filter.minLen);
    clauses.push(`length(domain) >= $${params.length}`);
  }
  if (filter.maxLen !== undefined) {
    params.push(filter.maxLen);
    clauses.push(`length(domain) <= $${params.length}`);
  }
  if (filter.noDigits) {
    clauses.push(`domain !~ '[0-9]'`);
  }
  if (filter.noHyphens) {
    clauses.push(`domain !~ '-'`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

/** Lists drops matching filters, newest first; pagination is simple offset-based (documented in the API). */
export async function listDrops(pool: Pool, filter: DropsFilter): Promise<DropRow[]> {
  const { where, params } = buildDropsWhere(filter);
  params.push(filter.limit, filter.offset);
  const { rows } = await pool.query(
    `SELECT id, domain, tld, source, dropped_at, created_at FROM drops
     ${where}
     ORDER BY dropped_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function getCached(pool: Pool, domain: string): Promise<CheckResult | null> {
  const { rows } = await pool.query(
    `SELECT domain, status, expires_at, registrar, checked_at
     FROM domain_cache WHERE domain = $1 AND cache_expires_at > now()`,
    [domain],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    domain: row.domain,
    status: row.status as DomainStatus,
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    registrar: row.registrar,
    source: "cache",
    checked_at: new Date(row.checked_at).toISOString(),
  };
}

export async function upsertCache(
  pool: Pool,
  result: CheckResult & { source: Exclude<Source, "cache"> },
  ttlSeconds: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO domain_cache (domain, status, expires_at, registrar, source, checked_at, cache_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)
     ON CONFLICT (domain) DO UPDATE SET
       status = EXCLUDED.status,
       expires_at = EXCLUDED.expires_at,
       registrar = EXCLUDED.registrar,
       source = EXCLUDED.source,
       checked_at = EXCLUDED.checked_at,
       cache_expires_at = EXCLUDED.cache_expires_at`,
    [
      result.domain,
      result.status,
      result.expires_at,
      result.registrar,
      result.source,
      result.checked_at,
      ttlSeconds,
    ],
  );
}

export async function findTokenHashes(pool: Pool): Promise<
  Array<{ id: string; token_hash: string; is_admin: boolean }>
> {
  const { rows } = await pool.query(
    `SELECT id, token_hash, is_admin FROM tokens WHERE revoked_at IS NULL`,
  );
  return rows;
}

export async function insertToken(
  pool: Pool,
  name: string,
  tokenHash: string,
  isAdmin: boolean,
): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `INSERT INTO tokens (name, token_hash, is_admin) VALUES ($1, $2, $3) RETURNING id`,
    [name, tokenHash, isAdmin],
  );
  return rows[0];
}

export interface TokenSummary {
  id: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  revoked_at: string | null;
}

export async function listTokens(pool: Pool): Promise<TokenSummary[]> {
  const { rows } = await pool.query(
    `SELECT id, name, is_admin, created_at, revoked_at FROM tokens ORDER BY created_at DESC`,
  );
  return rows;
}

/** Revokes a token by name or id; returns false if no matching, not-yet-revoked token exists. */
export async function revokeToken(
  pool: Pool,
  by: { name: string } | { id: string },
): Promise<boolean> {
  const column = "name" in by ? "name" : "id";
  const value = "name" in by ? by.name : by.id;
  const { rowCount } = await pool.query(
    `UPDATE tokens SET revoked_at = now() WHERE ${column} = $1 AND revoked_at IS NULL`,
    [value],
  );
  return (rowCount ?? 0) > 0;
}

export interface UaWatchlistRow {
  id: string;
  domain: string;
  status: DomainStatus;
  last_checked_at: string | null;
}

export async function seedWatchlist(pool: Pool, domains: string[]): Promise<number> {
  if (domains.length === 0) return 0;
  const values = domains.map((_, i) => `($${i + 1})`).join(", ");
  const { rowCount } = await pool.query(
    `INSERT INTO ua_watchlist (domain) VALUES ${values} ON CONFLICT (domain) DO NOTHING`,
    domains,
  );
  return rowCount ?? 0;
}

export async function listWatchlist(pool: Pool): Promise<UaWatchlistRow[]> {
  const { rows } = await pool.query(
    `SELECT id, domain, status, last_checked_at FROM ua_watchlist ORDER BY domain`,
  );
  return rows;
}

export async function updateWatchlistStatus(
  pool: Pool,
  domain: string,
  status: DomainStatus,
): Promise<void> {
  await pool.query(
    `UPDATE ua_watchlist SET status = $2, last_checked_at = now() WHERE domain = $1`,
    [domain, status],
  );
}

export async function recordCsvImport(
  pool: Pool,
  info: { sourceUrl?: string | null; provider: string; rowCount: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO csv_imports (source_url, provider, row_count) VALUES ($1, $2, $3)`,
    [info.sourceUrl ?? null, info.provider, info.rowCount],
  );
}
