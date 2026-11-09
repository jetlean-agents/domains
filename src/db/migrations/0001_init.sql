CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS domain_cache (
  domain TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  registrar TEXT,
  source TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  cache_expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS domain_cache_expires_idx ON domain_cache (cache_expires_at);

CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
