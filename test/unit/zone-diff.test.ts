import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseZoneFile } from "../../src/zonediff/zone-parser.js";
import { writeSnapshot, previousSnapshot, pruneSnapshots } from "../../src/zonediff/snapshot.js";
import { diffSnapshots } from "../../src/zonediff/diff.js";
import { config } from "../../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures/zones");

describe("zone diff (day1 -> day2 fixtures)", () => {
  let dataDir: string;
  let originalZoneDataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "zone-data-"));
    originalZoneDataDir = config.zoneDataDir;
    config.zoneDataDir = dataDir;
  });

  afterEach(async () => {
    config.zoneDataDir = originalZoneDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("finds domains removed between day1 and day2", async () => {
    const day1 = await writeSnapshot("test", "2026-01-01", parseZoneFile(path.join(FIXTURES, "day1.zone")));
    const day2 = await writeSnapshot("test", "2026-01-02", parseZoneFile(path.join(FIXTURES, "day2.zone")));

    const diff = await diffSnapshots(day1.path, day2.path);
    expect(diff.removed.sort()).toEqual(["delta.test", "gamma.test"]);
    expect(diff.addedCount).toBe(1); // epsilon.test
  });

  it("previousSnapshot finds the latest snapshot strictly before a run date", async () => {
    await writeSnapshot("test", "2026-01-01", parseZoneFile(path.join(FIXTURES, "day1.zone")));
    const prev = await previousSnapshot("test", "2026-01-02");
    expect(prev).toMatch(/2026-01-01\.sorted\.txt$/);
  });

  it("is unaffected by line order or duplicate NS lines in the source zone", async () => {
    const shuffledDay1 = path.join(dataDir, "day1-shuffled.zone");
    const original = await (await import("node:fs/promises")).readFile(path.join(FIXTURES, "day1.zone"), "utf8");
    const lines = original.split("\n");
    const header = lines.slice(0, 2);
    const records = lines.slice(2).reverse();
    await writeFile(shuffledDay1, [...header, ...records].join("\n"));

    const normal = await writeSnapshot("test", "2026-02-01", parseZoneFile(path.join(FIXTURES, "day1.zone")));
    const shuffled = await writeSnapshot("test2", "2026-02-01", parseZoneFile(shuffledDay1));

    const normalContent = await (await import("node:fs/promises")).readFile(normal.path, "utf8");
    const shuffledContent = await (await import("node:fs/promises")).readFile(shuffled.path, "utf8");
    expect(shuffledContent).toBe(normalContent);
  });

  it("prunes old snapshots beyond the keep count", async () => {
    await writeSnapshot("prune-test", "2026-01-01", parseZoneFile(path.join(FIXTURES, "day1.zone")));
    await writeSnapshot("prune-test", "2026-01-02", parseZoneFile(path.join(FIXTURES, "day2.zone")));
    await writeSnapshot("prune-test", "2026-01-03", parseZoneFile(path.join(FIXTURES, "day2.zone")));
    await pruneSnapshots("prune-test", 2);
    const remaining = await previousSnapshot("prune-test", "2026-01-04");
    expect(remaining).toMatch(/2026-01-03\.sorted\.txt$/);
    const earlier = await previousSnapshot("prune-test", "2026-01-02");
    expect(earlier).toBeNull(); // 2026-01-01 was pruned
  });
});
