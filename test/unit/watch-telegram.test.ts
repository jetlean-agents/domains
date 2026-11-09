import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";
import { formatWatchMessage, telegramEnabled } from "../../src/watchlist/telegram.js";

describe("formatWatchMessage", () => {
  it("formats a status transition", () => {
    const text = formatWatchMessage({ domain: "example.com", eventType: "status_transition", toStatus: "available" });
    expect(text).toContain("example.com");
    expect(text).toContain("освободился");
  });

  it("formats an expiry warning with the expiry date", () => {
    const text = formatWatchMessage({
      domain: "example.com",
      eventType: "expiry_warning",
      expiresAt: "2026-01-05T00:00:00Z",
    });
    expect(text).toContain("example.com");
    expect(text).toContain("2026-01-05");
  });
});

describe("telegramEnabled", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    vi.resetModules();
  });

  it("is false without both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID", async () => {
    vi.resetModules();
    const { telegramEnabled: fresh } = await import("../../src/watchlist/telegram.js");
    expect(fresh()).toBe(false);
  });
});

let originalDispatcher: Dispatcher;

beforeAll(() => {
  originalDispatcher = getGlobalDispatcher();
});

afterEach(() => {
  setGlobalDispatcher(originalDispatcher);
});

describe("sendTelegramMessage", () => {
  it("posts to the Bot API sendMessage endpoint", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    vi.resetModules();
    const { sendTelegramMessage } = await import("../../src/watchlist/telegram.js");

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://api.telegram.org");
    client
      .intercept({ path: "/bottest-token/sendMessage", method: "POST" })
      .reply(200, JSON.stringify({ ok: true }));

    await expect(sendTelegramMessage("hello")).resolves.toBeUndefined();
  });

  it("throws on a non-2xx response", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    vi.resetModules();
    const { sendTelegramMessage } = await import("../../src/watchlist/telegram.js");

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://api.telegram.org");
    client
      .intercept({ path: "/bottest-token/sendMessage", method: "POST" })
      .reply(400, JSON.stringify({ ok: false, description: "bad request" }));

    await expect(sendTelegramMessage("hello")).rejects.toThrow();
  });
});
