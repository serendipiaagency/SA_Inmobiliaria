-- Migration number: 0056    Request-id correlation for error_logs and webhook_deliveries
--
-- error_logs and webhook_deliveries had no shared thread linking rows back
-- to the request that produced them — a webhook delivery failure and an
-- error log entry caused by the same request could only be matched up by
-- eyeballing timestamps (docs/production-hardening-audit.md, P1-12).
-- server/utils/requestId.ts reuses Cloudflare's own cf-ray header (unique
-- per request at the edge, free) as the correlation id.
--
-- Purely additive (ADD COLUMN, nullable) — no rebuild.

ALTER TABLE error_logs ADD COLUMN request_id TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN request_id TEXT;
