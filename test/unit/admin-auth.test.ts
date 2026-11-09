import { describe, expect, it } from "vitest";
import { verifyAdminToken } from "../../src/auth/tokens.js";
import { config } from "../../src/config.js";

describe("verifyAdminToken", () => {
  it("rejects when ADMIN_TOKEN is not configured", () => {
    const original = config.adminToken;
    config.adminToken = "";
    expect(verifyAdminToken("anything")).toBe(false);
    config.adminToken = original;
  });

  it("rejects an empty or wrong token", () => {
    const original = config.adminToken;
    config.adminToken = "correct-token";
    expect(verifyAdminToken("")).toBe(false);
    expect(verifyAdminToken("wrong-token")).toBe(false);
    config.adminToken = original;
  });

  it("accepts the exact ADMIN_TOKEN", () => {
    const original = config.adminToken;
    config.adminToken = "correct-token";
    expect(verifyAdminToken("correct-token")).toBe(true);
    config.adminToken = original;
  });

  it("rejects a DB-style service token even if it happened to match length (never trusts the DB)", () => {
    const original = config.adminToken;
    config.adminToken = "correct-token";
    // verifyAdminToken never queries the DB — a service token, however valid
    // for requireAuth, must not satisfy the admin check.
    expect(verifyAdminToken("some-service-token-from-db")).toBe(false);
    config.adminToken = original;
  });
});
