-- Migration number: 0080    FASE 27 (incremento 2) — Saved Filter / Saved View / Shared View
--
-- Una sola tabla para las tres entidades del encargo (§73-76), no tres
-- paralelas: un "Saved Filter" es simplemente una fila con kind='filter' y
-- columns_json/density en NULL (hereda las columnas y densidad por defecto
-- del listado); un "Saved View" es kind='view' con esos dos campos
-- rellenos. "Shared View" no es una cuarta tabla ni una relación de
-- permisos aparte: es `visibility='shared'` sobre la misma fila — el
-- listado ya filtra por organización y por la RBAC del recurso subyacente
-- (`properties`/`developer-properties`) en el momento en que alguien la
-- aplica, así que los permisos se evalúan en ejecución para quien la usa,
-- nunca se congelan desde quien la creó (§75-76, §153) — no hace falta
-- ningún mecanismo adicional para eso, es una consecuencia de guardar sólo
-- la configuración del filtro (query_json/columns_json), nunca un
-- resultado.
--
-- `query_json` guarda el mismo estado que ya vive en la URL del listado
-- (server/utils/properties/searchService.ts / PropertyList.vue, FASE 27
-- incremento 1): q, status, transactionType, propertyType, sort y el
-- filtro profesional completo. `columns_json` es una preferencia de
-- presentación pura (qué columnas de la tabla ya devuelta se muestran) —
-- nunca amplía qué campos devuelve la consulta, así que no puede filtrar
-- una columna sensible que el usuario no tuviera ya permiso de ver.
--
-- user_id nunca es editable por el cliente (server/utils/adminResources.ts
-- no lo declara en `fields`; los routes lo fijan a partir de la sesión) —
-- sólo quien creó la fila puede editarla o borrarla, aunque sea compartida;
-- visibility='shared' sólo amplía quién puede LEERLA.
CREATE TABLE IF NOT EXISTS property_saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  resource TEXT NOT NULL, -- properties | developer-properties
  kind TEXT NOT NULL DEFAULT 'filter', -- filter | view
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private', -- private | shared
  query_json TEXT NOT NULL,
  columns_json TEXT,
  density TEXT, -- comfortable | compact
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS property_saved_views_org_resource ON property_saved_views (organization_id, resource);
CREATE INDEX IF NOT EXISTS property_saved_views_user ON property_saved_views (user_id);
