import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

async function main() {
  await runMigrations(pool);
  const app = await buildApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
