-- Migration number: 0043    Stripe webhook confirmation (real payment status, not manual polling only)
--
-- DESTRUCTIVE: rebuilds deposit_payments (DROP + RENAME) to rename a
-- misleadingly-named column — every row is copied via INSERT...SELECT into
-- the replacement table first (ids preserved), so no data is lost.
-- Retroactively marked for scripts/check-migrations.mjs's
-- dangerous-migration gate; this migration already shipped and ran clean.
--
-- Two changes:
--
-- 1. deposit_payments.stripe_payment_intent_id has actually stored the
--    Checkout SESSION id since it was introduced (server/api/admin/saas/
--    deposits.post.ts sets it from createDepositCheckout()'s sessionId) — a
--    misleading name that becomes a real problem once webhooks need to match
--    payment_intent.payment_failed / charge.refunded events, which key off
--    the actual PaymentIntent id, not the Checkout Session id. Renamed to
--    stripe_checkout_session_id (rebuilt, same technique as 0023/0042 — D1
--    can't ALTER a column's identity in place), and a new
--    stripe_payment_intent_id holds the real one, populated once a
--    checkout.session.completed webhook reveals it. Also adds refunded_at
--    for the new 'refunded' status.
--
-- 2. stripe_webhook_events: idempotency for Stripe's at-least-once delivery
--    (unique event_id — a redelivered event is recognized and skipped, never
--    reprocessed) and the record backing the admin event-history view.

CREATE TABLE deposit_payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contract_id INTEGER REFERENCES contracts(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | not_connected | processing | paid | failed | refunded
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  refunded_at TEXT
);

INSERT INTO deposit_payments_new (id, organization_id, contract_id, amount, currency, status, stripe_checkout_session_id, error_message, created_at, paid_at)
SELECT id, organization_id, contract_id, amount, currency, status, stripe_payment_intent_id, error_message, created_at, paid_at
FROM deposit_payments;

DROP TABLE deposit_payments;
ALTER TABLE deposit_payments_new RENAME TO deposit_payments;

CREATE INDEX IF NOT EXISTS deposit_payments_org ON deposit_payments (organization_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS deposit_payments_session ON deposit_payments (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deposit_payments_payment_intent ON deposit_payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE stripe_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  organization_id INTEGER,
  deposit_id INTEGER REFERENCES deposit_payments(id),
  payload_json TEXT NOT NULL,
  processed_ok INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  received_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_id ON stripe_webhook_events (event_id);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_org ON stripe_webhook_events (organization_id, received_at);
