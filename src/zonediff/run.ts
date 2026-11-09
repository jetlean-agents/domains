import path from "node:path";
import type { Pool } from "pg";
import { config } from "../config.js";
import { parseZoneFile } from "./zone-parser.js";
import { writeSnapshot, previousSnapshot, pruneSnapshots } from "./snapshot.js";
import { diffSnapshots } from "./diff.js";
import { czdsEnabled, czdsAuthenticate, downloadZone } from "./czds-client.js";
import { insertDrops } from "../db/queries.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveZoneFile(tld: string): Promise<string> {
  if (czdsEnabled()) {
    const session = await czdsAuthenticate();
    const dir = await mkdtemp(path.join(tmpdir(), `czds-${tld}-`));
    const dest = path.join(dir, `${tld}.zone.gz`);
    await downloadZone(session, tld, dest);
    return dest;
  }
  const dir = config.zoneFilesDir;
  if (!dir) {
    throw new Error(`ZONE_FILES_DIR is not set and CZDS credentials are missing for tld "${tld}"`);
  }
  const gz = path.join(dir, `${tld}.zone.gz`);
  const plain = path.join(dir, `${tld}.zone`);
  const { access } = await import("node:fs/promises");
  try {
    await access(gz);
    return gz;
  } catch {
    await access(plain);
    return plain;
  }
}

export interface ZoneDiffRunResult {
  tld: string;
  runDate: string;
  removedCount: number;
  addedCount: number;
  snapshotPath: string;
}

/** Runs one zone's daily diff: fetch -> snapshot -> diff vs previous -> write drops + zone_runs. */
export async function runZoneDiff(pool: Pool, tld: string, runDate = todayDate()): Promise<ZoneDiffRunResult> {
  const zoneFile = await resolveZoneFile(tld);
  const { path: currentSnapshotPath, count } = await writeSnapshot(tld, runDate, parseZoneFile(zoneFile));

  const prevPath = await previousSnapshot(tld, runDate);
  let removed: string[] = [];
  let addedCount = count;
  if (prevPath) {
    const diff = await diffSnapshots(prevPath, currentSnapshotPath);
    removed = diff.removed;
    addedCount = diff.addedCount;
  }

  if (removed.length > 0) {
    await insertDrops(
      pool,
      removed.map((domain) => ({ domain, tld, source: "zone_diff" as const, dropped_at: runDate })),
    );
  }

  await pool.query(
    `INSERT INTO zone_runs (tld, run_date, snapshot_path, added_count, removed_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tld, run_date) DO UPDATE SET
       snapshot_path = EXCLUDED.snapshot_path,
       added_count = EXCLUDED.added_count,
       removed_count = EXCLUDED.removed_count`,
    [tld, runDate, currentSnapshotPath, addedCount, removed.length],
  );

  await pruneSnapshots(tld, config.zoneKeepSnapshots);

  return { tld, runDate, removedCount: removed.length, addedCount, snapshotPath: currentSnapshotPath };
}

/** Runs zone diff for all configured zones (CZDS_ZONES), or a given list. */
export async function runAllZoneDiffs(pool: Pool, tlds: string[] = config.czds.zones): Promise<ZoneDiffRunResult[]> {
  const results: ZoneDiffRunResult[] = [];
  for (const tld of tlds) {
    results.push(await runZoneDiff(pool, tld));
  }
  return results;
}
