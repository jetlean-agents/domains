export type DomainStatus =
  | "available"
  | "registered"
  | "pending_delete"
  | "redemption"
  | "unknown";

export type Source = "dns" | "rdap" | "whois" | "cache";

export interface CheckResult {
  domain: string;
  status: DomainStatus;
  expires_at: string | null;
  registrar: string | null;
  source: Source;
  checked_at: string;
  error?: string;
}
