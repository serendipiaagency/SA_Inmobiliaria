-- Migration number: 0027    Platform-wide error log (production monitoring)
--
-- Captures every server error (status >= 500) via a Nitro error hook so
-- incidents like the July schema-drift outage ("properties disappeared")
-- show up here instead of depending on a customer to report them. Not
-- scoped to a single organization_id — a database/deploy incident is a
-- platform-ops concern, not a tenant's business data, so this table is
-- readable only by super_admin (see server/api/admin/system/errors.get.ts).

CREATE TABLE error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_code INTEGER NOT NULL DEFAULT 500,
  message TEXT NOT NULL,
  stack TEXT,
  method TEXT,
  path TEXT,
  organization_id INTEGER,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX error_logs_created_at ON error_logs (created_at);
CREATE INDEX error_logs_status ON error_logs (status_code);
