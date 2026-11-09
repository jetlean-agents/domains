import { randomBytes } from "node:crypto";
import { pool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { hashToken } from "../src/auth/tokens.js";
import { insertToken } from "../src/db/queries.js";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const name = getArg("--name");
  if (!name) {
    console.error("Usage: npm run token:create -- --name <name> [--admin]");
    process.exit(1);
  }
  const isAdmin = process.argv.includes("--admin");

  await runMigrations(pool);
  const token = randomBytes(24).toString("hex");
  const { id } = await insertToken(pool, name, hashToken(token), isAdmin);
  console.log(`Token created for "${name}" (id: ${id}):`);
  console.log(token);
  console.log("\nStore it now — it is not recoverable from the database.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
