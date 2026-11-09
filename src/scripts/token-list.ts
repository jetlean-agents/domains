import { pool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { listTokens } from "../db/queries.js";

async function main() {
  await runMigrations(pool);
  const tokens = await listTokens(pool);
  if (tokens.length === 0) {
    console.log("No tokens.");
  } else {
    console.table(
      tokens.map((t) => ({
        name: t.name,
        id: t.id,
        admin: t.is_admin,
        created_at: t.created_at,
        revoked_at: t.revoked_at ?? "",
      })),
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
