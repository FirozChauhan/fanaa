-- 003_code_attempts.sql — brute-force guard on the dev OTP path.
-- Tracks failed verify attempts per code; a code is burned after 5 misses
-- (the row is deleted, forcing a fresh request + cooldown per attempt batch).
ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
