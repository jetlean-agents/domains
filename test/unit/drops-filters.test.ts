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

  it("supports the stage-3 evaluation filters (niche, min_score, min_age) unqualified", () => {
    const { where, params } = buildDropsWhere({
      niche: "auto",
      minScore: 60,
      minAge: 5,
      limit: 50,
      offset: 0,
    });
    expect(where).toBe("WHERE niche = $1 AND score >= $2 AND age_years >= $3");
    expect(params).toEqual(["auto", 60, 5]);
  });

  it("combines drops filters and evaluation filters in one WHERE clause", () => {
    const { where, params } = buildDropsWhere({ tld: "com", niche: "deals_us", minScore: 40, limit: 50, offset: 0 });
    expect(where).toBe("WHERE tld = $1 AND niche = $2 AND score >= $3");
    expect(params).toEqual(["com", "deals_us", 40]);
  });
});
