import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { checkDomain } from "../domain/pipeline.js";
import { requireAuth } from "../auth/middleware.js";

const MAX_DOMAINS = 100;

function parseDomainsFromQuery(d: unknown): string[] {
  if (typeof d !== "string") return [];
  return d.split(",").map((s) => s.trim()).filter(Boolean);
}

export function registerCheckRoute(app: FastifyInstance): void {
  app.get("/api/v1/check", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { d?: string; deep?: string };
    const domains = parseDomainsFromQuery(query.d);
    if (domains.length === 0) {
      return reply.code(400).send({ error: "missing_domains" });
    }
    if (domains.length > MAX_DOMAINS) {
      return reply.code(400).send({ error: "too_many_domains", max: MAX_DOMAINS });
    }
    const deep = query.deep === "1";
    const results = await Promise.all(domains.map((d) => checkDomain(pool, d, { deep })));
    return reply.send({ results });
  });

  app.post("/api/v1/check", { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as { domains?: unknown; deep?: boolean };
    const domains = Array.isArray(body.domains)
      ? body.domains.filter((d): d is string => typeof d === "string")
      : [];
    if (domains.length === 0) {
      return reply.code(400).send({ error: "missing_domains" });
    }
    if (domains.length > MAX_DOMAINS) {
      return reply.code(400).send({ error: "too_many_domains", max: MAX_DOMAINS });
    }
    const deep = body.deep === true;
    const results = await Promise.all(domains.map((d) => checkDomain(pool, d, { deep })));
    return reply.send({ results });
  });
}
