-- Migration number: 0021    Multi-tenant foundations ("empresas")
--
-- Converts the single-tenant schema into a shared-database multi-tenant one:
-- one `organizations` row per client company, and an `organization_id` column
-- on every catalog/CRM/content table (added via ALTER TABLE, so it's purely
-- additive — no existing row or query breaks). Billing (`invoices`) stays
-- global by explicit decision; `metrics_daily` and `settings` are deferred to
-- a documented follow-up (see server/db/schema.ts comments).
--
-- D1/SQLite can't add a NOT NULL column without a DEFAULT on a populated
-- table, and can't add a FK via ALTER at all — so `organization_id` is
-- app-level only here, backfilled to org id=1 ("M&M Real Estate"), the
-- pre-existing tenant. `users.organization_id` is the one nullable exception:
-- NULL marks the new 'super_admin' role, which belongs to no single org.

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT UNIQUE,
  company_name TEXT,
  logo TEXT,
  brand_color TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO organizations (id, name, slug, company_name, status, created_at, updated_at)
VALUES (1, 'M&M Real Estate', 'mm-real-estate', 'M&M Real Estate', 'active', datetime('now'), datetime('now'));

-- users: nullable — NULL organization_id + role='super_admin' means "sees every org"
ALTER TABLE users ADD COLUMN organization_id INTEGER;
UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE users SET organization_id = NULL, role = 'super_admin' WHERE email = 'admin@sa-inmobiliaria.com';

-- Catalog
ALTER TABLE agents ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_properties ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE developers ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE developer_properties ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE locations ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE amenities ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE communities ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE master_plans ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE blogs ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE team_members ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;

-- Forms
ALTER TABLE information ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE visitor_submissions ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contact_messages ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;

-- CRM
ALTER TABLE leads ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clients ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE visits ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reservations ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE automations ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE api_keys ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;

-- Every tenant-scoped query filters by organization_id, so it needs an index.
CREATE INDEX IF NOT EXISTS agents_org ON agents (organization_id);
CREATE INDEX IF NOT EXISTS agent_properties_org ON agent_properties (organization_id);
CREATE INDEX IF NOT EXISTS developers_org ON developers (organization_id);
CREATE INDEX IF NOT EXISTS developer_properties_org ON developer_properties (organization_id);
CREATE INDEX IF NOT EXISTS locations_org ON locations (organization_id);
CREATE INDEX IF NOT EXISTS amenities_org ON amenities (organization_id);
CREATE INDEX IF NOT EXISTS communities_org ON communities (organization_id);
CREATE INDEX IF NOT EXISTS master_plans_org ON master_plans (organization_id);
CREATE INDEX IF NOT EXISTS blogs_org ON blogs (organization_id);
CREATE INDEX IF NOT EXISTS team_members_org ON team_members (organization_id);
CREATE INDEX IF NOT EXISTS information_org ON information (organization_id);
CREATE INDEX IF NOT EXISTS visitor_submissions_org ON visitor_submissions (organization_id);
CREATE INDEX IF NOT EXISTS contact_messages_org ON contact_messages (organization_id);
CREATE INDEX IF NOT EXISTS leads_org ON leads (organization_id);
CREATE INDEX IF NOT EXISTS clients_org ON clients (organization_id);
CREATE INDEX IF NOT EXISTS visits_org ON visits (organization_id);
CREATE INDEX IF NOT EXISTS reservations_org ON reservations (organization_id);
CREATE INDEX IF NOT EXISTS automations_org ON automations (organization_id);
CREATE INDEX IF NOT EXISTS api_keys_org ON api_keys (organization_id);
CREATE INDEX IF NOT EXISTS users_org ON users (organization_id);
