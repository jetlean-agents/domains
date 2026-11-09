import { describe, expect, it } from "vitest";
import { buildDropsWhere } from "../../src/db/queries.js";

describe("buildDropsWhere", () => {
  it("builds no WHERE clause when no filters are given", () => {
    const { where, params } = buildDropsWhere({ limit: 50, offset: 0 });
    expect(where).toBe("");
    expect(params).toEqual([]);
  });

  it("combines multiple filters with AND and positional params", () => {
    const { where, params } = buildDropsWhere({
      tld: "com",
      source: "zone_diff",
      since: "2026-01-01",
      q: "shop",
      minLen: 5,
      maxLen: 12,
      noDigits: true,
      noHyphens: true,
      limit: 50,
      offset: 0,
    });
    expect(where).toContain("tld = $1");
    expect(where).toContain("source = $2");
    expect(where).toContain("dropped_at >= $3");
    expect(where).toContain("domain ILIKE $4");
    expect(where).toContain("length(domain) >= $5");
    expect(where).toContain("length(domain) <= $6");
    expect(where).toContain("domain !~ '[0-9]'");
    expect(where).toContain("domain !~ '-'");
    expect(params).toEqual(["com", "zone_diff", "2026-01-01", "%shop%", 5, 12]);
  });

  it("only applies the filters that are actually set", () => {
    const { where, params } = buildDropsWhere({ tld: "ua", limit: 50, offset: 0 });
    expect(where).toBe("WHERE tld = $1");
    expect(params).toEqual(["ua"]);
  });
});
