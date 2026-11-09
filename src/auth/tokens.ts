import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { config } from "../config.js";
import { findTokenHashes } from "../db/queries.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies a bearer token against the admin bootstrap token (ENV) and DB-stored service tokens. */
export async function verifyToken(pool: Pool, token: string): Promise<boolean> {
  if (!token) return false;
  if (config.adminToken && safeEqual(hashToken(token), hashToken(config.adminToken))) {
    return true;
  }
  const hash = hashToken(token);
  const tokens = await findTokenHashes(pool);
  return tokens.some((t) => safeEqual(t.token_hash, hash));
}
