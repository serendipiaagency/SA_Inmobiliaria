-- Migration number: 0044    Transactional email: per-org sender config, real delivery tracking, retry queue, password reset
--
-- Four additions:
--
-- 1. organizations gets its own email identity — sender name/address, reply-to,
--    internal recipients (staff notified on new leads/contact/complaints),
--    locale, and whether the sender's domain has been checked as verified in
--    Resend. All nullable/defaulted: an org with none of this set falls back
--    to the platform defaults already used by server/utils/email.ts.
--
-- 2. email_log: one row per send attempt. status is never 'delivered' except
--    when the Resend webhook confirms it (server/api/resend/webhook.post.ts)
--    — see server/utils/email/send.ts. Doubles as the retry queue: a failed
--    attempt stays 'queued' with next_retry_at set, until attempts exhausts
--    max_attempts and it becomes permanently 'failed'.
--
-- 3. resend_webhook_events: idempotency for Resend's webhook deliveries
--    (Svix event ids), same claim-then-process pattern as
--    stripe_webhook_events (0043).
--
-- 4. password_reset_tokens: the "recuperación de contraseña" email needs a
--    real reset flow, which didn't exist before this migration. Only the
--    token's SHA-256 hash is stored, never the raw token — same principle as
--    api_keys.

ALTER TABLE organizations ADD COLUMN email_sender_name TEXT;
ALTER TABLE organizations ADD COLUMN email_sender_address TEXT;
ALTER TABLE organizations ADD COLUMN email_sender_domain_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN email_sender_domain_checked_at TEXT;
ALTER TABLE organizations ADD COLUMN email_reply_to TEXT;
ALTER TABLE organizations ADD COLUMN email_internal_recipients_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE organizations ADD COLUMN email_locale TEXT NOT NULL DEFAULT 'es';

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  template TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transactional', -- transactional | commercial
  recipient TEXT NOT NULL,
  from_header TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT NOT NULL,
  -- The exact rendered HTML that was (or will be) sent — not just metadata.
  -- Without this, a retry after a transient failure would have nothing to
  -- actually resend; this way the queue is self-contained and a row also
  -- doubles as a real audit trail of what a recipient received.
  html TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es',
  provider TEXT NOT NULL DEFAULT 'resend',
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sent | delivered | bounced | complained | failed
  external_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  error_message TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  bounced_at TEXT,
  complained_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS email_log_org ON email_log (organization_id, created_at);
CREATE INDEX IF NOT EXISTS email_log_retry ON email_log (status, next_retry_at);
CREATE INDEX IF NOT EXISTS email_log_external_id ON email_log (external_id) WHERE external_id IS NOT NULL;

CREATE TABLE resend_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  svix_id TEXT NOT NULL,
  type TEXT NOT NULL,
  email_log_id INTEGER REFERENCES email_log(id),
  organization_id INTEGER,
  payload_json TEXT NOT NULL,
  processed_ok INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  received_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS resend_webhook_events_svix_id ON resend_webhook_events (svix_id);
CREATE INDEX IF NOT EXISTS resend_webhook_events_org ON resend_webhook_events (organization_id, received_at);

CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_id, expires_at);
