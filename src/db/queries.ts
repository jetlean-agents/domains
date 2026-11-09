import type { Pool } from "pg";
import type { CheckResult, DomainStatus, Source } from "../domain/types.js";
import type { EvaluationResult, Niche } from "../evaluation/types.js";

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
  niche?: Niche;
  minScore?: number;
  minAge?: number;
  sortByScore?: boolean;
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
  score?: number | null;
  niche?: Niche | null;
  niche_confidence?: number | null;
  age_years?: number | null;
  flags?: EvaluationResult["flags"] | null;
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
  // `niche` / `score` / `age_years` are not drops columns — listDrops resolves them via a
  // LEFT JOIN on a sub-select that renames domain_evaluations.domain, so these stay unqualified
  // and unambiguous there while keeping this function's output unchanged when they're unset.
  if (filter.niche) {
    params.push(filter.niche);
    clauses.push(`niche = $${params.length}`);
  }
  if (filter.minScore !== undefined) {
    params.push(filter.minScore);
    clauses.push(`score >= $${params.length}`);
  }
  if (filter.minAge !== undefined) {
    params.push(filter.minAge);
    clauses.push(`age_years >= $${params.length}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

/** Lists drops matching filters, newest first (or by score when `sortByScore`); offset-based pagination. */
export async function listDrops(pool: Pool, filter: DropsFilter): Promise<DropRow[]> {
  const { where, params } = buildDropsWhere(filter);
  params.push(filter.limit, filter.offset);
  const orderBy = filter.sortByScore
    ? "score DESC NULLS LAST, dropped_at DESC, id DESC"
    : "dropped_at DESC, id DESC";
  const { rows } = await pool.query(
    `SELECT drops.id, drops.domain, drops.tld, drops.source, drops.dropped_at, drops.created_at,
            ev.score, ev.niche, ev.niche_confidence, ev.age_years, ev.flags
     FROM drops
     LEFT JOIN (
       SELECT domain AS eval_domain, score, niche, niche_confidence, age_years, flags
       FROM domain_evaluations
     ) ev ON ev.eval_domain = drops.domain
     ${where}
     ORDER BY ${orderBy}
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

function rowToEvaluation(row: any): EvaluationResult {
  return {
    domain: row.domain,
    score: row.score,
    breakdown: row.breakdown,
    niche: row.niche,
    niche_confidence: row.niche_confidence,
    flags: row.flags,
    age_years: row.age_years,
    first_snapshot: row.first_snapshot ? new Date(row.first_snapshot).toISOString() : null,
    last_snapshot: row.last_snapshot ? new Date(row.last_snapshot).toISOString() : null,
    snapshot_count: row.snapshot_count,
    snapshots_by_year: row.snapshots_by_year,
    backlinks_estimate: row.backlinks_estimate,
    top_anchors: row.top_anchors,
    backlinks_method: row.backlinks_method,
    computed_at: new Date(row.computed_at).toISOString(),
    cache_expires_at: new Date(row.cache_expires_at).toISOString(),
  };
}

/** Returns a stored evaluation only if its cache hasn't expired yet; null otherwise (forces a recompute). */
export async function getFreshEvaluation(pool: Pool, domain: string): Promise<EvaluationResult | null> {
  const { rows } = await pool.query(
    `SELECT * FROM domain_evaluations WHERE domain = $1 AND cache_expires_at > now()`,
    [domain],
  );
  return rows.length > 0 ? rowToEvaluation(rows[0]) : null;
}

/** Returns a stored evaluation regardless of TTL (used by read-only API/UI lookups). */
export async function getEvaluation(pool: Pool, domain: string): Promise<EvaluationResult | null> {
  const { rows } = await pool.query(`SELECT * FROM domain_evaluations WHERE domain = $1`, [domain]);
  return rows.length > 0 ? rowToEvaluation(rows[0]) : null;
}

export async function getEvaluations(pool: Pool, domains: string[]): Promise<EvaluationResult[]> {
  if (domains.length === 0) return [];
  const { rows } = await pool.query(`SELECT * FROM domain_evaluations WHERE domain = ANY($1)`, [domains]);
  return rows.map(rowToEvaluation);
}

export async function upsertEvaluation(
  pool: Pool,
  result: EvaluationResult,
  ttlSeconds: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO domain_evaluations (
       domain, score, breakdown, niche, niche_confidence, flags, age_years,
       first_snapshot, last_snapshot, snapshot_count, snapshots_by_year,
       backlinks_estimate, top_anchors, backlinks_method, computed_at, cache_expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now() + ($16 || ' seconds')::interval)
     ON CONFLICT (domain) DO UPDATE SET
       score = EXCLUDED.score,
       breakdown = EXCLUDED.breakdown,
       niche = EXCLUDED.niche,
       niche_confidence = EXCLUDED.niche_confidence,
       flags = EXCLUDED.flags,
       age_years = EXCLUDED.age_years,
       first_snapshot = EXCLUDED.first_snapshot,
       last_snapshot = EXCLUDED.last_snapshot,
       snapshot_count = EXCLUDED.snapshot_count,
       snapshots_by_year = EXCLUDED.snapshots_by_year,
       backlinks_estimate = EXCLUDED.backlinks_estimate,
       top_anchors = EXCLUDED.top_anchors,
       backlinks_method = EXCLUDED.backlinks_method,
       computed_at = EXCLUDED.computed_at,
       cache_expires_at = EXCLUDED.cache_expires_at`,
    [
      result.domain,
      result.score,
      JSON.stringify(result.breakdown),
      result.niche,
      result.niche_confidence,
      JSON.stringify(result.flags),
      result.age_years,
      result.first_snapshot,
      result.last_snapshot,
      result.snapshot_count,
      JSON.stringify(result.snapshots_by_year),
      result.backlinks_estimate,
      JSON.stringify(result.top_anchors),
      result.backlinks_method,
      result.computed_at,
      ttlSeconds,
    ],
  );
}

export interface EvaluationJobRow {
  id: string;
  domains: string[];
  status: "pending" | "running" | "done" | "error";
  results: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function insertEvaluationJob(pool: Pool, domains: string[]): Promise<EvaluationJobRow> {
  const { rows } = await pool.query(
    `INSERT INTO evaluation_jobs (domains) VALUES ($1) RETURNING *`,
    [domains],
  );
  return rows[0];
}

export async function updateEvaluationJob(
  pool: Pool,
  id: string,
  patch: { status: "running" | "done" | "error"; results?: unknown; error?: string },
): Promise<void> {
  await pool.query(
    `UPDATE evaluation_jobs SET
       status = $2,
       results = COALESCE($3, results),
       error = $4,
       completed_at = CASE WHEN $2 IN ('done', 'error') THEN now() ELSE completed_at END
     WHERE id = $1`,
    [id, patch.status, patch.results ? JSON.stringify(patch.results) : null, patch.error ?? null],
  );
}

export async function getEvaluationJob(pool: Pool, id: string): Promise<EvaluationJobRow | null> {
  const { rows } = await pool.query(`SELECT * FROM evaluation_jobs WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Today's (UTC) count of fresh (non-cached) auto-evaluations, used to enforce EVAL_DAILY_LIMIT. */
export async function getAutoEvalCountToday(pool: Pool): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count FROM auto_eval_daily_counts WHERE run_date = (now() AT TIME ZONE 'UTC')::date`,
  );
  return rows[0]?.count ?? 0;
}

export async function incrementAutoEvalCount(pool: Pool, by: number): Promise<void> {
  await pool.query(
    `INSERT INTO auto_eval_daily_counts (run_date, count) VALUES ((now() AT TIME ZONE 'UTC')::date, $1)
     ON CONFLICT (run_date) DO UPDATE SET count = auto_eval_daily_counts.count + EXCLUDED.count`,
    [by],
  );
}

/** Drop domains with no evaluation yet, or one whose cache has expired, newest drop first. */
export async function listDropDomainsNeedingEvaluation(pool: Pool, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT drops.domain, MAX(drops.dropped_at) AS last_dropped_at
     FROM drops
     LEFT JOIN domain_evaluations e ON e.domain = drops.domain
     WHERE e.domain IS NULL OR e.cache_expires_at <= now()
     GROUP BY drops.domain
     ORDER BY last_dropped_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r: { domain: string }) => r.domain);
}
