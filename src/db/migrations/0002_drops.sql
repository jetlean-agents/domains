CREATE TABLE IF NOT EXISTS drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  source TEXT NOT NULL,
  dropped_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (domain, source, dropped_at)
);

CREATE INDEX IF NOT EXISTS drops_tld_idx ON drops (tld);
CREATE INDEX IF NOT EXISTS drops_source_idx ON drops (source);
CREATE INDEX IF NOT EXISTS drops_dropped_at_idx ON drops (dropped_at);
CREATE INDEX IF NOT EXISTS drops_domain_idx ON drops (domain);

CREATE TABLE IF NOT EXISTS ua_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zone_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tld TEXT NOT NULL,
  run_date DATE NOT NULL,
  snapshot_path TEXT,
  added_count INT,
  removed_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tld, run_date)
);

CREATE TABLE IF NOT EXISTS csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  provider TEXT,
  row_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
