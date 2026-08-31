-- Migration number: 0054    Retry/dead-letter for outbound webhook deliveries
--
-- dispatchWebhook() (server/utils/webhooks.ts) made exactly one attempt and
-- permanently marked a failure 'failed' — no retry, despite
-- webhook_deliveries.attempts already implying one was intended
-- (docs/production-hardening-audit.md, P1-4). Email already has a real
-- retry/backoff queue (email_log.next_retry_at,
-- server/tasks/notifications/retry-email-queue.ts) — this brings webhooks
-- to the same pattern instead of a second, different implementation.
--
-- Purely additive (ADD COLUMN, nullable) — no rebuild needed.

ALTER TABLE webhook_deliveries ADD COLUMN next_retry_at TEXT;
