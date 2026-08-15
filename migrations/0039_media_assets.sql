-- Migration number: 0039    Media Asset Manager multitenant (bloque P0 de media)
--
-- Hasta ahora el bucket R2 no tenía metadatos: la única información sobre un
-- objeto era su propia clave. Eso obligaba a autorizar por prefijo de ruta —
-- exactamente lo que un atacante controla— y dejaba sin respuesta preguntas
-- básicas: de quién es este fichero, qué contiene, cuánto ocupa, quién lo
-- subió, se puede borrar.
--
-- `media_assets` pasa a ser la fuente de verdad de la autorización de media.
-- La clave R2 deja de ser una credencial y vuelve a ser lo que debe ser: una
-- dirección de almacenamiento.

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  -- Única: dos filas no pueden reclamar el mismo objeto, así que la propiedad
  -- de una clave nunca es ambigua.
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 en hex del contenido real. NULL en las filas rellenadas por esta
  -- migración: no tenemos los bytes aquí y no vamos a inventar un valor.
  checksum TEXT,
  -- public | private | confidential
  visibility TEXT NOT NULL DEFAULT 'private',
  -- property-photo | logo | blog-image | kyc-document | contract | export | catalog | upload
  category TEXT NOT NULL DEFAULT 'upload',
  -- A qué fila pertenece el fichero (developer_properties, contracts, …).
  entity_type TEXT,
  entity_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  -- Ciclo de vida de borrado: primero se marca aquí, el objeto R2 sigue vivo
  -- durante el periodo de gracia, y el cron de purga lo elimina de verdad.
  deleted_at TEXT,
  purged_at TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS media_assets_org ON media_assets (organization_id, created_at);
CREATE INDEX IF NOT EXISTS media_assets_visibility ON media_assets (visibility);
CREATE INDEX IF NOT EXISTS media_assets_entity ON media_assets (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS media_assets_checksum ON media_assets (organization_id, checksum);
-- El cron de purga barre por aquí: marcados como borrados y aún no purgados.
CREATE INDEX IF NOT EXISTS media_assets_purge ON media_assets (deleted_at, purged_at);

-- --------------------------------------------------------------------------
-- Registro de acceso a media confidencial (Fase 5)
-- --------------------------------------------------------------------------
-- Un documento KYC —pasaporte, DNI, extracto bancario— no se sirve sin dejar
-- constancia de quién lo miró. Tabla propia y no `admin_audit_log`: aquí se
-- escribe en cada LECTURA, no en cada escritura, así que su volumen y su
-- retención son de otro orden.

CREATE TABLE IF NOT EXISTS media_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER,
  user_email TEXT,
  media_asset_id INTEGER,
  r2_key TEXT NOT NULL,
  action TEXT NOT NULL, -- download | denied
  visibility TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS media_access_log_org ON media_access_log (organization_id, created_at);
CREATE INDEX IF NOT EXISTS media_access_log_asset ON media_access_log (media_asset_id, created_at);

-- --------------------------------------------------------------------------
-- Cuota de almacenamiento por inquilino (Fase 8)
-- --------------------------------------------------------------------------
-- Aditivo con DEFAULT, como el resto de columnas añadidas desde 0021: D1 no
-- admite ALTER TABLE ADD COLUMN NOT NULL sin valor por defecto sobre una tabla
-- con filas. El límite por defecto (5 GiB) es deliberadamente holgado: esto
-- existe para frenar un abuso o un bucle, no para vender planes.

ALTER TABLE organizations ADD COLUMN storage_bytes_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN storage_bytes_limit INTEGER NOT NULL DEFAULT 5368709120;

-- --------------------------------------------------------------------------
-- Backfill: registrar los objetos privados que YA existen
-- --------------------------------------------------------------------------
-- Sin esto, cada fichero privado subido antes de esta migración quedaría sin
-- fila y, por tanto, inaccesible en cuanto la autorización deje de mirar el
-- prefijo. `size_bytes` queda a 0 y `checksum` a NULL porque aquí no tenemos
-- los bytes: son valores desconocidos, no ceros reales, y el reconciliador de
-- uso de almacenamiento los trata como tales.

-- KYC de visitantes (confidential) — seis columnas, una fila por documento.
INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, passport_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"passport_pdf"}'
FROM visitor_submissions WHERE passport_pdf IS NOT NULL AND passport_pdf <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, emirates_id_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"emirates_id_pdf"}'
FROM visitor_submissions WHERE emirates_id_pdf IS NOT NULL AND emirates_id_pdf <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, bank_statement_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"bank_statement_pdf"}'
FROM visitor_submissions WHERE bank_statement_pdf IS NOT NULL AND bank_statement_pdf <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, trade_license_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"trade_license_pdf"}'
FROM visitor_submissions WHERE trade_license_pdf IS NOT NULL AND trade_license_pdf <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, vat_registration_certificate_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"vat_registration_certificate_pdf"}'
FROM visitor_submissions WHERE vat_registration_certificate_pdf IS NOT NULL AND vat_registration_certificate_pdf <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, etihad_credit_bureau_pdf, 'application/pdf', 'pdf', 'confidential', 'kyc-document', 'visitor_submissions', id, created_at, created_at, '{"backfilled":true,"field":"etihad_credit_bureau_pdf"}'
FROM visitor_submissions WHERE etihad_credit_bureau_pdf IS NOT NULL AND etihad_credit_bureau_pdf <> '';

-- Contratos firmados (confidential: llevan nombre, DNI, IP y sello de firma).
INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, r2_key, 'application/pdf', 'pdf', 'confidential', 'contract', 'contracts', id, created_at, updated_at, '{"backfilled":true}'
FROM contracts WHERE r2_key IS NOT NULL AND r2_key <> '';

-- Exports del Asset Export Studio (private).
INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, size_bytes, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, r2_key, 'application/pdf', 'pdf', coalesce(file_size_bytes, 0), 'private', 'export', 'asset_export_renders', id, created_at, created_at, '{"backfilled":true}'
FROM asset_export_renders WHERE r2_key IS NOT NULL AND r2_key <> '';

-- Catálogos combinados y sus fragmentos por activo (private).
INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, size_bytes, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT organization_id, r2_key, 'application/pdf', 'pdf', coalesce(file_size_bytes, 0), 'private', 'catalog', 'asset_export_catalogs', id, created_at, created_at, '{"backfilled":true}'
FROM asset_export_catalogs WHERE r2_key IS NOT NULL AND r2_key <> '';

INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, mime_type, extension, visibility, category, entity_type, entity_id, created_at, updated_at, metadata)
SELECT c.organization_id, i.r2_key, 'application/pdf', 'pdf', 'private', 'catalog', 'asset_export_catalog_items', i.id, i.created_at, i.created_at, '{"backfilled":true,"fragment":true}'
FROM asset_export_catalog_items i
JOIN asset_export_catalogs c ON c.id = i.catalog_id
WHERE i.r2_key IS NOT NULL AND i.r2_key <> '';

-- Media Library del blog (public: se embebe en artículos publicados).
INSERT OR IGNORE INTO media_assets
  (organization_id, r2_key, original_filename, mime_type, extension, size_bytes, visibility, category, entity_type, entity_id, created_at, updated_at, deleted_at, metadata)
SELECT
  organization_id,
  replace(url, '/api/media/', ''),
  filename,
  CASE type WHEN 'pdf' THEN 'application/pdf' WHEN 'svg' THEN 'image/svg+xml' ELSE 'image/jpeg' END,
  CASE type WHEN 'pdf' THEN 'pdf' WHEN 'svg' THEN 'svg' ELSE 'jpg' END,
  coalesce(size_bytes, 0),
  'public',
  'blog-image',
  'cms_media',
  id,
  created_at,
  created_at,
  deleted_at,
  '{"backfilled":true}'
FROM cms_media WHERE url LIKE '/api/media/%';

-- Uso de almacenamiento inicial por inquilino, a partir de lo que sí conocemos.
UPDATE organizations
SET storage_bytes_used = coalesce(
  (SELECT sum(size_bytes) FROM media_assets WHERE media_assets.organization_id = organizations.id AND deleted_at IS NULL),
  0
);
