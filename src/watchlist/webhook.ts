import { request } from "undici";
import { config } from "../config.js";
import type { WatchNotification } from "./telegram.js";

export function webhookEnabled(): boolean {
  return Boolean(config.watchWebhookUrl);
}

/** POSTs the raw event as JSON to `WATCH_WEBHOOK_URL`; throws on a non-2xx response. */
export async function sendWatchWebhook(event: WatchNotification): Promise<void> {
  const res = await request(config.watchWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`watch webhook failed: HTTP ${res.statusCode}`);
  }
  await res.body.text();
}
