import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "db", "migrations", "0004_watchlist.sql"),
  "utf8",
);

describe("0004_watchlist.sql — folding the этап 2 .ua watchlist into the unified watchlist", () => {
  it("creates the unified watchlist table with a unique domain", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS watchlist \(/);
    expect(migration).toMatch(/domain TEXT NOT NULL UNIQUE/);
  });

  it("carries over domain, status and last_checked_at from ua_watchlist", () => {
    const insertMatch = migration.match(
      /INSERT INTO watchlist \(([^)]+)\)\s*SELECT ([^\n]+)\s*FROM ua_watchlist/,
    );
    expect(insertMatch, "expected an INSERT INTO watchlist ... SELECT ... FROM ua_watchlist").toBeTruthy();
    const [, columns, selected] = insertMatch!;
    expect(columns).toContain("domain");
    expect(columns).toContain("status");
    expect(columns).toContain("last_checked_at");
    // The SELECT list must line up (same order/count) with the target column list.
    expect(selected.split(",").map((s) => s.trim())).toHaveLength(columns.split(",").length);
  });

  it("does not fail on a domain already present in the unified table (idempotent re-run safety)", () => {
    expect(migration).toMatch(/ON CONFLICT \(domain\) DO NOTHING/);
  });

  it("drops the old ua_watchlist table so there's exactly one watchlist entity", () => {
    expect(migration).toMatch(/DROP TABLE ua_watchlist;/);
  });

  it("drops ua_watchlist only after migrating its data (ordering, not just presence)", () => {
    const insertIdx = migration.indexOf("INSERT INTO watchlist");
    const dropIdx = migration.indexOf("DROP TABLE ua_watchlist");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(insertIdx);
  });
});
