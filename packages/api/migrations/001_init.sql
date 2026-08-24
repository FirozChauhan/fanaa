-- 001_init.sql — Fanaa v0.2 schema
-- Identity (email OTP auth) + letter sync. All timestamps TIMESTAMPTZ.

-- One row per verified email address.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6-digit verification codes, single-use, 5-minute TTL (enforced by query).
CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email);

-- Opaque bearer tokens (random 32-byte hex), 30-day TTL.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Letters are the source of truth in v0.2; local markdown files become a
-- synced cache. deleted_at is a tombstone so removals propagate to every
-- device; rows are hard-purged server-side after 30 days.
-- PK is (user_id, id) so an id collision across accounts can never leak data.
CREATE TABLE IF NOT EXISTS letters (
  id TEXT NOT NULL,               -- YYYY-MM-DD-HHMM-XXXXXX (client key)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,      -- the letter's own date (sort key)
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_letters_user_date ON letters(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_letters_user_updated ON letters(user_id, updated_at);
