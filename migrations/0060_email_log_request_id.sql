-- Migration number: 0060    Request-id correlation for email_log
--
-- Extends the request-id correlation from migration 0056 (error_logs,
-- webhook_deliveries) to email_log — a transactional email send caused by
-- the same request as a webhook delivery or an error log entry could
-- previously only be matched up by eyeballing timestamps
-- (docs/production-hardening-audit.md, P1-12, left deliberately partial in
-- that pass). server/utils/requestId.ts reuses Cloudflare's own cf-ray
-- header (unique per request at the edge, free) as the correlation id.
--
-- Nullable: rows sent from a scheduled task (appointment reminders, saved-
-- search alerts) have no HTTP request to correlate with, and rows recorded
-- before this column existed have none either.
--
-- Purely additive (ADD COLUMN, nullable) — no rebuild.

ALTER TABLE email_log ADD COLUMN request_id TEXT;
