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

/** 0..20: log-scaled so the first few referring pages matter more than the next few hundred. */
function scoreBacklinks(backlinksEstimate: number | null): number {
  if (!backlinksEstimate || backlinksEstimate <= 0) return 0;
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

export function computeScore(input: ScoreInput): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    age: scoreAge(input.ageYears),
    history: scoreHistory(input.snapshotCount, input.yearsCovered),
    cleanliness: scoreCleanliness(input.spamSampleRatio, input.parkedLatest, input.topicChange),
    backlinks: scoreBacklinks(input.backlinksEstimate),
    domain_shape: scoreDomainShape(input.label),
    zone: scoreZone(input.publicSuffix),
  };
  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { score: Math.max(0, Math.min(100, score)), breakdown };
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
