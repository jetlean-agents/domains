import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import {
  addWatchlistEntry,
  listWatchlistEntries,
  getWatchlistEntry,
  deleteWatchlistEntry,
  listWatchEvents,
} from "../db/queries.js";
import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";
import { recheckWatchlistEntry } from "../watchlist/recheck.js";
import { autoregEnabled } from "../watchlist/autoreg-client.js";
import { takeToAutoreg, TakeInProgressError } from "../watchlist/take.js";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const cursor = Number.parseInt(String(query.cursor ?? 0), 10);
  return { limit, offset: Number.isFinite(cursor) && cursor > 0 ? cursor : 0 };
}

export function registerWatchlistRoutes(app: FastifyInstance): void {
  app.post("/api/v1/watchlist", { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as { domain?: string; niche?: string; note?: string; desired_action?: string };
    if (!body.domain) return reply.code(400).send({ error: "missing_domain" });
    let ascii: string;
    try {
      ascii = normalizeDomain(body.domain).ascii;
    } catch (err) {
      if (err instanceof InvalidDomainError) return reply.code(400).send({ error: "invalid_domain" });
      throw err;
    }
    const entry = await addWatchlistEntry(pool, {
      domain: ascii,
      niche: body.niche ?? null,
      note: body.note ?? null,
      desiredAction: body.desired_action,
    });
    return reply.code(201).send(entry);
  });

  app.get("/api/v1/watchlist", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { limit, offset } = parsePagination(query);
    const rows = await listWatchlistEntries(pool, {
      status: typeof query.status === "string" && query.status ? query.status : undefined,
      niche: typeof query.niche === "string" && query.niche ? query.niche : undefined,
      limit,
      offset,
    });
    const nextCursor = rows.length === limit ? offset + limit : null;
    return reply.send({ results: rows, next_cursor: nextCursor });
  });

  app.delete("/api/v1/watchlist/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await deleteWatchlistEntry(pool, id);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true });
  });

  app.post("/api/v1/watchlist/:id/check", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entry = await getWatchlistEntry(pool, id);
    if (!entry) return reply.code(404).send({ error: "not_found" });
    await recheckWatchlistEntry(pool, entry);
    const updated = await getWatchlistEntry(pool, id);
    return reply.send(updated);
  });

  app.post("/api/v1/watchlist/:id/take", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entry = await getWatchlistEntry(pool, id);
    if (!entry) return reply.code(404).send({ error: "not_found" });
    if (!autoregEnabled()) return reply.code(400).send({ error: "autoreg_not_configured" });
    try {
      const { siteId, created } = await takeToAutoreg(pool, entry);
      return reply.send({ autoreg_site_id: siteId, created });
    } catch (err) {
      if (err instanceof TakeInProgressError) {
        return reply.code(409).send({ error: "take_in_progress" });
      }
      if (err instanceof Error && err.message === "missing_niche") {
        return reply.code(400).send({ error: "missing_niche" });
      }
      return reply.code(502).send({
        error: "autoreg_request_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/v1/watchlist/events", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const { limit, offset } = parsePagination(query);
    const rows = await listWatchEvents(pool, {
      watchlistId: typeof query.watchlist_id === "string" && query.watchlist_id ? query.watchlist_id : undefined,
      limit,
      offset,
    });
    const nextCursor = rows.length === limit ? offset + limit : null;
    return reply.send({ results: rows, next_cursor: nextCursor });
  });
}
