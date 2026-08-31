-- Migration number: 0052    Hash session tokens instead of storing them raw
--
-- sessions.id has been the raw session cookie value since migration 0001 —
-- unlike password_reset_tokens.tokenHash (0009) or api_keys.keyHash (0016),
-- a D1 backup or leak would hand over directly reusable session cookies for
-- every currently-logged-in user (docs/production-hardening-audit.md, P1-3).
--
-- EXPAND only: adds a nullable token_hash column and a partial unique index
-- on it, no rebuild. server/utils/auth.ts does the MIGRATE/rotate part in
-- code, not here — new sessions (createSession) store only the SHA-256 hash
-- of the raw token, with `id` becoming an unrelated opaque identifier;
-- existing sessions (token_hash IS NULL, id = the raw token in plaintext)
-- keep working via a fallback lookup on `id` and are rotated to a hashed
-- row — both a new random `id` and a real token_hash — on their next valid
-- use (getSessionUser()), so no one is logged out by this migration and no
-- backfill script is needed: sessions expire and get replaced naturally
-- within SESSION_TTL_DAYS (7 days by default) regardless.

ALTER TABLE sessions ADD COLUMN token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash ON sessions (token_hash) WHERE token_hash IS NOT NULL;
