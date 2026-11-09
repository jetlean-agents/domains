import type { DomainStatus } from "../types.js";

export interface WhoisParseResult {
  status: DomainStatus;
  expiresAt: string | null;
  registrar: string | null;
}

export type WhoisParser = (raw: string) => WhoisParseResult;
