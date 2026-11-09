import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCdxResponse, summarizeSnapshots, pickSampleSnapshots } from "../../src/evaluation/wayback.js";

const fixture = readFileSync(join(import.meta.dirname, "..", "fixtures", "wayback", "cdx-sample.json"), "utf8");

describe("parseCdxResponse", () => {
  it("parses a CDX output=json response using the header row for column order", () => {
    const rows = parseCdxResponse(fixture);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ timestamp: "20120305123456", original: "http://example.com/", statuscode: "200" });
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parseCdxResponse("not json")).toEqual([]);
  });

  it("returns an empty array for an empty result set (just the header, or nothing)", () => {
    expect(parseCdxResponse(JSON.stringify([["timestamp", "original", "statuscode"]]))).toEqual([]);
    expect(parseCdxResponse("[]")).toEqual([]);
  });
});

describe("summarizeSnapshots", () => {
  it("computes first/last snapshot, per-year counts and a positive age", () => {
    const rows = parseCdxResponse(fixture);
    const summary = summarizeSnapshots(rows);
    expect(summary.firstSnapshot).toBe("2012-03-05T12:34:56Z");
    expect(summary.lastSnapshot).toBe("2023-01-01T00:00:00Z");
    expect(summary.snapshotCount).toBe(4);
    expect(summary.snapshotsByYear).toEqual({ "2012": 1, "2015": 2, "2023": 1 });
    expect(summary.ageYears).toBeGreaterThan(10);
  });

  it("returns a zero/null summary for no snapshots", () => {
    expect(summarizeSnapshots([])).toEqual({
      firstSnapshot: null,
      lastSnapshot: null,
      snapshotCount: 0,
      snapshotsByYear: {},
      ageYears: null,
    });
  });
});

describe("pickSampleSnapshots", () => {
  it("returns one snapshot per distinct year when years <= sampleSize", () => {
    const rows = parseCdxResponse(fixture);
    const picked = pickSampleSnapshots(rows, 5);
    expect(picked.map((r) => r.timestamp.slice(0, 4))).toEqual(["2012", "2015", "2023"]);
  });

  it("spreads picks evenly across years when there are more years than sampleSize", () => {
    const manyYears = ["2005", "2008", "2011", "2014", "2017", "2020", "2023"].map((y, i) => ({
      timestamp: `${y}0101000000`,
      original: "http://example.com/",
      statuscode: "200",
    }));
    const picked = pickSampleSnapshots(manyYears, 3);
    expect(picked).toHaveLength(3);
    expect(picked[0].timestamp.slice(0, 4)).toBe("2005");
    expect(picked.at(-1)!.timestamp.slice(0, 4)).toBe("2023");
  });

  it("returns an empty array for no rows", () => {
    expect(pickSampleSnapshots([], 4)).toEqual([]);
  });
});
