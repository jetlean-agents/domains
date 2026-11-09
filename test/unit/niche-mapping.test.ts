import { describe, expect, it } from "vitest";
import { resolveAutoregNicheSlug, MissingNicheMappingError } from "../../src/watchlist/niche-mapping.js";

describe("resolveAutoregNicheSlug", () => {
  it.each(["auto", "energy", "news"])("maps domains niche %s 1:1 to the Autoreg slug", (niche) => {
    expect(resolveAutoregNicheSlug(niche)).toBe(niche);
  });

  it.each(["deals_us", "other", "none", "unknown-value"])(
    "throws MissingNicheMappingError for %s (no Autoreg niche seeded for it)",
    (niche) => {
      expect(() => resolveAutoregNicheSlug(niche)).toThrow(MissingNicheMappingError);
    },
  );
});
