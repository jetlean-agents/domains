import { describe, expect, it } from "vitest";
import { normalizeDomain, InvalidDomainError } from "../../src/domain/normalize.js";

describe("normalizeDomain", () => {
  it("lowercases and keeps plain ASCII domains", () => {
    const n = normalizeDomain("Example.COM");
    expect(n.ascii).toBe("example.com");
    expect(n.publicSuffix).toBe("com");
  });

  it("resolves the public suffix for .com.ua", () => {
    const n = normalizeDomain("example.com.ua");
    expect(n.ascii).toBe("example.com.ua");
    expect(n.publicSuffix).toBe("com.ua");
  });

  it("converts IDN labels to punycode", () => {
    const n = normalizeDomain("пример.ua");
    expect(n.ascii.startsWith("xn--")).toBe(true);
  });

  it("strips a trailing dot", () => {
    const n = normalizeDomain("example.com.");
    expect(n.ascii).toBe("example.com");
  });

  it("rejects a bare TLD", () => {
    expect(() => normalizeDomain("com")).toThrow(InvalidDomainError);
  });

  it("rejects an empty string", () => {
    expect(() => normalizeDomain("")).toThrow(InvalidDomainError);
  });

  it("rejects invalid characters", () => {
    expect(() => normalizeDomain("exa mple.com")).toThrow(InvalidDomainError);
  });

  it("rejects a non-registrable multi-label host", () => {
    expect(() => normalizeDomain("foo.bar.example.com")).toThrow(InvalidDomainError);
  });
});
