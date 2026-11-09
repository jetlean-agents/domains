import { describe, expect, it } from "vitest";
import { detectColumnMap } from "../../src/csvimport/column-map.js";
import { parseCsv, splitCsvLine } from "../../src/csvimport/parse.js";

describe("splitCsvLine", () => {
  it("splits plain comma-separated fields", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("respects quoted fields containing commas", () => {
    expect(splitCsvLine('example.com,"Smith, Inc.",10')).toEqual(["example.com", "Smith, Inc.", "10"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });
});

describe("detectColumnMap", () => {
  it("detects ExpiredDomains by backlink/authority columns", () => {
    const map = detectColumnMap(["Domain Name", "Backlinks", "DomainPopularity"]);
    expect(map.provider).toBe("expireddomains");
    expect(map.domainCol).toBe(0);
  });

  it("detects GoDaddy by an Auction End column", () => {
    const map = detectColumnMap(["Domain Name", "Auction End", "Current Bid"]);
    expect(map.provider).toBe("godaddy");
    expect(map.dateCol).toBe(1);
  });

  it("detects Dynadot by a Price column", () => {
    const map = detectColumnMap(["Domain Name", "Price", "Traffic"]);
    expect(map.provider).toBe("dynadot");
  });

  it("falls back to generic for unrecognized headers", () => {
    const map = detectColumnMap(["domain", "drop_date"]);
    expect(map.provider).toBe("generic");
    expect(map.domainCol).toBe(0);
  });

  it("falls back to generic (first column = domain) when there's no header match at all", () => {
    const map = detectColumnMap(["col1", "col2"]);
    expect(map.provider).toBe("generic");
    expect(map.domainCol).toBe(0);
  });
});

describe("parseCsv", () => {
  it("parses a generic domain[,drop_date] CSV", () => {
    const text = "domain,drop_date\nexample.com,2026-01-02\nfoo.ua,2026-01-03\n";
    const parsed = parseCsv(text, { today: "2026-01-01" });
    expect(parsed.provider).toBe("generic");
    expect(parsed.rows).toEqual([
      { domain: "example.com", dropped_at: "2026-01-02" },
      { domain: "foo.ua", dropped_at: "2026-01-03" },
    ]);
  });

  it("falls back to today's date when a row has no parseable date", () => {
    const text = "domain\nexample.com\n";
    const parsed = parseCsv(text, { today: "2026-01-01" });
    expect(parsed.rows).toEqual([{ domain: "example.com", dropped_at: "2026-01-01" }]);
  });

  it("skips rows with an invalid domain instead of throwing", () => {
    const text = "domain\nnot a domain\nexample.com\n";
    const parsed = parseCsv(text, { today: "2026-01-01" });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it("auto-detects the GoDaddy provider and its Auction End date column", () => {
    const text = 'Domain Name,Auction End,Current Bid\nexample.com,2026-03-15,"$10"\n';
    const parsed = parseCsv(text, { today: "2026-01-01" });
    expect(parsed.provider).toBe("godaddy");
    expect(parsed.rows[0]).toEqual({ domain: "example.com", dropped_at: "2026-03-15" });
  });
});
