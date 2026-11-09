import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { scheduleDaily, scheduleInterval } from "./scheduler.js";
import { runAllZoneDiffs } from "./zonediff/run.js";
import { runCsvImportUrls } from "./csvimport/schedule.js";
import { recheckDueWatchlist } from "./watchlist/recheck.js";
import { runAutoEvaluation } from "./evaluation/auto-eval.js";

async function main() {
  await runMigrations(pool);
  const app = await buildApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });

  scheduleDaily(config.zoneDiffCron, () => runAllZoneDiffs(pool).then(() => undefined));
  scheduleDaily(config.csvImportCron, () => runCsvImportUrls(pool));
  scheduleDaily(config.watchDailyAt, () => recheckDueWatchlist(pool).then(() => undefined));
  scheduleInterval(config.watchFastIntervalSeconds, () => recheckDueWatchlist(pool).then(() => undefined));
  scheduleDaily(config.evalCron, () => runAutoEvaluation(pool).then(() => undefined));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
