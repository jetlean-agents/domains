import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { registerHealthRoute } from "./routes/health.js";
import { registerCheckRoute } from "./routes/check.js";
import { registerUiRoutes } from "./routes/ui.js";
import { registerDropsRoutes } from "./routes/drops.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerEvaluateRoutes } from "./routes/evaluate.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cookie);
  app.addContentTypeParser(
    ["text/csv", "application/octet-stream"],
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );
  registerHealthRoute(app);
  registerCheckRoute(app);
  registerUiRoutes(app);
  registerDropsRoutes(app);
  registerAdminRoutes(app);
  registerEvaluateRoutes(app);
  registerWatchlistRoutes(app);
  return app;
}
