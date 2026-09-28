-- Migration number: 0076    FASE 21 — Activity Timeline
--
-- Activity representa acontecimientos comerciales reales — "qué ocurrió" —
-- y es deliberadamente distinta de `admin_audit_log` ("qué cambio técnico se
-- hizo"): Activity dice "Lead cualificado", Audit dice "Laura cambió
-- Lead.stage de QUALIFYING a QUALIFIED". No se duplica una dentro de la
-- otra.
--
-- Relaciones explícitas en columnas propias (contact_id, lead_id,
-- property_id+property_kind, appointment_id, buyer_requirement_id) en vez de
-- esconderlas dentro de metadata_json: así se puede listar "toda la
-- actividad de este contacto/lead/inmueble/cita" con un índice, no
-- deserializando JSON fila a fila. `entity_type`/`entity_id` señalan la
-- entidad principal del evento (la que lo originó), que no siempre coincide
-- con ninguna de las relaciones anteriores.
--
-- Append-only por diseño: ningún código de este proyecto hace UPDATE ni
-- DELETE sobre esta tabla.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  contact_id INTEGER,
  lead_id INTEGER,
  property_id INTEGER,
  property_kind TEXT, -- agent | developer
  appointment_id INTEGER,
  buyer_requirement_id INTEGER,
  actor_type TEXT NOT NULL, -- user | contact | system | ai
  actor_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS activities_org_created ON activities (organization_id, created_at);
CREATE INDEX IF NOT EXISTS activities_contact ON activities (contact_id, created_at);
CREATE INDEX IF NOT EXISTS activities_lead ON activities (lead_id, created_at);
CREATE INDEX IF NOT EXISTS activities_property ON activities (property_id, property_kind, created_at);
CREATE INDEX IF NOT EXISTS activities_appointment ON activities (appointment_id, created_at);
CREATE INDEX IF NOT EXISTS activities_entity ON activities (entity_type, entity_id, created_at);
