import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "db", "migrations", "0003_evaluation.sql"),
  "utf8",
);

describe("0003_evaluation.sql — token name reuse (хвост этапа 2)", () => {
  it("drops the old table-wide unique constraint on tokens.name", () => {
    expect(migration).toMatch(/ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_name_key/);
  });

  it("replaces it with a partial unique index that only covers active (non-revoked) tokens", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS tokens_name_active_idx ON tokens \(name\) WHERE revoked_at IS NULL/,
    );
  });
});
