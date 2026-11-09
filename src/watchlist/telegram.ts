import { request } from "undici";
import { config } from "../config.js";

export function telegramEnabled(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.chatId);
}

export interface WatchNotification {
  domain: string;
  eventType: "status_transition" | "expiry_warning";
  fromStatus?: string | null;
  toStatus?: string | null;
  expiresAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  available: "освободился",
  pending_delete: "на удалении (pending delete)",
  redemption: "в redemption period",
  registered: "зарегистрирован",
  unknown: "неизвестно",
};

/** Builds the plain-text Telegram notification body for a watchlist event; pure, no I/O. */
export function formatWatchMessage(n: WatchNotification): string {
  if (n.eventType === "expiry_warning") {
    const date = n.expiresAt ? n.expiresAt.slice(0, 10) : "неизвестно когда";
    return `⏳ ${n.domain}: истекает ${date}`;
  }
  const label = STATUS_LABELS[n.toStatus ?? ""] ?? n.toStatus ?? "unknown";
  return `🔔 ${n.domain}: статус изменился на «${label}»`;
}

/** Sends a plain-text message via the Telegram Bot API; throws on a non-2xx response. */
export async function sendTelegramMessage(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
  const res = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegram.chatId, text }),
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Telegram sendMessage failed: HTTP ${res.statusCode} ${body}`);
  }
  await res.body.text();
}
