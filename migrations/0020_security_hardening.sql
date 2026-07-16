-- Security audit follow-up:
-- 1) leads.email is queried on every public form submission (upsertLead dedupe by
--    email) with no index — would degrade to a full table scan as the table grows.
-- 2) rate_limits backs a lightweight D1-based fixed-window limiter (server/utils/rateLimit.ts)
--    for login and public forms, since this deployment has no KV namespace provisioned.
CREATE INDEX IF NOT EXISTS leads_email ON leads(email);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(bucket, window_start)
);
