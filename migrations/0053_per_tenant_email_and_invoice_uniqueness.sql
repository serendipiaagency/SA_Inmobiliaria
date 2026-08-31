-- Migration number: 0053    Per-tenant email uniqueness (agents/developers/team_members) and invoice numbering
--
-- DESTRUCTIVE: rebuilds 4 tables (DROP + RENAME) to relax column-level
-- UNIQUE constraints that SQLite/D1 can't ALTER directly — every row is
-- copied via INSERT...SELECT into the replacement table first (ids
-- preserved, so developer_properties.developer_id and every other plain
-- integer reference into these 4 tables by id keeps working), so no data
-- is lost. Same technique as migrations 0023/0042/0043, already proven
-- safe in this project against a table (developer_properties, in 0042)
-- that other tables reference by FK — DROP+RENAME with the same name
-- resolves the reference again once the RENAME completes.
--
-- agents.email, developers.email and team_members.email have been UNIQUE
-- on their own since migration 0001 — a global constraint across every
-- tenant sharing this D1 database. Two unrelated agencies both wanting a
-- contact with the same email (a common real name like "info@empresa.com"
-- pattern collision, or the same freelance agent working with two
-- different agencies) is a real collision now that this platform serves
-- multiple tenants: the second agency to add that email gets a hard 500
-- caused entirely by a stranger's data, and blocks legitimate onboarding.
-- Rebuilt with composite UNIQUE(organization_id, email) instead — same
-- pattern already used for slugs in migration 0042.
--
-- invoices.number has been UNIQUE globally since migration 0008, even
-- though invoices became tenant-scoped in migration 0038 — most businesses
-- number their own invoices starting from 1 ("INV-0001"), so tenant B
-- can't reuse a number tenant A already has. Rebuilt with composite
-- UNIQUE(organization_id, number).
--
-- Relaxing a UNIQUE constraint to a composite one that includes it is
-- always safe against existing data: any row set that already satisfied
-- the stricter global constraint trivially satisfies the looser per-tenant
-- one, so no pre-migration duplicate check is needed here (unlike a
-- constraint being tightened, which could reject existing data).
--
-- Also drops the now-redundant `DEFAULT 1` on organization_id in these 4
-- tables while already rebuilding them (docs/production-hardening-audit.md,
-- FASE 4 — app code has set organization_id explicitly on every insert
-- since that pass, enforced by TypeScript; this closes the same residual
-- DB-level artifact for these tables at zero extra risk, since the
-- rebuild is happening anyway).

-- --- agents --------------------------------------------------------------
CREATE TABLE agents_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  profile_image TEXT,
  license_number TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO agents_new (id, organization_id, name, email, phone, profile_image, license_number, bio, status, created_at, updated_at)
SELECT id, organization_id, name, email, phone, profile_image, license_number, bio, status, created_at, updated_at FROM agents;

DROP TABLE agents;
ALTER TABLE agents_new RENAME TO agents;

CREATE UNIQUE INDEX IF NOT EXISTS agents_org_email ON agents (organization_id, email);
CREATE INDEX IF NOT EXISTS agents_org ON agents (organization_id);

-- --- developers ------------------------------------------------------------
CREATE TABLE developers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  logo TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO developers_new (id, organization_id, name, email, phone, logo, description, status, created_at, updated_at)
SELECT id, organization_id, name, email, phone, logo, description, status, created_at, updated_at FROM developers;

DROP TABLE developers;
ALTER TABLE developers_new RENAME TO developers;

CREATE UNIQUE INDEX IF NOT EXISTS developers_org_email ON developers (organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS developers_org ON developers (organization_id);

-- --- team_members ----------------------------------------------------------
CREATE TABLE team_members_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  position TEXT NOT NULL,
  description TEXT,
  experience TEXT,
  languages TEXT,
  nid TEXT,
  specialties TEXT,
  image TEXT,
  facebook TEXT,
  twitter TEXT,
  linkedin TEXT,
  instagram TEXT,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  max_appointments_per_day INTEGER,
  ical_token TEXT,
  employee_code TEXT,
  department TEXT,
  office_name TEXT,
  manager_id INTEGER,
  hire_date TEXT,
  contract_type TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active',
  working_hours TEXT,
  zones TEXT,
  property_types TEXT,
  whatsapp TEXT,
  show_on_web INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO team_members_new (
  id, organization_id, name, slug, email, phone, position, description, experience, languages, nid, specialties,
  image, facebook, twitter, linkedin, instagram, slot_duration_minutes, buffer_minutes, max_appointments_per_day,
  ical_token, employee_code, department, office_name, manager_id, hire_date, contract_type, employment_status,
  working_hours, zones, property_types, whatsapp, show_on_web, sort_order, created_at, updated_at
)
SELECT
  id, organization_id, name, slug, email, phone, position, description, experience, languages, nid, specialties,
  image, facebook, twitter, linkedin, instagram, slot_duration_minutes, buffer_minutes, max_appointments_per_day,
  ical_token, employee_code, department, office_name, manager_id, hire_date, contract_type, employment_status,
  working_hours, zones, property_types, whatsapp, show_on_web, sort_order, created_at, updated_at
FROM team_members;

DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_slug ON team_members (organization_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_email ON team_members (organization_id, email);
CREATE INDEX IF NOT EXISTS team_members_org ON team_members (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_ical_token ON team_members (ical_token) WHERE ical_token IS NOT NULL;

-- --- invoices ----------------------------------------------------------
CREATE TABLE invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  number TEXT NOT NULL,
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

INSERT INTO invoices_new (id, organization_id, number, client_name, concept, amount, tax, status, issued_at, due_at, paid_at, created_at)
SELECT id, organization_id, number, client_name, concept, amount, tax, status, issued_at, due_at, paid_at, created_at FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number ON invoices (organization_id, number);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS invoices_org ON invoices (organization_id, status);
