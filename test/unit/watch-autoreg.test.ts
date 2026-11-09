import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";

let originalDispatcher: Dispatcher;

beforeAll(() => {
  originalDispatcher = getGlobalDispatcher();
});

afterEach(() => {
  setGlobalDispatcher(originalDispatcher);
  delete process.env.AUTOREG_API_URL;
  delete process.env.AUTOREG_API_TOKEN;
  vi.resetModules();
});

describe("createAutoregSite", () => {
  it("resolves the niche slug to an id, then creates the site", async () => {
    process.env.AUTOREG_API_URL = "https://autoreg.example";
    process.env.AUTOREG_API_TOKEN = "secret-token";
    vi.resetModules();
    const { createAutoregSite } = await import("../../src/watchlist/autoreg-client.js");

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://autoreg.example");
    client
      .intercept({ path: "/api/v1/niches/?slug=auto", method: "GET" })
      .reply(200, JSON.stringify({ results: [{ id: 7 }] }));
    client
      .intercept({ path: "/api/v1/sites/", method: "POST" })
      .reply(201, JSON.stringify({ id: 42 }));

    const siteId = await createAutoregSite("example.com", "auto", "take");
    expect(siteId).toBe("42");
  });

  it("throws when the niche slug doesn't exist in Autoreg", async () => {
    process.env.AUTOREG_API_URL = "https://autoreg.example";
    process.env.AUTOREG_API_TOKEN = "secret-token";
    vi.resetModules();
    const { createAutoregSite } = await import("../../src/watchlist/autoreg-client.js");

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const client = mockAgent.get("https://autoreg.example");
    client
      .intercept({ path: "/api/v1/niches/?slug=unknown_niche", method: "GET" })
      .reply(200, JSON.stringify({ results: [] }));

    await expect(createAutoregSite("example.com", "unknown_niche", "take")).rejects.toThrow();
  });
});

// `takeToAutoreg`'s own idempotency/concurrency behaviour (DB-claim-gated) is covered in
// watch-take.test.ts — it needs to mock ../../src/db/queries.js, which would otherwise leak into
// the createAutoregSite tests above if done in this same file.
