-- Migration number: 0084    FASE 31 — Domain Tools API: traza de herramientas + selecciones de propiedades
--
-- Sólo añade tablas nuevas; no toca ninguna existente. Llega a producción
-- ANTES que el código que las usa (Workers Builds publica cualquier push de
-- rama, y las migraciones sólo las aplica el pipeline tras el merge).

-- Traza de cada llamada a una Domain Tool (§47/§51/§140): qué herramienta,
-- quién, si pasó la autorización, resultado o error tipado, entidad
-- afectada y latencia. NO guarda el prompt ni el input completo (PII): sólo
-- referencias. `result_json` sólo se rellena en herramientas de escritura
-- con clave de idempotencia (§48), para devolver el mismo resultado si se
-- repite la llamada sin volver a ejecutarla.
CREATE TABLE IF NOT EXISTS domain_tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER,
  tool TEXT NOT NULL,
  kind TEXT NOT NULL, -- read | write
  source TEXT NOT NULL DEFAULT 'api', -- api | inmo
  status TEXT NOT NULL, -- ok | error
  error_code TEXT,
  target_type TEXT,
  target_id INTEGER,
  idempotency_key TEXT,
  result_json TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS domain_tool_calls_org ON domain_tool_calls (organization_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS domain_tool_calls_idempotency ON domain_tool_calls (organization_id, tool, idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'ok';

-- Selección persistente de propiedades para una persona (§44-45). Auditado:
-- nada existente representa este concepto — `favorites` es del visitante
-- web, `asset_export_catalogs` son PDFs sin persona, `property_matches` va
-- ligado a una necesidad concreta y a su estado comercial, `property_tours`
-- son visitas encadenadas. Una selección es «estas propiedades, para esta
-- persona», con su orden y una nota por propiedad; de los dos catálogos.
CREATE TABLE IF NOT EXISTS property_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  lead_id INTEGER,
  buyer_requirement_id INTEGER,
  title TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS property_selections_contact ON property_selections (organization_id, contact_id);

CREATE TABLE IF NOT EXISTS property_selection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  selection_id INTEGER NOT NULL REFERENCES property_selections(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL, -- agent | developer
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS property_selection_items_unique ON property_selection_items (selection_id, property_kind, property_id);
