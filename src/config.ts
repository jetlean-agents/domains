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
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
  czds: {
    username: process.env.CZDS_USERNAME ?? "",
    password: process.env.CZDS_PASSWORD ?? "",
    zones: (process.env.CZDS_ZONES ?? "")
      .split(",")
      .map((z) => z.trim())
      .filter(Boolean),
  },
  zoneFilesDir: process.env.ZONE_FILES_DIR ?? "",
  zoneDataDir: process.env.ZONE_DATA_DIR ?? "./data/zones",
  zoneKeepSnapshots: envInt("ZONE_KEEP_SNAPSHOTS", 2),
  zoneDiffCron: process.env.ZONE_DIFF_CRON ?? "",
  csvImportUrls: (process.env.CSV_IMPORT_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  csvImportCron: process.env.CSV_IMPORT_CRON ?? "",
  wayback: {
    minIntervalMs: envInt("WAYBACK_MIN_INTERVAL_MS", 4000),
    sampleSize: envInt("WAYBACK_SAMPLE", 4),
    timeoutMs: envInt("WAYBACK_TIMEOUT_MS", 10_000),
  },
  commonCrawl: {
    minIntervalMs: envInt("CC_MIN_INTERVAL_MS", 1000),
    timeoutMs: envInt("CC_TIMEOUT_MS", 10_000),
  },
  evalCacheTtlSeconds: envInt("EVAL_CACHE_TTL", 30 * 24 * 3600),
  evalDailyLimit: envInt("EVAL_DAILY_LIMIT", 50),
  evalCron: process.env.EVAL_CRON ?? "",
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  },
  watchFastIntervalSeconds: envInt("WATCH_FAST_INTERVAL", 3600),
  watchDailyAt: process.env.WATCH_DAILY_AT ?? "",
  watchExpiryWarnDays: envInt("WATCH_EXPIRY_WARN_DAYS", 7),
  watchWebhookUrl: process.env.WATCH_WEBHOOK_URL ?? "",
  autoreg: {
    apiUrl: process.env.AUTOREG_API_URL ?? "",
    apiToken: process.env.AUTOREG_API_TOKEN ?? "",
  },
};
