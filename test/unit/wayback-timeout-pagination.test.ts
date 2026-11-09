import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";

// A full-history CDX query that times out (e.g. yahoo.com, FACT-316/FACT-318) must fall back to
// small per-year-range queries instead of failing the whole evaluation. This has to be exercised
// at the HTTP layer (via undici's MockAgent), since the fallback only kicks in on a real
// AbortSignal.timeout() rejection, which `config.wayback.timeoutMs` and `WAYBACK_MIN_INTERVAL_MS`
// are set artificially low for, right below, so the test stays fast.
process.env.WAYBACK_TIMEOUT_MS = "30";
process.env.WAYBACK_MIN_INTERVAL_MS = "1";

const { fetchCdx, buildCdxUrl } = await import("../../src/evaluation/wayback.js");

const EMPTY_CDX_BODY = JSON.stringify([["timestamp", "original", "statuscode"]]);

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

beforeAll(() => {
  originalDispatcher = getGlobalDispatcher();
});

afterEach(() => {
  setGlobalDispatcher(originalDispatcher);
});

describe("fetchCdx: falls back to year-range pagination on a full-history timeout", () => {
  it("retries by year range instead of failing the whole evaluation", async () => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);

    const client = mockAgent.get("https://web.archive.org");

    // Use a host already starting with "www." so `fetchCdx` only issues one top-level query
    // (no second www.<host> lookup), keeping the mock setup to exactly one timeout + fallback.
    const host = "www.yahoo.com";
    const fullUrl = new URL(buildCdxUrl(host));
    // The full-range query: delay well past WAYBACK_TIMEOUT_MS so the request aborts.
    client
      .intercept({ path: fullUrl.pathname + "?" + fullUrl.search.slice(1), method: "GET" })
      .reply(200, EMPTY_CDX_BODY)
      .delay(5_000);

    // Every ranged fallback query responds instantly and successfully. Query param order isn't
    // guaranteed, so match on the presence of each piece rather than a fixed sequence.
    client
      .intercept({
        path: /^\/cdx\/search\/cdx\?(?=.*url=www\.yahoo\.com)(?=.*from=\d+)(?=.*to=\d+).*$/,
        method: "GET",
      })
      .reply(200, EMPTY_CDX_BODY)
      .persist();

    const rows = await fetchCdx(host);
    expect(rows).toEqual([]);
  }, 10_000);
});
