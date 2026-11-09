import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { requireAdminToken } from "../auth/middleware.js";
import { hashToken } from "../auth/tokens.js";
import { insertToken, listTokens, revokeToken, seedWatchlist } from "../db/queries.js";
import { randomBytes } from "node:crypto";
import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";

function normalizeMany(domains: string[]): string[] {
  const out: string[] = [];
  for (const d of domains) {
    try {
      out.push(normalizeDomain(d).ascii);
    } catch (err) {
      if (!(err instanceof InvalidDomainError)) throw err;
    }
  }
  return out;
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/v1/admin/tokens", { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name?: string; admin?: boolean };
    if (!body.name) return reply.code(400).send({ error: "missing_name" });
    const token = randomBytes(24).toString("hex");
    const { id } = await insertToken(pool, body.name, hashToken(token), body.admin === true);
    return reply.code(201).send({ id, name: body.name, token });
  });

  app.get("/api/v1/admin/tokens", { preHandler: requireAdminToken }, async (_req, reply) => {
    const tokens = await listTokens(pool);
    return reply.send({ tokens });
  });

  app.delete("/api/v1/admin/tokens", { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name?: string; id?: string };
    if (!body.name && !body.id) return reply.code(400).send({ error: "missing_name_or_id" });
    const ok = await revokeToken(pool, body.id ? { id: body.id } : { name: body.name! });
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true });
  });

  app.post("/api/v1/admin/ua-watchlist", { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { domains?: unknown };
    const domains = Array.isArray(body.domains)
      ? body.domains.filter((d): d is string => typeof d === "string")
      : [];
    if (domains.length === 0) return reply.code(400).send({ error: "missing_domains" });
    const inserted = await seedWatchlist(pool, normalizeMany(domains));
    return reply.send({ inserted });
  });
}
