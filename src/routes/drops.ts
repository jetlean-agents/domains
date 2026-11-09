import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { listDrops, type DropsFilter, type DropRow } from "../db/queries.js";
import { checkDomain } from "../domain/pipeline.js";
import { importCsv } from "../csvimport/import.js";
import type { Niche } from "../evaluation/types.js";

const VALID_NICHES: Niche[] = ["auto", "energy", "news", "deals_us", "none"];

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
const MAX_CHECK = 100;

function parseFilter(query: Record<string, unknown>): DropsFilter {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const cursor = Number.parseInt(String(query.cursor ?? 0), 10);
  return {
    tld: typeof query.tld === "string" && query.tld ? query.tld : undefined,
    source: typeof query.source === "string" && query.source ? query.source : undefined,
    since: typeof query.since === "string" && query.since ? query.since : undefined,
    q: typeof query.q === "string" && query.q ? query.q : undefined,
    minLen: query.min_len ? Number.parseInt(String(query.min_len), 10) : undefined,
    maxLen: query.max_len ? Number.parseInt(String(query.max_len), 10) : undefined,
    noDigits: query.no_digits === "1",
    noHyphens: query.no_hyphens === "1",
    niche:
      typeof query.niche === "string" && (VALID_NICHES as string[]).includes(query.niche)
        ? (query.niche as Niche)
        : undefined,
    minScore: query.min_score ? Number.parseInt(String(query.min_score), 10) : undefined,
    minAge: query.min_age ? Number.parseFloat(String(query.min_age)) : undefined,
    sortByScore: query.sort === "score",
    limit,
    // Pagination is simple offset-based: `cursor` is just the previous offset. A
    // true keyset cursor (dropped_at,id) would survive concurrent inserts better,
    // but drops is append-mostly and this feed isn't paginated deep enough for it
    // to matter in practice.
    offset: Number.isFinite(cursor) && cursor > 0 ? cursor : 0,
  };
}

function toCsvRow(fields: string[]): string {
  return fields
    .map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

export function registerDropsRoutes(app: FastifyInstance): void {
  app.get("/api/v1/drops", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const filter = parseFilter(query);
    const rows = await listDrops(pool, filter);

    let results: Array<DropRow & { current_status?: string | null }> = rows;
    if (query.check === "1") {
      const toCheck = rows.slice(0, MAX_CHECK);
      const checked = await Promise.all(toCheck.map((r) => checkDomain(pool, r.domain, { deep: false })));
      const statusByDomain = new Map(checked.map((c) => [c.domain, c.status]));
      results = rows.map((r) => ({ ...r, current_status: statusByDomain.get(r.domain) ?? null }));
    }

    const nextCursor = rows.length === filter.limit ? filter.offset + filter.limit : null;
    return reply.send({ results, next_cursor: nextCursor });
  });

  app.get("/api/v1/drops/export.csv", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const filter = parseFilter({ ...query, limit: query.limit ?? MAX_LIMIT });
    const rows = await listDrops(pool, filter);
    const header = toCsvRow(["domain", "tld", "source", "dropped_at", "created_at", "score", "niche", "age_years"]);
    const lines = rows.map((r) =>
      toCsvRow([
        r.domain,
        r.tld,
        r.source,
        new Date(r.dropped_at).toISOString().slice(0, 10),
        new Date(r.created_at).toISOString(),
        r.score != null ? String(r.score) : "",
        r.niche ?? "",
        r.age_years != null ? String(r.age_years) : "",
      ]),
    );
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=drops.csv");
    return reply.send([header, ...lines].join("\n") + "\n");
  });

  app.post("/api/v1/imports", { preHandler: requireAuth }, async (req, reply) => {
    const text = typeof req.body === "string" ? req.body : String(req.body ?? "");
    if (!text.trim()) return reply.code(400).send({ error: "empty_body" });
    const result = await importCsv(pool, text);
    return reply.send(result);
  });
}
