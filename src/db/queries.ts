import type { Pool } from "pg";
import type { CheckResult, DomainStatus, Source } from "../domain/types.js";

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
