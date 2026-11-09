import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseZoneFile } from "../../src/zonediff/zone-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures/zones");

async function collect(filePath: string): Promise<string[]> {
  const out: string[] = [];
  for await (const d of parseZoneFile(filePath)) out.push(d);
  return out;
}

describe("parseZoneFile", () => {
  it("extracts unique second-level domains with NS records from day1 fixture", async () => {
    const domains = await collect(path.join(FIXTURES, "day1.zone"));
    expect(domains.sort()).toEqual(["alpha.test", "beta.test", "delta.test", "gamma.test"]);
  });

  it("resolves relative and absolute (trailing-dot) owner names to the same domain", async () => {
    const domains = await collect(path.join(FIXTURES, "day1.zone"));
    // "alpha" (relative) and "beta.test." (absolute) both resolve under $ORIGIN test.
    expect(domains).toContain("alpha.test");
    expect(domains).toContain("beta.test");
  });

  it("collapses duplicate NS records for the same owner", async () => {
    const domains = await collect(path.join(FIXTURES, "day1.zone"));
    expect(domains.filter((d) => d === "gamma.test")).toHaveLength(1);
  });

  it("ignores non-NS record types and the zone apex", async () => {
    const domains = await collect(path.join(FIXTURES, "day1.zone"));
    expect(domains).not.toContain("test");
    // delta.test has both an NS and an A record — still counted exactly once via NS.
    expect(domains.filter((d) => d === "delta.test")).toHaveLength(1);
  });

  it("reflects the day2 fixture's smaller domain set", async () => {
    const domains = await collect(path.join(FIXTURES, "day2.zone"));
    expect(domains.sort()).toEqual(["alpha.test", "beta.test", "epsilon.test"]);
  });
});
