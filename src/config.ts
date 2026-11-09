function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer env var: ${name}`);
  return n;
}

export const config = {
  port: envInt("PORT", 3000),
  databaseUrl: env("DATABASE_URL"),
  adminToken: process.env.ADMIN_TOKEN ?? "",
  cacheTtlSeconds: {
    registered: envInt("CACHE_TTL_REGISTERED", 24 * 3600),
    available: envInt("CACHE_TTL_AVAILABLE", 3 * 3600),
    unknown: envInt("CACHE_TTL_UNKNOWN", 15 * 60),
  },
  rdapTimeoutMs: envInt("RDAP_TIMEOUT_MS", 5000),
  whoisTimeoutMs: envInt("WHOIS_TIMEOUT_MS", 5000),
  perHostConcurrency: envInt("PER_HOST_CONCURRENCY", 2),
  perHostRps: envInt("PER_HOST_RPS", 1),
};
