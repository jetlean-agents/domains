import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db/client.js";
import { verifyToken } from "./tokens.js";

function extractToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.token;
  return cookieToken ?? null;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractToken(req);
  const ok = token ? await verifyToken(pool, token) : false;
  if (!ok) {
    reply.code(401).send({ error: "unauthorized" });
  }
}
