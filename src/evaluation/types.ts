export type Niche = "auto" | "energy" | "news" | "deals_us" | "none";

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
  backlinks: number;
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
  niche_hits: Record<Niche, number>;
  spam_hits: number;
  parked: boolean;
}
