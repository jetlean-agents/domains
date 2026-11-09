import { describe, expect, it, vi } from "vitest";

const getCached = vi.fn();
const upsertCache = vi.fn(async () => {});
vi.mock("../../src/db/queries.js", () => ({
  getCached: (...args: unknown[]) => getCached(...args),
  upsertCache: (...args: unknown[]) => upsertCache(...args),
}));

const hasNsRecords = vi.fn(async () => true);
vi.mock("../../src/domain/dns.js", () => ({
  hasNsRecords: (...args: unknown[]) => hasNsRecords(...args),
}));

const findRdapServers = vi.fn(async () => ["https://rdap.example/"]);
const queryRdap = vi.fn(async () => ({
  status: "registered",
  expiresAt: "2030-01-01T00:00:00.000Z",
  registrar: "Example Registrar",
}));
vi.mock("../../src/domain/rdap.js", () => ({
  findRdapServers: (...args: unknown[]) => findRdapServers(...args),
  queryRdap: (...args: unknown[]) => queryRdap(...args),
}));

vi.mock("../../src/domain/whois-client.js", () => ({
  resolveWhoisServer: vi.fn(async () => null),
  queryWhois: vi.fn(async () => ""),
}));
vi.mock("../../src/domain/parsers/index.js", () => ({
  getWhoisParser: () => () => ({ status: "unknown", expiresAt: null, registrar: null }),
}));

const { checkDomain } = await import("../../src/domain/pipeline.js");

describe("checkDomain: deep check vs. cached DNS fast-path result", () => {
  it("re-resolves via RDAP when the cache holds a DNS-only result (no expires_at)", async () => {
    getCached.mockReset().mockResolvedValue({
      domain: "example.com",
      status: "registered",
      expires_at: null,
      registrar: null,
      cachedSource: "dns",
      checked_at: new Date().toISOString(),
    });
    upsertCache.mockClear();
    findRdapServers.mockClear();

    const result = await checkDomain({} as any, "example.com", { deep: true });

    expect(findRdapServers).toHaveBeenCalled();
    expect(result.source).toBe("rdap");
    expect(result.expires_at).toBe("2030-01-01T00:00:00.000Z");
    expect(upsertCache).toHaveBeenCalled();
  });

  it("uses the cached result as-is for a non-deep (public) check", async () => {
    getCached.mockReset().mockResolvedValue({
      domain: "example.com",
      status: "registered",
      expires_at: null,
      registrar: null,
      cachedSource: "dns",
      checked_at: new Date().toISOString(),
    });
    findRdapServers.mockClear();

    const result = await checkDomain({} as any, "example.com");

    expect(findRdapServers).not.toHaveBeenCalled();
    expect(result.source).toBe("cache");
    expect(result.expires_at).toBeNull();
  });

  it("trusts a cached RDAP result that already has expires_at, even on a deep check", async () => {
    getCached.mockReset().mockResolvedValue({
      domain: "example.com",
      status: "registered",
      expires_at: "2030-01-01T00:00:00.000Z",
      registrar: "Example Registrar",
      cachedSource: "rdap",
      checked_at: new Date().toISOString(),
    });
    findRdapServers.mockClear();

    const result = await checkDomain({} as any, "example.com", { deep: true });

    expect(findRdapServers).not.toHaveBeenCalled();
    expect(result.source).toBe("cache");
    expect(result.expires_at).toBe("2030-01-01T00:00:00.000Z");
  });
});
