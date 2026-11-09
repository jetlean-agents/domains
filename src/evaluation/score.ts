import type { EvaluationFlags, ScoreBreakdown } from "./types.js";

export interface ScoreInput {
  ageYears: number | null;
  snapshotCount: number;
  yearsCovered: number;
  /** Fraction (0..1) of sampled Wayback snapshots that matched a spam keyword. */
  spamSampleRatio: number;
  parkedLatest: boolean;
  topicChange: boolean;
  backlinksEstimate: number | null;
  /** Second-level label only (e.g. "example" for "example.com.ua"), lowercased. */
  label: string;
  publicSuffix: string | null;
}

const ZONE_BONUS: Record<string, number> = { com: 5, "com.ua": 4, ua: 3, net: 3, org: 2 };

/** Max points per component, used to renormalize the total when a component is unavailable (null). */
const COMPONENT_MAX = {
  age: 20,
  history: 20,
  cleanliness: 25,
  backlinks: 20,
  domain_shape: 10,
  zone: 5,
} as const satisfies Record<keyof ScoreBreakdown, number>;

/** 0..20: older first snapshot scores higher, capped at 10 years. */
function scoreAge(ageYears: number | null): number {
  if (!ageYears || ageYears <= 0) return 0;
  return Math.min(20, Math.round(ageYears * 2));
}

/** 0..20: rewards both breadth (distinct years seen) and depth (total snapshot count). */
function scoreHistory(snapshotCount: number, yearsCovered: number): number {
  if (snapshotCount === 0) return 0;
  return Math.min(20, yearsCovered * 2 + Math.min(10, Math.floor(snapshotCount / 5)));
}

/** 0..25: starts clean, penalized by spam keyword hits, a currently-parked page, or a topic change. */
function scoreCleanliness(spamSampleRatio: number, parkedLatest: boolean, topicChange: boolean): number {
  const penalty = spamSampleRatio * 20 + (parkedLatest ? 5 : 0) + (topicChange ? 5 : 0);
  return Math.max(0, Math.round(25 - penalty));
}

/**
 * 0..20, log-scaled so the first few referring pages matter more than the next few hundred; null
 * when the backlinks source itself was unavailable (as opposed to a successful "zero pages" read),
 * so the caller can exclude it from the score instead of counting an outage as "no backlinks".
 */
function scoreBacklinks(backlinksEstimate: number | null): number | null {
  if (backlinksEstimate === null) return null;
  if (backlinksEstimate <= 0) return 0;
  return Math.min(20, Math.round(Math.log2(backlinksEstimate + 1) * 3));
}

/** 0..10: short, clean (no digits/hyphens) labels are easier to brand and remember. */
function scoreDomainShape(label: string): number {
  const len = label.length;
  let base = len <= 6 ? 10 : len <= 10 ? 8 : len <= 15 ? 5 : 2;
  if (/[0-9]/.test(label)) base -= 2;
  if (/-/.test(label)) base -= 2;
  return Math.max(0, base);
}

/** 0..5: small prior for zones this project's niches actually care about. */
function scoreZone(publicSuffix: string | null): number {
  if (!publicSuffix) return 0;
  return ZONE_BONUS[publicSuffix] ?? 1;
}

export function computeScore(input: ScoreInput): { score: number; breakdown: ScoreBreakdown; partial: boolean } {
  const breakdown: ScoreBreakdown = {
    age: scoreAge(input.ageYears),
    history: scoreHistory(input.snapshotCount, input.yearsCovered),
    cleanliness: scoreCleanliness(input.spamSampleRatio, input.parkedLatest, input.topicChange),
    backlinks: scoreBacklinks(input.backlinksEstimate),
    domain_shape: scoreDomainShape(input.label),
    zone: scoreZone(input.publicSuffix),
  };

  // A component that couldn't be computed (currently only backlinks, when Common Crawl was
  // unavailable) is excluded entirely rather than counted as 0: the score is renormalized over
  // whatever components did come back, so an upstream outage doesn't masquerade as a bad score.
  let earned = 0;
  let maxPossible = 0;
  for (const key of Object.keys(COMPONENT_MAX) as Array<keyof typeof COMPONENT_MAX>) {
    const value = breakdown[key];
    if (value === null) continue;
    earned += value;
    maxPossible += COMPONENT_MAX[key];
  }
  const score = maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0;
  const partial = Object.values(breakdown).some((v) => v === null);
  return { score: Math.max(0, Math.min(100, score)), breakdown, partial };
}

export function detectFlags(input: {
  snapshotCount: number;
  spamSampleRatio: number;
  parkedLatest: boolean;
  topicChange: boolean;
}): EvaluationFlags {
  return {
    spam: input.spamSampleRatio > 0,
    topic_change: input.topicChange,
    parked: input.parkedLatest,
    no_history: input.snapshotCount === 0,
  };
}
