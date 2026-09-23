-- Migration number: 0068    FASE 1-4 — Property Core: identificación, ubicación, superficies, distribución, características
--
-- Primera entrega del "Property Core" (megaprompt Sprint 0+1). Aditiva de
-- principio a fin: ninguna columna existente se toca, se renombra ni se
-- borra. Aplica el mismo conjunto de columnas a developer_properties
-- ("Propiedades web") y a agent_properties ("Propiedades 2ª mano") — ambas
-- comparten el mismo Property Core, así que la fase que aplica a una aplica
-- a la otra (regla explícita del megaprompt: "REGLA ABSOLUTA").
--
-- Todas las columnas nuevas son NULLable salvo `transaction_type` y
-- `location_privacy`, ambas con DEFAULT explícito que reproduce el
-- comportamiento actual (venta implícita; ubicación exacta, que es lo que ya
-- se sirve hoy) — así ninguna fila existente cambia de significado.
--
-- `reference` se backfillea de forma determinista (`'W-'||id` / `'S-'||id`,
-- únicos porque `id` lo es) para las filas existentes; las filas nuevas la
-- reciben de server/utils/adminResources.ts (buildPayload, mismo mecanismo
-- que ya genera `slug`). No se marca NOT NULL: SQLite exigiría un valor
-- constante para eso, y aquí el valor es por fila — el mismo motivo por el
-- que `slug` tampoco es NOT NULL en este proyecto.

-- ---------------------------------------------------------------------------
-- 1) developer_properties — identificación, ubicación/privacidad,
--    superficies, distribución, características
-- ---------------------------------------------------------------------------
ALTER TABLE developer_properties ADD COLUMN reference TEXT;
ALTER TABLE developer_properties ADD COLUMN external_source TEXT;
ALTER TABLE developer_properties ADD COLUMN external_reference TEXT;
ALTER TABLE developer_properties ADD COLUMN agency_reference TEXT;
-- No existía ninguna columna de operación en esta tabla — obra nueva se
-- vendía implícitamente. `transaction_type` iguala el nombre que ya usa
-- agent_properties para el mismo concepto (no se inventa un segundo nombre).
ALTER TABLE developer_properties ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE developer_properties ADD COLUMN mandate_type TEXT;
ALTER TABLE developer_properties ADD COLUMN exclusive_from TEXT;
ALTER TABLE developer_properties ADD COLUMN exclusive_until TEXT;
ALTER TABLE developer_properties ADD COLUMN capture_date TEXT;
ALTER TABLE developer_properties ADD COLUMN capture_source TEXT;

-- Privacidad de ubicación (FASE 2). `exact` reproduce el comportamiento
-- actual: hoy se sirven lat/lng reales sin ningún filtro, así que el default
-- no cambia nada hasta que alguien elija activamente ocultar una propiedad.
ALTER TABLE developer_properties ADD COLUMN location_privacy TEXT NOT NULL DEFAULT 'exact'; -- exact | approximate | hidden_number
ALTER TABLE developer_properties ADD COLUMN location_privacy_radius REAL;

-- Superficies (FASE 3). `area` (existente) ya se documenta como "built m²" —
-- se mantiene como superficie construida; el resto son nuevas y opcionales.
ALTER TABLE developer_properties ADD COLUMN usable_area REAL;
ALTER TABLE developer_properties ADD COLUMN plot_area REAL;
ALTER TABLE developer_properties ADD COLUMN terrace_area REAL;
ALTER TABLE developer_properties ADD COLUMN garden_area REAL;
ALTER TABLE developer_properties ADD COLUMN balcony_area REAL;
ALTER TABLE developer_properties ADD COLUMN storage_area REAL;

-- Distribución (FASE 3). bedrooms/bathrooms ya existían.
ALTER TABLE developer_properties ADD COLUMN toilets INTEGER;
ALTER TABLE developer_properties ADD COLUMN living_rooms INTEGER;
ALTER TABLE developer_properties ADD COLUMN kitchens INTEGER;
ALTER TABLE developer_properties ADD COLUMN garage_spaces INTEGER;

-- Características (FASE 4).
ALTER TABLE developer_properties ADD COLUMN condition TEXT; -- estado físico: new | excellent | good | to_renovate | to_reform (≠ status, que es el estado comercial)
ALTER TABLE developer_properties ADD COLUMN furnished TEXT; -- yes | no | partially — NULL = no especificado (no "no amueblado")

-- Igual que en agent_properties (migración 0067): las columnas has_elevator/
-- has_pool/has_garage/has_terrace/has_garden/pets_allowed/accessible de ESTA
-- tabla son también NOT NULL DEFAULT 0 y nunca tuvieron este parche — hoy no
-- hay forma de distinguir "no lo tiene" de "nadie lo ha revisado" en
-- developer_properties. Mismo mecanismo, misma semántica, por consistencia.
ALTER TABLE developer_properties ADD COLUMN features_reviewed_at TEXT;
ALTER TABLE developer_properties ADD COLUMN features_reviewed_by INTEGER;

UPDATE developer_properties SET reference = 'W-' || id WHERE reference IS NULL;

-- ---------------------------------------------------------------------------
-- 2) agent_properties — mismas fases (transaction_type y published_at ya
--    existen/no aplican según la tabla; ver comentarios)
-- ---------------------------------------------------------------------------
ALTER TABLE agent_properties ADD COLUMN reference TEXT;
ALTER TABLE agent_properties ADD COLUMN external_source TEXT;
ALTER TABLE agent_properties ADD COLUMN external_reference TEXT;
ALTER TABLE agent_properties ADD COLUMN agency_reference TEXT;
ALTER TABLE agent_properties ADD COLUMN mandate_type TEXT;
ALTER TABLE agent_properties ADD COLUMN exclusive_from TEXT;
ALTER TABLE agent_properties ADD COLUMN exclusive_until TEXT;
ALTER TABLE agent_properties ADD COLUMN capture_date TEXT;
ALTER TABLE agent_properties ADD COLUMN capture_source TEXT;
-- Paridad con developer_properties: esta tabla nunca tuvo estado de
-- publicación (solo status comercial available|sold). NULL = borrador,
-- reproduce que hoy ninguna fila existente se considera "publicada".
ALTER TABLE agent_properties ADD COLUMN published_at TEXT;

ALTER TABLE agent_properties ADD COLUMN location_privacy TEXT NOT NULL DEFAULT 'exact';
ALTER TABLE agent_properties ADD COLUMN location_privacy_radius REAL;

ALTER TABLE agent_properties ADD COLUMN usable_area REAL;
ALTER TABLE agent_properties ADD COLUMN plot_area REAL;
ALTER TABLE agent_properties ADD COLUMN terrace_area REAL;
ALTER TABLE agent_properties ADD COLUMN garden_area REAL;
ALTER TABLE agent_properties ADD COLUMN balcony_area REAL;
ALTER TABLE agent_properties ADD COLUMN storage_area REAL;

ALTER TABLE agent_properties ADD COLUMN toilets INTEGER;
ALTER TABLE agent_properties ADD COLUMN living_rooms INTEGER;
ALTER TABLE agent_properties ADD COLUMN kitchens INTEGER;
ALTER TABLE agent_properties ADD COLUMN garage_spaces INTEGER;

ALTER TABLE agent_properties ADD COLUMN condition TEXT;
ALTER TABLE agent_properties ADD COLUMN furnished TEXT;
-- features_reviewed_at/by ya existen en esta tabla desde la migración 0067.

UPDATE agent_properties SET reference = 'S-' || id WHERE reference IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Estancias personalizadas (PropertyRoom) — una tabla hija por cada
--    tabla de propiedad, siguiendo la misma convención que floor_plans /
--    agent_property_floor_plans ya documentada en schema.ts ("one-table-
--    per-property-type-per-child-concept"): no una tabla polimórfica nueva.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS developer_property_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  type TEXT,
  name TEXT,
  area REAL,
  floor TEXT,
  orientation TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS developer_property_rooms_parent ON developer_property_rooms (developer_property_id);

CREATE TABLE IF NOT EXISTS agent_property_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  type TEXT,
  name TEXT,
  area REAL,
  floor TEXT,
  orientation TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS agent_property_rooms_parent ON agent_property_rooms (property_id);

-- ---------------------------------------------------------------------------
-- 4) Índices para las búsquedas reales que la Fase 27 (Property Search) y el
--    routing/matching futuros necesitarán — sólo los que ya tienen un
--    consumidor conocido (filtros de ubicación por tenant, referencia).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS developer_properties_org_reference ON developer_properties (organization_id, reference);
CREATE UNIQUE INDEX IF NOT EXISTS agent_properties_org_reference ON agent_properties (organization_id, reference);
