import type { Pool } from "pg";
import { getDomainWithoutSuffix, getPublicSuffix } from "tldts";
import { config } from "../config.js";
import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";
import { getFreshEvaluation, upsertEvaluation } from "../db/queries.js";
import { fetchCdx, pickSampleSnapshots, summarizeSnapshots, fetchSnapshotContent } from "./wayback.js";
import { fetchCommonCrawlPresence } from "./commoncrawl.js";
import {
  htmlToText,
  detectLanguage,
  countNicheHits,
  countSpamHits,
  isParkedPage,
  classifyNiche,
  detectTopicChange,
} from "./content-analysis.js";
import { computeScore, detectFlags } from "./score.js";
import type { EvaluationResult, Niche, SampleAnalysis } from "./types.js";

async function analyzeSamples(rows: ReturnType<typeof pickSampleSnapshots>): Promise<SampleAnalysis[]> {
  const samples: SampleAnalysis[] = [];
  for (const row of rows) {
    const html = await fetchSnapshotContent(row);
    if (html === null) continue;
    const text = htmlToText(html);
    samples.push({
      timestamp: row.timestamp,
      year: Number.parseInt(row.timestamp.slice(0, 4), 10),
      lang: detectLanguage(text),
      niche_hits: { ...countNicheHits(text), none: 0 },
      spam_hits: countSpamHits(text),
      parked: isParkedPage(text),
    });
  }
  return samples;
}

/** Runs the full Wayback + Common Crawl evaluation pipeline for one domain, using the DB cache when fresh. */
export async function evaluateDomain(pool: Pool, rawDomain: string): Promise<EvaluationResult> {
  const normalized = normalizeDomain(rawDomain);
  const domain = normalized.ascii;

  const cached = await getFreshEvaluation(pool, domain);
  if (cached) return cached;

  const cdxRows = await fetchCdx(domain);
  const summary = summarizeSnapshots(cdxRows);
  const sampleRows = pickSampleSnapshots(cdxRows, config.wayback.sampleSize);
  const samples = await analyzeSamples(sampleRows);

  const niceHits = samples.map((s) => {
    const { none, ...rest } = s.niche_hits;
    return rest;
  });
  const publicSuffix = getPublicSuffix(domain) ?? normalized.publicSuffix;
  const { niche, confidence } = classifyNiche(niceHits, publicSuffix);
  const topicChange = detectTopicChange(niceHits);

  const spamSampleRatio = samples.length > 0 ? samples.filter((s) => s.spam_hits > 0).length / samples.length : 0;
  const latestSample = samples.at(-1);
  const parkedLatest = latestSample?.parked ?? false;

  let backlinksEstimate: number | null = null;
  let backlinksMethod: string | null = null;
  try {
    const presence = await fetchCommonCrawlPresence(domain);
    backlinksEstimate = presence.pageCount;
    backlinksMethod = presence.method;
  } catch {
    // Common Crawl is best-effort: scoring falls back to 0 backlink points, not a hard failure.
  }

  const label = getDomainWithoutSuffix(domain) ?? domain.split(".")[0];
  const yearsCovered = Object.keys(summary.snapshotsByYear).length;
  const { score, breakdown } = computeScore({
    ageYears: summary.ageYears,
    snapshotCount: summary.snapshotCount,
    yearsCovered,
    spamSampleRatio,
    parkedLatest,
    topicChange,
    backlinksEstimate,
    label,
    publicSuffix,
  });
  const flags = detectFlags({
    snapshotCount: summary.snapshotCount,
    spamSampleRatio,
    parkedLatest,
    topicChange,
  });

  const now = new Date();
  const result: EvaluationResult = {
    domain,
    score,
    breakdown,
    niche: niche as Niche,
    niche_confidence: confidence,
    flags,
    age_years: summary.ageYears,
    first_snapshot: summary.firstSnapshot,
    last_snapshot: summary.lastSnapshot,
    snapshot_count: summary.snapshotCount,
    snapshots_by_year: summary.snapshotsByYear,
    backlinks_estimate: backlinksEstimate,
    top_anchors: [],
    backlinks_method: backlinksMethod,
    computed_at: now.toISOString(),
    cache_expires_at: new Date(now.getTime() + config.evalCacheTtlSeconds * 1000).toISOString(),
  };

  await upsertEvaluation(pool, result, config.evalCacheTtlSeconds);
  return result;
}

export async function evaluateDomains(
  pool: Pool,
  rawDomains: string[],
): Promise<Array<EvaluationResult | { domain: string; error: string }>> {
  const results: Array<EvaluationResult | { domain: string; error: string }> = [];
  for (const raw of rawDomains) {
    try {
      results.push(await evaluateDomain(pool, raw));
    } catch (err) {
      if (err instanceof InvalidDomainError) {
        results.push({ domain: raw, error: "invalid_domain" });
      } else {
        results.push({ domain: raw, error: err instanceof Error ? err.message : "evaluation_failed" });
      }
    }
  }
  return results;
}
