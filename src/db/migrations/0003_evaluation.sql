-- Хвост этапа 2: имя токена должно быть переиспользуемо после revoke —
-- уникальность нужна только среди активных токенов.
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS tokens_name_active_idx ON tokens (name) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS domain_evaluations (
  domain TEXT PRIMARY KEY,
  score INT NOT NULL,
  breakdown JSONB NOT NULL,
  niche TEXT NOT NULL,
  niche_confidence REAL NOT NULL,
  flags JSONB NOT NULL,
  age_years REAL,
  first_snapshot TIMESTAMPTZ,
  last_snapshot TIMESTAMPTZ,
  snapshot_count INT NOT NULL DEFAULT 0,
  snapshots_by_year JSONB NOT NULL DEFAULT '{}'::jsonb,
  backlinks_estimate INT,
  top_anchors JSONB NOT NULL DEFAULT '[]'::jsonb,
  backlinks_method TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cache_expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS domain_evaluations_niche_idx ON domain_evaluations (niche);
CREATE INDEX IF NOT EXISTS domain_evaluations_score_idx ON domain_evaluations (score);
CREATE INDEX IF NOT EXISTS domain_evaluations_cache_expires_idx ON domain_evaluations (cache_expires_at);

CREATE TABLE IF NOT EXISTS evaluation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domains TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  results JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Дневной лимит фоновой автооценки новых дропов (EVAL_DAILY_LIMIT): один счётчик
-- на календарный день (UTC), инкрементируется при каждой свежей (не из кэша) оценке.
CREATE TABLE IF NOT EXISTS auto_eval_daily_counts (
  run_date DATE PRIMARY KEY,
  count INT NOT NULL DEFAULT 0
);
