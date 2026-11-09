/**
 * Manual memory check (not part of `npm test`): generates a synthetic ~1M-line
 * zone file, runs it through the real parse+snapshot pipeline, and reports
 * peak RSS. The issue's acceptance criteria requires RSS < 300MB.
 *
 * Run with: npx tsx test/manual/zone-memory-check.ts
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { parseZoneFile } from "../../src/zonediff/zone-parser.js";
import { writeSnapshot } from "../../src/zonediff/snapshot.js";
import { config } from "../../src/config.js";

const DOMAIN_COUNT = 1_000_000;

function generateZoneLine(i: number): string {
  return `d${i} 3600 IN NS ns1.d${i}.test.\n`;
}

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "zone-memcheck-"));
  const zoneFile = path.join(dir, "big.zone");

  const chunks: string[] = ["$ORIGIN test.\n$TTL 86400\ntest. 3600 IN SOA a.test. hostmaster.test. 1 7200 3600 1209600 3600\n"];
  for (let i = 0; i < DOMAIN_COUNT; i++) {
    chunks.push(generateZoneLine(i));
    if (chunks.length >= 50_000) {
      await writeFile(zoneFile, chunks.join(""), { flag: "a" });
      chunks.length = 0;
    }
  }
  if (chunks.length) await writeFile(zoneFile, chunks.join(""), { flag: "a" });

  config.zoneDataDir = dir;

  let peakRss = 0;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 200);

  const start = Date.now();
  const result = await writeSnapshot("memcheck", "2026-01-01", parseZoneFile(zoneFile));
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  console.log(`domains written: ${result.count}`);
  console.log(`elapsed: ${Date.now() - start}ms`);
  console.log(`peak RSS: ${(peakRss / 1024 / 1024).toFixed(1)} MB`);
  if (peakRss > 300 * 1024 * 1024) {
    console.error("FAIL: RSS exceeded 300MB");
    process.exitCode = 1;
  } else {
    console.log("OK: RSS under 300MB");
  }

  await rm(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
