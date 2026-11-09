/**
 * Minimal daily scheduler: ENV values are "HH:MM" (UTC, 24h). Every minute we
 * check whether the current UTC time matches and fire at most once per day.
 * A full cron syntax is out of scope — this covers the "once daily" need from
 * the issue (ZONE_DIFF_CRON / CSV_IMPORT_CRON / UA_WATCH_CRON).
 */
export function scheduleDaily(spec: string | undefined, task: () => Promise<void>): void {
  if (!spec) return;
  const match = /^(\d{1,2}):(\d{2})$/.exec(spec.trim());
  if (!match) {
    throw new Error(`Invalid daily schedule "${spec}", expected "HH:MM" (UTC)`);
  }
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  let lastRunDate: string | null = null;

  setInterval(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === hour && now.getUTCMinutes() === minute && lastRunDate !== todayKey) {
      lastRunDate = todayKey;
      task().catch((err) => console.error("scheduled task failed:", err));
    }
  }, 30_000);
}
