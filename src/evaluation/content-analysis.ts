import { NICHE_KEYWORDS, PARKED_MARKERS, SPAM_KEYWORDS, ZONE_NICHE_PRIOR } from "./keywords.js";
import type { Niche } from "./types.js";

const TAG_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_RE = /<[^>]+>/g;

/** Strips script/style blocks and tags, collapses whitespace; lowercased plain text for keyword matching. */
export function htmlToText(html: string): string {
  return html
    .replace(TAG_RE, " ")
    .replace(HTML_TAG_RE, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const UA_SPECIFIC = /[іїєґ]/g;
const RU_SPECIFIC = /[ёъыэ]/g;
const CYRILLIC = /[а-яёіїєґ]/gi;
const LATIN = /[a-z]/gi;

/** Rough language guess (ru / uk / en) from a page's plain text, by character-set heuristics only. */
export function detectLanguage(text: string): "ru" | "uk" | "en" | "unknown" {
  const cyrillicCount = (text.match(CYRILLIC) ?? []).length;
  const latinCount = (text.match(LATIN) ?? []).length;
  if (cyrillicCount === 0 && latinCount === 0) return "unknown";
  if (cyrillicCount > latinCount) {
    const uaHits = (text.match(UA_SPECIFIC) ?? []).length;
    const ruHits = (text.match(RU_SPECIFIC) ?? []).length;
    return uaHits > ruHits ? "uk" : "ru";
  }
  return "en";
}

function countHits(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) count += 1;
  }
  return count;
}

/** Counts niche keyword hits per niche for one page's text (no zone prior applied here). */
export function countNicheHits(text: string): Record<Exclude<Niche, "none">, number> {
  return {
    auto: countHits(text, NICHE_KEYWORDS.auto),
    energy: countHits(text, NICHE_KEYWORDS.energy),
    news: countHits(text, NICHE_KEYWORDS.news),
    deals_us: countHits(text, NICHE_KEYWORDS.deals_us),
  };
}

export function countSpamHits(text: string): number {
  return countHits(text, SPAM_KEYWORDS);
}

export function isParkedPage(text: string): boolean {
  return PARKED_MARKERS.some((marker) => text.includes(marker));
}

export interface NicheClassification {
  niche: Niche;
  confidence: number;
}

/**
 * Aggregates per-sample niche hit counts plus a small zone-based prior (e.g. .com.ua -> auto/energy/news)
 * into one niche guess with a 0..1 confidence. `none` wins when nothing scores above zero.
 */
export function classifyNiche(
  sampleHits: Array<Record<Exclude<Niche, "none">, number>>,
  publicSuffix: string | null,
): NicheClassification {
  const totals: Record<Exclude<Niche, "none">, number> = { auto: 0, energy: 0, news: 0, deals_us: 0 };
  for (const hits of sampleHits) {
    for (const niche of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[niche] += hits[niche];
    }
  }
  const prior: Partial<Record<Exclude<Niche, "none">, number>> = publicSuffix
    ? ZONE_NICHE_PRIOR[publicSuffix] ?? {}
    : {};
  for (const niche of Object.keys(totals) as Array<keyof typeof totals>) {
    totals[niche] += prior[niche] ?? 0;
  }

  const entries = Object.entries(totals) as Array<[Exclude<Niche, "none">, number]>;
  const [bestNiche, bestScore] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  if (bestScore <= 0) return { niche: "none", confidence: 0 };

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const confidence = Math.min(1, bestScore / Math.max(1, total));
  return { niche: bestNiche, confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Flags a topic change when the dominant niche across time-ordered samples switches from one
 * specific niche to a different specific niche (samples with no niche signal are ignored, so a
 * single ambiguous snapshot in the middle doesn't trigger a false positive).
 */
export function detectTopicChange(sampleHits: Array<Record<Exclude<Niche, "none">, number>>): boolean {
  const dominants: string[] = [];
  for (const hits of sampleHits) {
    const entries = Object.entries(hits);
    const [bestNiche, bestScore] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    if (bestScore > 0) dominants.push(bestNiche);
  }
  return new Set(dominants).size > 1;
}
