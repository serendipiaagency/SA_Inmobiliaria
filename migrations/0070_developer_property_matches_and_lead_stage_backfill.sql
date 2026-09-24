-- Migration number: 0070    Cierra lo que 0069 no pudo dejar aplicado en producción
--
-- 0069_lead_pipeline_matching_developer_properties.sql falló a medias en
-- producción: casi todas sus columnas de `leads` ya existían, aplicadas el
-- 2026-09-22 por dos ficheros (`0068_lead_pipeline.sql`,
-- `0069_contact_merge.sql`) de un intento anterior de esta misma sesión que
-- nunca llegó a comitearse a git — no existen en el historial de este
-- repositorio. D1 aplica cada fichero de migración como una transacción: al
-- chocar con `source_detail` ya existente, TODO el fichero 0069 se revirtió.
-- Diagnosticado contra la D1 real (PRAGMA table_info + sqlite_master, no
-- adivinado) con .github/workflows/d1-inspect.yml, y 0069 se marcó como
-- aplicada en d1_migrations sin ejecutar su SQL (su esquema ya existe por el
-- otro camino) — ver .github/workflows/d1-mark-migration-applied.yml.
--
-- Esta migración aditiva añade backfill de `leads.stage` (existía pero sin
-- rellenar) y la tabla `developer_property_matches` (confirmado ausente).
-- No repite `source_detail`/`campaign`/`utm_*`/`portal`/`landing_page`/
-- `referrer`/`original_message`/`priority`/`first_response_at`/
-- `next_action_at`/`lost_reason` (ya existen) ni `lead_stage_history` (ya
-- existe, con forma ligeramente distinta — ver nota en
-- docs/matching-and-lead-pipeline.md). En una base de datos nueva (local/CI/
-- staging), 0069 ya crea todo esto: el backfill es idempotente (sólo toca
-- filas con stage NULL) y developer_property_matches usa IF NOT EXISTS, así
-- que esta migración es igual de segura justo después de una 0069 que sí
-- tuvo éxito.
--
-- `leads.whatsapp` NO va aquí a propósito: 0069 ya la crea en cualquier base
-- de datos nueva, así que repetirla en un fichero de migración numerado
-- rompería local/CI/staging con el mismo "columna duplicada" que tuvo
-- producción. Producción es la única que la necesita —por el mismo motivo
-- que ya no pudo terminar de aplicar 0069— y se añade aparte, una sola vez,
-- fuera de la secuencia numerada (ver el commit que acompaña a esta
-- migración).
UPDATE leads SET stage = 'contacted' WHERE stage IS NULL AND status = 'contacted';
UPDATE leads SET stage = 'qualified' WHERE stage IS NULL AND status = 'qualified';
UPDATE leads SET stage = 'offer' WHERE stage IS NULL AND status = 'proposal';
UPDATE leads SET stage = 'won' WHERE stage IS NULL AND status = 'won';
UPDATE leads SET stage = 'new' WHERE stage IS NULL;

CREATE TABLE IF NOT EXISTS developer_property_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  buyer_requirement_id INTEGER NOT NULL REFERENCES buyer_requirements(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  score INTEGER,
  eligibility TEXT NOT NULL DEFAULT 'eligible',
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'new',
  discarded_reason TEXT,
  breakdown_json TEXT,
  rules_version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS developer_property_matches_pair ON developer_property_matches (buyer_requirement_id, property_id);
CREATE INDEX IF NOT EXISTS developer_property_matches_org_status ON developer_property_matches (organization_id, status);
CREATE INDEX IF NOT EXISTS developer_property_matches_org_property ON developer_property_matches (organization_id, property_id);
CREATE INDEX IF NOT EXISTS developer_property_matches_org_contact ON developer_property_matches (organization_id, contact_id);
