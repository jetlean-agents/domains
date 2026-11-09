import { readFile } from "node:fs/promises";
import { pool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { seedWatchlist } from "../db/queries.js";
import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";

function getAllArgs(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((arg, i) => {
    if (arg === flag) out.push(process.argv[i + 1]);
  });
  return out.filter(Boolean);
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const domainArgs = getAllArgs("--domain");
  const file = getArg("--file");
  let raw = [...domainArgs];
  if (file) {
    const text = await readFile(file, "utf8");
    raw = raw.concat(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  if (raw.length === 0) {
    console.error("Usage: npm run ua:seed -- --domain example.ua [--domain ...] | --file <path>");
    process.exit(1);
  }

  const domains: string[] = [];
  for (const d of raw) {
    try {
      domains.push(normalizeDomain(d).ascii);
    } catch (err) {
      if (err instanceof InvalidDomainError) {
        console.error(`skipping invalid domain: ${d}`);
        continue;
      }
      throw err;
    }
  }

  await runMigrations(pool);
  const inserted = await seedWatchlist(pool, domains);
  console.log(`seeded ${inserted} new domain(s) into ua_watchlist (${domains.length} provided)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
