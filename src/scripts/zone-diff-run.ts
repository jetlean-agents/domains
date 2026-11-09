import { pool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { runZoneDiff } from "../zonediff/run.js";
import { config } from "../config.js";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const tld = getArg("--tld");
  const runDate = getArg("--date");
  const tlds = tld ? [tld] : config.czds.zones;
  if (tlds.length === 0) {
    console.error("Usage: npm run zone:diff -- --tld <tld> [--date YYYY-MM-DD]");
    process.exit(1);
  }

  await runMigrations(pool);
  for (const t of tlds) {
    const result = await runZoneDiff(pool, t, runDate);
    console.log(
      `${result.tld} ${result.runDate}: +${result.addedCount} / -${result.removedCount} (snapshot: ${result.snapshotPath})`,
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
