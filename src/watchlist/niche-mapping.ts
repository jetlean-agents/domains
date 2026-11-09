import type { Niche } from "../evaluation/types.js";

/**
 * Maps a domains `niche` value to the Autoreg niche slug used by
 * `GET /api/v1/niches/?slug=<slug>` (see `autoreg-client.ts`).
 *
 * Autoreg (`jetlean-agents/autoreg`, `registry/management/commands/seed_registry.py`) only seeds
 * three niches — `auto`, `energy`, `news` — which happen to line up 1:1 with the matching domains
 * niche values. `deals_us`, `other`, and `none` have no Autoreg equivalent at all, so they are
 * deliberately left out of this map rather than guessed at.
 */
const NICHE_TO_AUTOREG_SLUG: Partial<Record<Niche, string>> = {
  auto: "auto",
  energy: "energy",
  news: "news",
};

export class MissingNicheMappingError extends Error {
  constructor(niche: string) {
    super(`missing_niche_mapping: no Autoreg niche slug for "${niche}"`);
    this.name = "MissingNicheMappingError";
  }
}

/** Resolves a domains niche to its Autoreg slug, or throws `MissingNicheMappingError`. */
export function resolveAutoregNicheSlug(niche: string): string {
  const slug = NICHE_TO_AUTOREG_SLUG[niche as Niche];
  if (!slug) {
    throw new MissingNicheMappingError(niche);
  }
  return slug;
}
