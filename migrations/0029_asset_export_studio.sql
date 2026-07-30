-- Migration number: 0029    Asset Export Studio — data model (Fase 2)
--
-- New module: generates PDFs, print pieces and social images from a
-- developer/agent property's real data + the tenant's Brand Kit. Follows the
-- Publication Scheduler's convention of a normalized shell (org, status,
-- foreign keys) around a JSON blob for the actual structured content
-- (structure_json holds pages/elements — see server/utils/assetExport/types.ts).
-- No binary files live in D1; renders are R2 objects, this table only stores
-- the r2_key reference. Every business table carries organization_id.

CREATE TABLE brand_kits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL UNIQUE,
  logo TEXT,
  logo_alt TEXT,
  logo_light TEXT,
  logo_dark TEXT,
  isotype TEXT,
  favicon TEXT,
  color_primary TEXT,
  color_secondary TEXT,
  color_accents_json TEXT NOT NULL DEFAULT '[]',
  color_background TEXT,
  color_text TEXT,
  font_heading TEXT,
  font_body TEXT,
  font_alt TEXT,
  button_style TEXT,
  icon_style TEXT,
  card_style TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  website TEXT,
  social_links_json TEXT NOT NULL DEFAULT '{}',
  legal_text TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX brand_kits_org ON brand_kits (organization_id);

CREATE TABLE brand_kit_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_kit_id INTEGER NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  edited_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX brand_kit_versions_kit ON brand_kit_versions (brand_kit_id, created_at);

-- organization_id NULL = a system template (built by us, shipped to every
-- tenant, read-only — enforced in the API layer, not just the UI). Tenants
-- duplicate a system template to get their own editable copy.
CREATE TABLE asset_export_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'modern',
  format_key TEXT NOT NULL,
  asset_type_scope TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  structure_json TEXT NOT NULL DEFAULT '{"pages":[]}',
  duplicated_from_id INTEGER REFERENCES asset_export_templates(id),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX asset_export_templates_org ON asset_export_templates (organization_id);
CREATE INDEX asset_export_templates_format ON asset_export_templates (format_key);

CREATE TABLE asset_export_template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES asset_export_templates(id) ON DELETE CASCADE,
  structure_json TEXT NOT NULL,
  edited_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX asset_export_template_versions_template ON asset_export_template_versions (template_id, created_at);

-- One row per piece being designed for one asset (a "project" in the
-- editor). asset_kind + asset_id point at developer_properties or
-- agent_properties — two separate flat tables today (see audit), so this
-- can't be a single FK.
CREATE TABLE asset_export_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  template_id INTEGER REFERENCES asset_export_templates(id),
  asset_kind TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  format_key TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  status TEXT NOT NULL DEFAULT 'draft',
  structure_json TEXT NOT NULL DEFAULT '{"pages":[]}',
  lock_mode TEXT NOT NULL DEFAULT 'live',
  price_at_creation REAL,
  created_by INTEGER,
  approved_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX asset_export_projects_org ON asset_export_projects (organization_id);
CREATE INDEX asset_export_projects_asset ON asset_export_projects (asset_kind, asset_id);

CREATE TABLE asset_export_project_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES asset_export_projects(id) ON DELETE CASCADE,
  structure_json TEXT NOT NULL,
  status TEXT NOT NULL,
  edited_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX asset_export_project_versions_project ON asset_export_project_versions (project_id, created_at);

CREATE TABLE asset_export_renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES asset_export_projects(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL,
  format_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  r2_key TEXT,
  file_size_bytes INTEGER,
  error_message TEXT,
  requested_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX asset_export_renders_org ON asset_export_renders (organization_id, created_at);
CREATE INDEX asset_export_renders_project ON asset_export_renders (project_id);

-- Dynamic QR: the QR image always encodes a stable short URL of ours
-- (/q/{code}), never the destination directly, so the destination can change
-- without reprinting anything.
CREATE TABLE dynamic_qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  destination_type TEXT NOT NULL DEFAULT 'custom',
  asset_kind TEXT,
  asset_id INTEGER,
  label TEXT,
  utm_json TEXT NOT NULL DEFAULT '{}',
  style_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  scan_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX dynamic_qr_codes_org ON dynamic_qr_codes (organization_id);
CREATE UNIQUE INDEX dynamic_qr_codes_code ON dynamic_qr_codes (code);

-- No IP-based geolocation service is wired up (would need an external
-- provider/credential) — ip_hash is stored for abuse/dedup purposes only,
-- never a raw IP, and no country/city column exists so nothing here can be
-- misread as real geo data that was never actually looked up.
CREATE TABLE qr_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code_id INTEGER NOT NULL REFERENCES dynamic_qr_codes(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT '',
  user_agent TEXT,
  referer TEXT,
  ip_hash TEXT
);
CREATE INDEX qr_scans_qr ON qr_scans (qr_code_id, scanned_at);
CREATE INDEX qr_scans_org ON qr_scans (organization_id, scanned_at);

CREATE TABLE export_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  requested_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX export_batches_org ON export_batches (organization_id, created_at);

CREATE TABLE export_batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
  asset_kind TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  template_id INTEGER REFERENCES asset_export_templates(id),
  format_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  render_id INTEGER REFERENCES asset_export_renders(id),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX export_batch_items_batch ON export_batch_items (batch_id);
