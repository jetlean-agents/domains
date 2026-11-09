CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  niche TEXT,
  note TEXT,
  added_by TEXT,
  desired_action TEXT NOT NULL DEFAULT 'take',
  status TEXT NOT NULL DEFAULT 'unknown',
  expires_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_warned_for_date DATE,
  autoreg_site_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watchlist_next_check_at_idx ON watchlist (next_check_at);
CREATE INDEX IF NOT EXISTS watchlist_status_idx ON watchlist (status);

CREATE TABLE IF NOT EXISTS watch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlist (id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  message TEXT NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watch_events_watchlist_id_idx ON watch_events (watchlist_id);
CREATE INDEX IF NOT EXISTS watch_events_created_at_idx ON watch_events (created_at);

-- Fold the этап 2 `.ua` watchlist into the unified `watchlist` table (one entity, not two).
INSERT INTO watchlist (domain, status, last_checked_at, note)
SELECT domain, status, last_checked_at, 'migrated from ua_watchlist (этап 2)'
FROM ua_watchlist
ON CONFLICT (domain) DO NOTHING;

DROP TABLE ua_watchlist;
