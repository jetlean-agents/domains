import type { DomainStatus } from "../types.js";
import type { WhoisParseResult } from "./types.js";

const NOT_FOUND_RE = /No entries found for|status:\s*available/i;

const STATUS_MAP: Array<[RegExp, DomainStatus]> = [
  [/pending-delete/i, "pending_delete"],
  [/redemption-period|clientRedemptionPeriod/i, "redemption"],
];

/** .ua / .com.ua (hostmaster.ua) whois parser. */
export function parseComUaWhois(raw: string): WhoisParseResult {
  if (NOT_FOUND_RE.test(raw)) {
    return { status: "available", expiresAt: null, registrar: null };
  }

  const statusLines = [...raw.matchAll(/^status:\s*(.+)$/gim)].map((m) => m[1].trim());
  let status: DomainStatus = "registered";
  for (const line of statusLines) {
    const hit = STATUS_MAP.find(([re]) => re.test(line));
    if (hit) {
      status = hit[1];
      break;
    }
  }

  const expiryMatch = raw.match(/^expires:\s*(.+)$/im);
  const expiresAt = expiryMatch ? normalizeDate(expiryMatch[1].trim()) : null;

  const registrarSection = raw.split(/^%\s*Registrar:\s*$/im)[1];
  const orgMatch = registrarSection?.match(/^organization:\s*(.+)$/im);
  const registrarMatch = raw.match(/^registrar:\s*(.+)$/im);
  const registrar = orgMatch?.[1].trim() ?? registrarMatch?.[1].trim() ?? null;

  return { status, expiresAt, registrar };
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}
