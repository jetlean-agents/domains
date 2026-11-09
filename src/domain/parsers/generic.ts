import type { DomainStatus } from "../types.js";
import type { WhoisParseResult } from "./types.js";

const NOT_FOUND_RE = /no match|not found|no data found|no entries found|no object found|status:\s*available/i;

const STATUS_MAP: Array<[RegExp, DomainStatus]> = [
  [/pending delete/i, "pending_delete"],
  [/redemption/i, "redemption"],
];

/** Generic field-based whois parser: works for most "Key: Value" formats (.com, .io, and similar). */
export function parseGenericWhois(raw: string): WhoisParseResult {
  if (NOT_FOUND_RE.test(raw)) {
    return { status: "available", expiresAt: null, registrar: null };
  }

  const statusLines = [...raw.matchAll(/^\s*(?:Domain )?Status:\s*(.+)$/gim)].map((m) => m[1].trim());
  let status: DomainStatus = "registered";
  for (const line of statusLines) {
    const hit = STATUS_MAP.find(([re]) => re.test(line));
    if (hit) {
      status = hit[1];
      break;
    }
  }

  const expiryMatch = raw.match(
    /^\s*(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date):\s*(.+)$/im,
  );
  const expiresAt = expiryMatch ? normalizeDate(expiryMatch[1].trim()) : null;

  const registrarMatch = raw.match(/^\s*Registrar:\s*(.+)$/im);
  const registrar = registrarMatch ? registrarMatch[1].trim() : null;

  return { status, expiresAt, registrar };
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}
