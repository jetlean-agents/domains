import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { registerHealthRoute } from "./routes/health.js";
import { registerCheckRoute } from "./routes/check.js";
import { registerUiRoutes } from "./routes/ui.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cookie);
  registerHealthRoute(app);
  registerCheckRoute(app);
  registerUiRoutes(app);
  return app;
}
