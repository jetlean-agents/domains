-- Supports claiming a watchlist entry before calling Autoreg (see takeToAutoreg): a concurrent
-- "взять в работу" click must not reach Autoreg twice.
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS autoreg_take_started_at TIMESTAMPTZ;
