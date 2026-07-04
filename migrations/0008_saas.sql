-- Migration number: 0008    SaaS CRM & operations (leads, clients, visits, reservations, invoices, automations, api keys, metrics, settings)

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 0,
  budget REAL,
  property_id INTEGER,
  property_name TEXT,
  agent_id INTEGER,
  agent_name TEXT,
  notes TEXT,
  last_contact_at TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS leads_source ON leads (source);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL DEFAULT 'buyer',
  stage TEXT NOT NULL DEFAULT 'active',
  lifetime_value REAL NOT NULL DEFAULT 0,
  deals_count INTEGER NOT NULL DEFAULT 0,
  agent_name TEXT,
  location TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS clients_type ON clients (type);
CREATE INDEX IF NOT EXISTS clients_stage ON clients (stage);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  property_id INTEGER,
  property_name TEXT,
  agent_name TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  channel TEXT NOT NULL DEFAULT 'in_person',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS visits_status ON visits (status);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL,
  client_name TEXT NOT NULL,
  property_id INTEGER,
  property_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reserved_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS reservations_status ON reservations (status);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  concept TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TEXT NOT NULL,
  due_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices (status);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  runs_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  environment TEXT NOT NULL DEFAULT 'live',
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL UNIQUE,
  visitors INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  visits_booked INTEGER NOT NULL DEFAULT 0,
  reservations INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS metrics_daily_day ON metrics_daily (day);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT ''
);
