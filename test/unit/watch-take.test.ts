import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";

// Fakes the two claim-column SQL functions `take.ts` calls, with the same atomicity guarantee a
// real `UPDATE ... WHERE autoreg_site_id IS NULL AND (...)` provides: the check-and-set happens
// in one synchronous step (no `await` in between), so exactly one of two "simultaneous" callers
// can ever win — mirroring what a real Postgres row-level UPDATE guarantees under concurrency.
let row: { autoreg_site_id: string | null; claimedAt: number | null };

vi.mock("../../src/db/queries.js", () => ({
  claimWatchlistForAutoreg: vi.fn(async (_pool: unknown, _id: string, ttlSeconds: number) => {
    if (row.autoreg_site_id) return false;
    const now = Date.now();
    if (row.claimedAt !== null && now - row.claimedAt < ttlSeconds * 1000) return false;
    row.claimedAt = now;
    return true;
  }),
  setWatchlistAutoregSiteId: vi.fn(async (_pool: unknown, _id: string, siteId: string) => {
    if (row.autoreg_site_id) return false;
    row.autoreg_site_id = siteId;
    return true;
  }),
}));

let originalDispatcher: Dispatcher;

beforeAll(() => {
  originalDispatcher = getGlobalDispatcher();
});

afterEach(() => {
  setGlobalDispatcher(originalDispatcher);
  delete process.env.AUTOREG_API_URL;
  delete process.env.AUTOREG_API_TOKEN;
});

describe("takeToAutoreg", () => {
  it("is idempotent: an entry with an existing autoreg_site_id makes no Autoreg call, no DB write", async () => {
    const { takeToAutoreg } = await import("../../src/watchlist/take.js");
    const queries = await import("../../src/db/queries.js");

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    // No interceptors registered — any outbound request would throw (disableNetConnect),
    // which is exactly how we prove takeToAutoreg skipped the Autoreg call entirely.

    row = { autoreg_site_id: null, claimedAt: null };
    const result = await takeToAutoreg({} as any, {
      id: "e1",
      domain: "example.com",
      niche: "auto",
      desired_action: "take",
      autoreg_site_id: "existing-id",
    });
    expect(result).toEqual({ siteId: "existing-id", created: false });
    expect(queries.claimWatchlistForAutoreg).not.toHaveBeenCalled();
  });

  it("creates a site when none exists yet", async () => {
    process.env.AUTOREG_API_URL = "https://autoreg.example";
    process.env.AUTOREG_API_TOKEN = "secret-token";
    vi.resetModules();
    const { takeToAutoreg } = await import("../../src/watchlist/take.js");

    row = { autoreg_site_id: null, claimedAt: null };
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://autoreg.example");
    client.intercept({ path: "/api/v1/niches/?slug=auto", method: "GET" }).reply(200, JSON.stringify({ results: [{ id: 7 }] }));
    client.intercept({ path: "/api/v1/sites/", method: "POST" }).reply(201, JSON.stringify({ id: 42 }));

    const result = await takeToAutoreg({} as any, {
      id: "e1",
      domain: "example.com",
      niche: "auto",
      desired_action: "drop",
      autoreg_site_id: null,
    });
    expect(result).toEqual({ siteId: "42", created: true });
  });

  it("is idempotent under two concurrent requests: exactly one reaches Autoreg, the other fails fast", async () => {
    process.env.AUTOREG_API_URL = "https://autoreg.example";
    process.env.AUTOREG_API_TOKEN = "secret-token";
    vi.resetModules();
    const { takeToAutoreg, TakeInProgressError } = await import("../../src/watchlist/take.js");

    row = { autoreg_site_id: null, claimedAt: null };
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://autoreg.example");
    // No `.persist()` on either interceptor: a second attempt to hit `/niches/` or `/sites/`
    // would find no matching interceptor left and throw — i.e. a second real Autoreg call would
    // fail this test, not silently succeed.
    client.intercept({ path: "/api/v1/niches/?slug=auto", method: "GET" }).reply(200, JSON.stringify({ results: [{ id: 7 }] }));
    client.intercept({ path: "/api/v1/sites/", method: "POST" }).reply(201, JSON.stringify({ id: 42 }));

    const entry = { id: "e1", domain: "example.com", niche: "auto", desired_action: "take", autoreg_site_id: null };
    const results = await Promise.allSettled([takeToAutoreg({} as any, entry), takeToAutoreg({} as any, entry)]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value).toEqual({ siteId: "42", created: true });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TakeInProgressError);
  });
});
