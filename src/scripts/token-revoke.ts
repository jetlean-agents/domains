import { pool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { revokeToken } from "../db/queries.js";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const name = getArg("--name");
  const id = getArg("--id");
  if (!name && !id) {
    console.error("Usage: npm run token:revoke -- --name <name> | --id <id>");
    process.exit(1);
  }

  await runMigrations(pool);
  const revoked = await revokeToken(pool, name ? { name } : { id: id! });
  if (!revoked) {
    console.error(`No active token found for ${name ? `name "${name}"` : `id "${id}"`}.`);
    process.exit(1);
  }
  console.log(`Token ${name ? `"${name}"` : id} revoked.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
