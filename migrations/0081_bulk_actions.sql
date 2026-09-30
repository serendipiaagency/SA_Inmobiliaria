-- Migration number: 0081    FASE 28 — Bulk Actions: framework + Tag transversal + paridad de PropertyPriceHistory
--
-- Framework genérico de acciones masivas (§84-106 del encargo): "NO
-- implementar cada acción como hack independiente". Dos tablas, reutilizadas
-- por Properties y Leads por igual — mismo patrón job+items ya probado en
-- este repo por asset_export_catalogs/asset_export_catalog_items y
-- export_batches/export_batch_items (mismo motivo: no hay Cloudflare Queues
-- ni Durable Objects en este proyecto, así que "no bloquear el request
-- durante minutos" se resuelve con un job pendiente + un endpoint
-- process-next que procesa una fila por llamada, sondeado por el cliente).
--
-- `entity_type` reutiliza el mismo vocabulario que ya usan `tasks`/
-- `activities`/`deal_operations` para distinguir catálogo de propiedad
-- ('agent' | 'developer'), más 'lead' — nunca una cuarta tabla de motivo de
-- query paralelo (mismo criterio que FASE 27 §51).
--
-- `bulk_action_jobs.status` usa el vocabulario exacto del encargo (§103):
-- pending | processing | completed | failed | partial — distinto a
-- 'running'/'completed_with_errors' que usa asset_export_catalogs, porque
-- aquí el encargo nombra los estados explícitamente.
CREATE TABLE IF NOT EXISTS bulk_action_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL, -- agent | developer | lead
  action TEXT NOT NULL, -- change_commercial | change_status | add_tag | publish | withdraw | update_price | create_task | assign_commercial | change_stage | ...
  params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | partial
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  requested_by INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS bulk_action_jobs_org ON bulk_action_jobs (organization_id, created_at);

-- Una fila por elemento afectado — nunca un UPDATE masivo que se salte el
-- histórico o el resultado individual (§104: "NO devolver simplemente
-- 'Error'. Mostrar resultado individual"). El índice único (job_id,
-- target_id) es también el mecanismo de idempotencia (§105): un
-- process-next reintentado sobre el mismo job nunca duplica una fila, y
-- process-next sólo recoge filas todavía 'pending' — un reintento tras un
-- fallo de red a mitad de proceso encuentra la fila ya en 'processing' o ya
-- resuelta, nunca la vuelve a crear.
CREATE TABLE IF NOT EXISTS bulk_action_job_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES bulk_action_jobs(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS bulk_action_job_items_unique ON bulk_action_job_items (job_id, target_id);
CREATE INDEX IF NOT EXISTS bulk_action_job_items_job_status ON bulk_action_job_items (job_id, status);

-- Tag transversal (§89, §99: "Utilizar Tag transversal. No crear BulkTag").
-- No existía ningún Tag genérico en el repo — el único Tag de antes era
-- cms_tags/cms_article_tags, propio del Blog. `tag_links` es polimórfica
-- (entity_type/entity_id, sin FK real) — mismo criterio ya documentado para
-- `activities.propertyId/propertyKind` (dos tablas de propiedad, una FK real
-- rompería para una de las dos).
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_org_slug ON tags (organization_id, slug);
CREATE INDEX IF NOT EXISTS tags_org ON tags (organization_id);

CREATE TABLE IF NOT EXISTS tag_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- agent | developer | lead
  entity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tag_links_unique ON tag_links (tag_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS tag_links_entity ON tag_links (organization_id, entity_type, entity_id);

-- Paridad de PropertyPriceHistory para 2ª mano (§94: "Cada Property
-- modificada debe generar PropertyPriceHistory... Bulk update NO puede
-- saltarse el histórico"). `price_history` (migración 0014) sólo cubre
-- developer_properties — nunca se tocó ni se renombró aquí, tiene un
-- consumidor público real (server/api/public/properties/[slug]/price-history.get.ts)
-- y datos en producción. agent_properties no tenía ningún histórico de
-- precio hasta ahora; se añade como tabla propia (mismo patrón ya usado en
-- todo el repo para "mismo concepto, una tabla por catálogo": ver
-- agent_property_rooms/developer_property_rooms, agent_property_floor_plans/
-- floor_plans) en vez de generalizar la tabla existente — más seguro que
-- migrar datos reales, y consistente con cómo ya está hecho el resto.
CREATE TABLE IF NOT EXISTS agent_property_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_property_price_history_property ON agent_property_price_history (property_id);
