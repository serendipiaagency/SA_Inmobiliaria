-- 10 novedades: contratos, referidos, alertas de búsqueda, operaciones
-- cerradas (ingresos + comisiones), tasador (AVM), portal del cliente,
-- depósito Stripe, webhooks salientes, RGPD.

-- 1. Contratos ------------------------------------------------------------
CREATE TABLE contract_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reserva', -- reserva | arras | alquiler | compraventa
  body_template TEXT NOT NULL DEFAULT '', -- plain text with {{token}} bindings, paragraphs separated by blank lines
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX contract_templates_org ON contract_templates (organization_id);

CREATE TABLE contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  template_id INTEGER REFERENCES contract_templates(id),
  title TEXT NOT NULL,
  asset_kind TEXT,
  asset_id INTEGER,
  client_name TEXT NOT NULL,
  client_email TEXT,
  body_text TEXT NOT NULL, -- resolved (bindings already applied) at creation time
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | accepted | void
  management_token TEXT,
  accepted_by_name TEXT,
  accepted_ip TEXT,
  accepted_user_agent TEXT,
  accepted_at TEXT,
  r2_key TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX contracts_org ON contracts (organization_id, created_at);
CREATE UNIQUE INDEX contracts_management_token ON contracts (management_token) WHERE management_token IS NOT NULL;

-- 2. Referidos -------------------------------------------------------------
CREATE TABLE referral_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  referrer_type TEXT NOT NULL DEFAULT 'client', -- client | agent
  referrer_name TEXT NOT NULL,
  referrer_email TEXT,
  reward_type TEXT NOT NULL DEFAULT 'cash', -- cash | discount | commission
  reward_amount REAL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX referral_links_code ON referral_links (code);
CREATE INDEX referral_links_org ON referral_links (organization_id);

CREATE TABLE referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  referral_link_id INTEGER NOT NULL REFERENCES referral_links(id) ON DELETE CASCADE,
  referee_name TEXT NOT NULL,
  referee_email TEXT,
  referee_phone TEXT,
  lead_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | converted | rewarded | expired
  converted_at TEXT,
  rewarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX referrals_org ON referrals (organization_id, status);
CREATE INDEX referrals_link ON referrals (referral_link_id);

-- 3. Alertas de búsqueda guardadas ----------------------------------------
CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  unsubscribe_token TEXT NOT NULL,
  last_notified_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX saved_searches_org ON saved_searches (organization_id, active);
CREATE UNIQUE INDEX saved_searches_unsubscribe_token ON saved_searches (unsubscribe_token);

-- 4/6. Operaciones cerradas (ingresos + comisiones) -----------------------
CREATE TABLE deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER,
  client_name TEXT NOT NULL,
  property_id INTEGER,
  property_name TEXT,
  agent_id INTEGER,
  agent_name TEXT,
  deal_type TEXT NOT NULL DEFAULT 'sale', -- sale | rental
  deal_value REAL NOT NULL,
  commission_rate REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  commission_paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  closed_at TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX deals_org ON deals (organization_id, closed_at);
CREATE INDEX deals_agent ON deals (agent_id);

-- 5. Tasador automático (AVM) ----------------------------------------------
CREATE TABLE valuations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_type TEXT,
  community TEXT,
  area REAL NOT NULL,
  bedrooms INTEGER,
  estimated_low REAL,
  estimated_avg REAL,
  estimated_high REAL,
  price_per_sqm_avg REAL,
  comparables_json TEXT NOT NULL DEFAULT '[]',
  requested_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX valuations_org ON valuations (organization_id, created_at);

-- 8. Depósito Stripe --------------------------------------------------------
CREATE TABLE deposit_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contract_id INTEGER REFERENCES contracts(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | not_connected | processing | paid | failed
  stripe_payment_intent_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  paid_at TEXT
);
CREATE INDEX deposit_payments_org ON deposit_payments (organization_id, created_at);

-- 9. Webhooks salientes ------------------------------------------------------
CREATE TABLE webhook_endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]', -- e.g. ["lead.created","deal.closed","visit.booked"]
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX webhook_endpoints_org ON webhook_endpoints (organization_id, active);

CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  response_code INTEGER,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  delivered_at TEXT
);
CREATE INDEX webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at);

-- 10. RGPD ------------------------------------------------------------------
CREATE TABLE gdpr_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  request_type TEXT NOT NULL, -- export | delete
  subject_email TEXT NOT NULL,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  requested_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX gdpr_requests_org ON gdpr_requests (organization_id, created_at);
