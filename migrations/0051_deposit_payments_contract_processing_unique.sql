-- Migration number: 0051    One open (processing) Stripe deposit checkout per contract at a time
--
-- server/api/admin/saas/deposits.post.ts calls createDepositCheckout()
-- (a real Stripe API call) and then INSERT INTO deposit_payments as two
-- independent steps, no transaction or data-level restriction — a
-- double-click or a client retry after a timeout can create two live
-- Stripe Checkout sessions and two deposit_payments rows for the same
-- contract, even though the client only owes one deposit
-- (docs/production-hardening-audit.md, idempotency-of-critical-ops pass).
--
-- Scoped to status = 'processing' only (an active session actually awaiting
-- payment, applyStripeEvent() in server/utils/stripe.ts moves it to
-- paid/failed/refunded once Stripe resolves it) — not 'not_connected' or
-- 'failed', which represent no money in flight and must stay retryable.
-- Purely additive (CREATE INDEX, no DROP/RENAME/rebuild); if a contract
-- somehow already had two simultaneously-processing deposits in
-- production, this migration would fail atomically before touching the
-- Worker rather than corrupt data silently — not verified against the
-- real production D1 from this environment (no Cloudflare credentials
-- available here).

CREATE UNIQUE INDEX IF NOT EXISTS deposit_payments_contract_processing
  ON deposit_payments (contract_id)
  WHERE status = 'processing';
