import { describe, expect, it } from "vitest";
import { normalizeDomainList } from "../../src/routes/evaluate.js";

describe("normalizeDomainList", () => {
  it("normalizes case and punycode", () => {
    expect(normalizeDomainList(["Example.COM"])).toEqual(["example.com"]);
  });

  it("de-duplicates after normalization (not just raw string equality)", () => {
    expect(normalizeDomainList(["example.com", "Example.com", " example.com "])).toEqual(["example.com"]);
  });

  it("drops invalid entries without throwing", () => {
    expect(normalizeDomainList(["not a domain", "example.com", ""])).toEqual(["example.com"]);
  });

  it("preserves first-seen order", () => {
    expect(normalizeDomainList(["b.com", "a.com", "b.com"])).toEqual(["b.com", "a.com"]);
  });

  it("returns an empty array for an all-invalid or empty input", () => {
    expect(normalizeDomainList([])).toEqual([]);
    expect(normalizeDomainList(["???", ""])).toEqual([]);
  });
});
