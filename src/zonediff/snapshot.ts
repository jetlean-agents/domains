import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function snapshotDir(tld: string): string {
  return path.join(config.zoneDataDir, tld);
}

export function snapshotPath(tld: string, runDate: string): string {
  return path.join(snapshotDir(tld), `${runDate}.sorted.txt`);
}

/** Collects domains from one or more async generators into a sorted, de-duplicated snapshot file. */
export async function writeSnapshot(
  tld: string,
  runDate: string,
  domains: AsyncIterable<string>,
): Promise<{ path: string; count: number }> {
  const unique = new Set<string>();
  for await (const d of domains) unique.add(d);
  const sorted = Array.from(unique).sort();

  const dir = snapshotDir(tld);
  await mkdir(dir, { recursive: true });
  const file = snapshotPath(tld, runDate);
  await writeFile(file, sorted.join("\n") + (sorted.length ? "\n" : ""), "utf8");
  return { path: file, count: sorted.length };
}

/** Keeps only the newest `keep` snapshot files for a tld (by filename, which sorts as run_date). */
export async function pruneSnapshots(tld: string, keep: number): Promise<void> {
  const dir = snapshotDir(tld);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".sorted.txt")).sort();
  } catch {
    return;
  }
  const toRemove = files.slice(0, Math.max(0, files.length - keep));
  await Promise.all(toRemove.map((f) => rm(path.join(dir, f))));
}

/** Finds the most recent snapshot strictly before `runDate`, if any. */
export async function previousSnapshot(tld: string, runDate: string): Promise<string | null> {
  const dir = snapshotDir(tld);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".sorted.txt")).sort();
  } catch {
    return null;
  }
  const prior = files.filter((f) => f < `${runDate}.sorted.txt`);
  if (prior.length === 0) return null;
  return path.join(dir, prior[prior.length - 1]);
}
