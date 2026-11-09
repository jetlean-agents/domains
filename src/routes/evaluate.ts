import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { createEvaluationJob, getEvaluationJob, MAX_EVALUATE_DOMAINS } from "../evaluation/jobs.js";
import { getEvaluations } from "../db/queries.js";
import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";

/** Normalizes (punycode, lowercase) and de-duplicates a raw domain list; drops invalid entries. */
export function normalizeDomainList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    try {
      const ascii = normalizeDomain(r).ascii;
      if (!seen.has(ascii)) {
        seen.add(ascii);
        out.push(ascii);
      }
    } catch (err) {
      if (!(err instanceof InvalidDomainError)) throw err;
    }
  }
  return out;
}

function parseDomainsFromQuery(d: unknown): string[] {
  if (typeof d !== "string") return [];
  return normalizeDomainList(d.split(",").map((s) => s.trim()).filter(Boolean));
}

export function registerEvaluateRoutes(app: FastifyInstance): void {
  app.post("/api/v1/evaluate", { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as { domains?: unknown };
    const rawDomains = Array.isArray(body.domains)
      ? body.domains.filter((d): d is string => typeof d === "string")
      : [];
    if (rawDomains.length === 0) return reply.code(400).send({ error: "missing_domains" });
    const domains = normalizeDomainList(rawDomains);
    if (domains.length === 0) return reply.code(400).send({ error: "no_valid_domains" });
    if (domains.length > MAX_EVALUATE_DOMAINS) {
      return reply.code(400).send({ error: "too_many_domains", max: MAX_EVALUATE_DOMAINS });
    }
    const job = await createEvaluationJob(pool, domains);
    return reply.code(202).send({ job_id: job.id, status: job.status, domains });
  });

  app.get("/api/v1/evaluate/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await getEvaluationJob(pool, id);
    if (!job) return reply.code(404).send({ error: "not_found" });
    return reply.send({
      job_id: job.id,
      status: job.status,
      domains: job.domains,
      results: job.results,
      error: job.error,
      created_at: job.created_at,
      completed_at: job.completed_at,
    });
  });

  app.get("/api/v1/evaluations", { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { domain?: string };
    const domains = parseDomainsFromQuery(query.domain);
    if (domains.length === 0) return reply.code(400).send({ error: "missing_domain" });
    const results = await getEvaluations(pool, domains);
    return reply.send({ results });
  });
}
