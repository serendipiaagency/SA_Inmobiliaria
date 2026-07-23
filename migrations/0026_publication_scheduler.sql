-- Migration number: 0026    Publication Scheduler module (Fase 1-2: arquitectura + modelo de datos)
--
-- Fully decoupled module — no table here has a hard dependency on any other
-- feature besides developer_properties (the property being published) and
-- organizations/users (multi-tenant + audit). Every table is org-scoped.
--
-- Channel adapters (Idealista, Fotocasa, Facebook, WhatsApp, etc.) have no
-- real API credentials configured anywhere in this project yet — the engine
-- built on top of this schema is real end-to-end, but every channel starts
-- honestly "not connected" (publication_executions.connected = 0) until real
-- secrets are added, same pattern as AI_API_KEY in server/utils/ai.ts.

-- Per-org, per-channel configuration (Fase 3)
CREATE TABLE IF NOT EXISTS publication_channel_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  window_start TEXT,
  window_end TEXT,
  default_priority TEXT NOT NULL DEFAULT 'normal',
  default_delay_seconds INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_backoff_seconds INTEGER NOT NULL DEFAULT 300,
  max_duration_seconds INTEGER NOT NULL DEFAULT 120,
  depends_on_channel_keys TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS publication_channel_configs_org_channel ON publication_channel_configs (organization_id, channel_key);

-- Reusable staged-launch templates (Fase 9)
CREATE TABLE IF NOT EXISTS publication_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  steps_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_templates_org ON publication_templates (organization_id);

-- One row per "programación" of a property across channels (Fase 4)
CREATE TABLE IF NOT EXISTS publication_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES publication_templates(id) ON DELETE SET NULL,
  name TEXT,
  base_scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_schedules_org_status ON publication_schedules (organization_id, status);
CREATE INDEX IF NOT EXISTS publication_schedules_property ON publication_schedules (developer_property_id);

-- One row per channel-step within a schedule — the real unit of work (Fase 5, 7, 8)
CREATE TABLE IF NOT EXISTS publication_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  schedule_id INTEGER NOT NULL REFERENCES publication_schedules(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL,
  run_at TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  priority_weight INTEGER NOT NULL DEFAULT 50,
  depends_on_job_id INTEGER REFERENCES publication_jobs(id) ON DELETE SET NULL,
  condition_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  action TEXT NOT NULL DEFAULT 'publish',
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_count INTEGER NOT NULL DEFAULT 0,
  retry_backoff_seconds INTEGER NOT NULL DEFAULT 300,
  max_duration_seconds INTEGER NOT NULL DEFAULT 120,
  external_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_jobs_dispatch ON publication_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS publication_jobs_schedule ON publication_jobs (schedule_id);
CREATE INDEX IF NOT EXISTS publication_jobs_org ON publication_jobs (organization_id);

-- Dispatch ticket per due job — claimed by the cron dispatcher to avoid double-execution (Fase 7)
CREATE TABLE IF NOT EXISTS publication_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES publication_jobs(id) ON DELETE CASCADE,
  claimed_at TEXT,
  claimed_by TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_queue_job ON publication_queue (job_id);
CREATE INDEX IF NOT EXISTS publication_queue_unclaimed ON publication_queue (claimed_at);

-- One row per actual attempt at running a job (Fase 12)
CREATE TABLE IF NOT EXISTS publication_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES publication_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result TEXT,
  connected INTEGER NOT NULL DEFAULT 0,
  response_summary TEXT,
  error_message TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS publication_executions_job ON publication_executions (job_id);

-- One row per retry scheduled for a job (Fase 12)
CREATE TABLE IF NOT EXISTS publication_retries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES publication_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,
  backoff_seconds INTEGER NOT NULL,
  executed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_retries_job ON publication_retries (job_id);

-- Human-readable timeline of events per schedule — powers Fase 15
CREATE TABLE IF NOT EXISTS publication_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  schedule_id INTEGER NOT NULL REFERENCES publication_schedules(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES publication_jobs(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_history_schedule ON publication_history (schedule_id, created_at);

-- Low-level structured log lines — QA/debugging + audit trail (Fase 17)
CREATE TABLE IF NOT EXISTS publication_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  job_id INTEGER REFERENCES publication_jobs(id) ON DELETE SET NULL,
  schedule_id INTEGER REFERENCES publication_schedules(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES users(id),
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_logs_org_created ON publication_logs (organization_id, created_at);

-- Automation rules reacting to property changes (Fase 11)
CREATE TABLE IF NOT EXISTS publication_automation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_automation_rules_org ON publication_automation_rules (organization_id);

-- Internal notification feed (Fase 13) — email/whatsapp/telegram/slack columns exist for when
-- real credentials are added; `delivered` stays honestly 0 for any channel that isn't wired yet.
CREATE TABLE IF NOT EXISTS publication_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id),
  schedule_id INTEGER REFERENCES publication_schedules(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES publication_jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'internal',
  delivered INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS publication_notifications_org_read ON publication_notifications (organization_id, read_at);

-- AI recommended-time suggestions (mejora adicional) — computed from real historical
-- publication_executions, one row per (org, channel, property_type) recommendation.
CREATE TABLE IF NOT EXISTS publication_ai_time_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  property_type TEXT NOT NULL,
  suggested_hour INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS publication_ai_time_suggestions_key ON publication_ai_time_suggestions (organization_id, channel_key, property_type);

-- Per-org opt-in to auto-apply the AI-recommended time instead of just suggesting it
CREATE TABLE IF NOT EXISTS publication_ai_time_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL UNIQUE,
  auto_apply INTEGER NOT NULL DEFAULT 0,
  min_confidence REAL NOT NULL DEFAULT 0.6,
  min_sample_size INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
