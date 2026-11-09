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
export function countNicheHits(text: string): Record<Exclude<Niche, "none" | "other">, number> {
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

/** Cap on the raw (post-prior) hit count required to trust a niche instead of calling it "other". */
const MIN_NICHE_HITS = 2;
/** Minimum share of the winning niche among all hits required to trust it instead of "other". */
const MIN_NICHE_CONFIDENCE = 0.5;
/** Cap applied when the guess rests on the zone prior alone, with no sampled page content at all. */
const NO_CONTENT_CONFIDENCE_CAP = 0.3;

/** Counts samples whose own (pre-prior) hits matched at least one niche keyword. */
function countClassifiedSamples(
  sampleHits: Array<Record<Exclude<Niche, "none" | "other">, number>>,
): number {
  return sampleHits.filter((hits) => Object.values(hits).some((v) => v > 0)).length;
}

/**
 * Aggregates per-sample niche hit counts plus a small zone-based prior (e.g. .com.ua -> auto/energy/news)
 * into one niche guess with a 0..1 confidence. `none` wins when nothing scores above zero; `other`
 * wins when the winning niche's signal is too weak or too ambiguous to trust (e.g. a generic word
 * that happens to overlap one niche's keyword list) rather than forcing it into the nearest of the
 * 4 known niches. When there were zero sampled pages (e.g. no Wayback history at all), the guess —
 * if any — comes purely from the zone prior, so its confidence is capped well below certainty.
 */
export function classifyNiche(
  sampleHits: Array<Record<Exclude<Niche, "none" | "other">, number>>,
  publicSuffix: string | null,
): NicheClassification {
  const totals: Record<Exclude<Niche, "none" | "other">, number> = { auto: 0, energy: 0, news: 0, deals_us: 0 };
  for (const hits of sampleHits) {
    for (const niche of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[niche] += hits[niche];
    }
  }
  const prior: Partial<Record<Exclude<Niche, "none" | "other">, number>> = publicSuffix
    ? ZONE_NICHE_PRIOR[publicSuffix] ?? {}
    : {};
  for (const niche of Object.keys(totals) as Array<keyof typeof totals>) {
    totals[niche] += prior[niche] ?? 0;
  }

  const entries = Object.entries(totals) as Array<[Exclude<Niche, "none" | "other">, number]>;
  const [bestNiche, bestScore] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  if (bestScore <= 0) return { niche: "none", confidence: 0 };

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const confidence = Math.round(Math.min(1, bestScore / Math.max(1, total)) * 100) / 100;

  if (sampleHits.length === 0) {
    return { niche: bestNiche, confidence: Math.min(confidence, NO_CONTENT_CONFIDENCE_CAP) };
  }

  // A fixed MIN_NICHE_HITS=2 unfairly punishes a long-history site where only one sampled
  // snapshot actually matched niche keywords (the rest failed to fetch or carried none): one
  // real hit is the strongest signal that single classified sample could ever produce. Only
  // relax the bar when some sample actually carried content signal — a domain whose fetched
  // samples matched nothing at all still needs the full bar, so the zone prior alone (e.g. the
  // "com" -> deals_us prior) can never manufacture a confident niche on its own.
  const classifiedSamples = countClassifiedSamples(sampleHits);
  const requiredHits = classifiedSamples > 0 ? Math.max(1, Math.min(MIN_NICHE_HITS, classifiedSamples)) : MIN_NICHE_HITS;

  if (bestScore < requiredHits || confidence < MIN_NICHE_CONFIDENCE) {
    return { niche: "other", confidence };
  }
  return { niche: bestNiche, confidence };
}

/** Consecutive same-niche samples required, after the baseline, before a switch counts as real. */
const TOPIC_CHANGE_MIN_RUN = 2;
/** Minimum share of a sample's hits the new niche must hold to count towards that run. */
const TOPIC_CHANGE_MIN_CONFIDENCE = 0.5;

/**
 * Flags a topic change only when the dominant niche settles on a *different* niche for at least
 * `TOPIC_CHANGE_MIN_RUN` consecutive confident samples after the baseline (the first sample with
 * any niche signal) — not merely whenever two different niches appear anywhere in the history.
 * Samples with no niche signal are ignored (they neither extend nor break a run), and a single
 * noisy/ambiguous snapshot (low confidence) in an otherwise-stable history doesn't break the
 * baseline or start counting towards a change. This avoids flagging a long-running single-topic
 * site (e.g. a 28-year-old news site) just because classifier noise picks a different best-match
 * niche on one or two of many sampled snapshots.
 */
export function detectTopicChange(sampleHits: Array<Record<Exclude<Niche, "none" | "other">, number>>): boolean {
  const dominants: Array<{ niche: string; confidence: number }> = [];
  for (const hits of sampleHits) {
    const entries = Object.entries(hits);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const [bestNiche, bestScore] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    if (bestScore <= 0) continue;
    dominants.push({ niche: bestNiche, confidence: bestScore / Math.max(1, total) });
  }
  if (dominants.length === 0) return false;

  const baseline = dominants[0].niche;
  let run = 0;
  for (const d of dominants) {
    const isConfidentSwitch = d.niche !== baseline && d.confidence >= TOPIC_CHANGE_MIN_CONFIDENCE;
    run = isConfidentSwitch ? run + 1 : 0;
    if (run >= TOPIC_CHANGE_MIN_RUN) return true;
  }
  return false;
}
