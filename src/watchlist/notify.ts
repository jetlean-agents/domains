import type { Pool } from "pg";
import { insertWatchEvent } from "../db/queries.js";
import { telegramEnabled, sendTelegramMessage, formatWatchMessage, type WatchNotification } from "./telegram.js";
import { webhookEnabled, sendWatchWebhook } from "./webhook.js";

/**
 * Always records the event in `watch_events` (the in-UI journal works with zero ENV configured);
 * best-effort delivers it over Telegram and/or the generic webhook when their ENV is set. A
 * delivery failure is logged, not thrown — the journal entry is the source of truth.
 */
export async function notifyWatchEvent(
  pool: Pool,
  watchlistId: string,
  n: WatchNotification,
): Promise<void> {
  const message = formatWatchMessage(n);
  let notified = false;

  if (telegramEnabled()) {
    try {
      await sendTelegramMessage(message);
      notified = true;
    } catch (err) {
      console.error(`notifyWatchEvent: Telegram delivery failed for ${n.domain}:`, err);
    }
  }

  if (webhookEnabled()) {
    try {
      await sendWatchWebhook(n);
      notified = true;
    } catch (err) {
      console.error(`notifyWatchEvent: webhook delivery failed for ${n.domain}:`, err);
    }
  }

  await insertWatchEvent(pool, {
    watchlistId,
    domain: n.domain,
    eventType: n.eventType,
    fromStatus: n.fromStatus,
    toStatus: n.toStatus,
    message,
    notified,
  });
}
