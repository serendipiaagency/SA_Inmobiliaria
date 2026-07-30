-- Migration number: 0032    Asset Export Studio — combined multi-asset catalogs
--
-- Fase 14's remaining piece: exportación masiva (0029/export_batches) produces
-- N independent documents, one per asset. A "catálogo" is different — ONE PDF
-- with a cover page, an index, and one section per asset, assembled with
-- pdf-lib's copyPages from per-asset fragments rendered the same way batches
-- render their items (one item per request, no Queues/Durable Objects binding
-- available in this project).

CREATE TABLE asset_export_catalogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  template_id INTEGER NOT NULL REFERENCES asset_export_templates(id),
  format_key TEXT NOT NULL,
  cover_title TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  file_size_bytes INTEGER,
  error_message TEXT,
  requested_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX idx_asset_export_catalogs_org ON asset_export_catalogs(organization_id, created_at);

CREATE TABLE asset_export_catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_id INTEGER NOT NULL REFERENCES asset_export_catalogs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  page_count INTEGER,
  r2_key TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX idx_asset_export_catalog_items_catalog ON asset_export_catalog_items(catalog_id, position);
