import type { WhoisParseResult } from "./types.js";

const NOT_FOUND_RE = /Status:\s*free/i;

/** DENIC (.de) whois parser: no expiry date is published; registrar is not exposed either. */
export function parseDeWhois(raw: string): WhoisParseResult {
  if (NOT_FOUND_RE.test(raw)) {
    return { status: "available", expiresAt: null, registrar: null };
  }
  return { status: "registered", expiresAt: null, registrar: null };
}
