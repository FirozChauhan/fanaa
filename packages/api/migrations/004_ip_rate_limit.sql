-- 004: per-IP rate limit for /auth/request (email-bombing relay guard).
-- The existing cooldown is keyed by email only, so an unauthenticated
-- attacker could loop many addresses and make Clerk mail each one. This
-- adds a second, IP-keyed limiter: one request per IP per window.
-- Rows are replaced per request (upsert on key) and opportunistically
-- purged (older than a day) so the table stays bounded.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,           -- "ip:<address>"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
