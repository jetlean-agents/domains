export type Niche = "auto" | "energy" | "news" | "deals_us" | "other" | "none";

export interface EvaluationFlags {
  spam: boolean;
  topic_change: boolean;
  parked: boolean;
  no_history: boolean;
}

export interface ScoreBreakdown {
  age: number;
  history: number;
  cleanliness: number;
  /** null when the backlinks source (Common Crawl) was unavailable — excluded from scoring, not 0. */
  backlinks: number | null;
  domain_shape: number;
  zone: number;
}

export interface EvaluationResult {
  domain: string;
  score: number;
  breakdown: ScoreBreakdown;
  niche: Niche;
  niche_confidence: number;
  flags: EvaluationFlags;
  /** True when one or more score components (currently: backlinks) couldn't be computed and the
   *  score was normalized over the remaining ones instead of counting the missing one as 0. */
  partial: boolean;
  age_years: number | null;
  first_snapshot: string | null;
  last_snapshot: string | null;
  snapshot_count: number;
  snapshots_by_year: Record<string, number>;
  backlinks_estimate: number | null;
  top_anchors: string[];
  backlinks_method: string | null;
  computed_at: string;
  cache_expires_at: string;
}

export interface SampleAnalysis {
  timestamp: string;
  year: number;
  lang: "ru" | "uk" | "en" | "unknown";
  niche_hits: Record<Exclude<Niche, "none" | "other">, number>;
  spam_hits: number;
  parked: boolean;
}
