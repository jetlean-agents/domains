import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getWhoisParser } from "../../src/domain/parsers/index.js";

const FIXTURES_DIR = path.join(__dirname, "../fixtures/whois");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

describe("whois parsers", () => {
  it("parses a registered .com domain", () => {
    const result = getWhoisParser("com")(fixture("com-registered.txt"));
    expect(result.status).toBe("registered");
    expect(result.expiresAt).toBe("2026-08-13T04:00:00.000Z");
  });

  it("parses an available .com domain", () => {
    const result = getWhoisParser("com")(fixture("com-available.txt"));
    expect(result.status).toBe("available");
  });

  it("parses a registered .com.ua domain", () => {
    const result = getWhoisParser("com.ua")(fixture("comua-registered.txt"));
    expect(result.status).toBe("registered");
    expect(result.registrar).toBe("hostmaster.ua");
    expect(result.expiresAt).toMatch(/^2027-05-(19|20)/);
  });

  it("parses an available .com.ua domain", () => {
    const result = getWhoisParser("com.ua")(fixture("comua-available.txt"));
    expect(result.status).toBe("available");
  });

  it("parses a registered .de domain", () => {
    const result = getWhoisParser("de")(fixture("de-registered.txt"));
    expect(result.status).toBe("registered");
  });

  it("parses an available .de domain", () => {
    const result = getWhoisParser("de")(fixture("de-available.txt"));
    expect(result.status).toBe("available");
  });

  it("parses a registered .io domain", () => {
    const result = getWhoisParser("io")(fixture("io-registered.txt"));
    expect(result.status).toBe("registered");
    expect(result.registrar).toBe("Identity Digital Inc.");
  });

  it("parses an available .io domain", () => {
    const result = getWhoisParser("io")(fixture("io-available.txt"));
    expect(result.status).toBe("available");
  });
});
