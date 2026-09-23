-- Migration number: 0069    FASES 12-13 — Lead real + Pipeline; FASE 11 — matching también sobre developer_properties
--
-- Aditiva: ALTER TABLE ADD COLUMN (todas NULLable salvo `stage`, que lleva un
-- DEFAULT constante) y CREATE TABLE/INDEX nuevos. No reescribe ni borra
-- ninguna columna existente. `leads.status` no cambia de significado para
-- quien ya lo consulta (dashboards, GDPR export/delete, Comunicaciones,
-- rendimiento de comerciales…) — se añade `stage` al lado como la dimensión
-- de posición en el pipeline que la FASE 13 exige mantener separada.

-- ---------------------------------------------------------------------------
-- 1) FASE 12 — Lead: los campos que hoy faltan frente al dominio real
-- ---------------------------------------------------------------------------
--
-- whatsapp/sourceDetail/campaign/UTMs/portal/landingPage/referrer/original
-- message no existían — un lead capturado hoy los pierde sin remedio. priority
-- y lostReason tampoco. firstResponseAt/nextActionAt se preparan (arquitectura,
-- no relleno inventado): quedan NULL hasta que una acción real los rellene.
--
-- No se añade `officeId`: no existe entidad Office en todo el repositorio
-- (mismo hueco ya documentado y diferido en migraciones 0066/0068) — añadirla
-- aquí sería inventar una relación a una tabla que no existe.
ALTER TABLE leads ADD COLUMN whatsapp TEXT;
ALTER TABLE leads ADD COLUMN source_detail TEXT;
ALTER TABLE leads ADD COLUMN campaign TEXT;
ALTER TABLE leads ADD COLUMN utm_source TEXT;
ALTER TABLE leads ADD COLUMN utm_medium TEXT;
ALTER TABLE leads ADD COLUMN utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN utm_content TEXT;
ALTER TABLE leads ADD COLUMN utm_term TEXT;
-- Preparado para integraciones de portales inmobiliarios futuras; ningún
-- flujo real lo rellena todavía (FASE 12 §67: "preparar sin implementar").
ALTER TABLE leads ADD COLUMN portal TEXT;
ALTER TABLE leads ADD COLUMN landing_page TEXT;
ALTER TABLE leads ADD COLUMN referrer TEXT;
-- El mensaje de captación tal cual llegó, nunca reescrito. `notes` seguía
-- existiendo para anotaciones internas posteriores; esto es la foto del
-- origen (FASE 12 §70).
ALTER TABLE leads ADD COLUMN original_message TEXT;
ALTER TABLE leads ADD COLUMN priority TEXT; -- low | medium | high | urgent — nunca el mismo dato que score
ALTER TABLE leads ADD COLUMN first_response_at TEXT;
ALTER TABLE leads ADD COLUMN next_action_at TEXT;
ALTER TABLE leads ADD COLUMN lost_reason TEXT; -- no_response | not_interested | duplicate | other — sólo con sentido si status = 'lost'

-- ---------------------------------------------------------------------------
-- 2) FASE 13 — stage, separado de status
-- ---------------------------------------------------------------------------
--
-- `status` (new|contacted|qualified|proposal|won|lost) sigue existiendo tal
-- cual: lo consultan 20+ rutas (analytics, overview, GDPR, rendimiento de
-- comerciales, Comunicaciones…) y redefinir su significado ahí sería un
-- cambio de alto riesgo fuera del alcance de este bloque. `stage` es la
-- posición real en el pipeline, con la taxonomía completa que pide la FASE
-- (incluye QUALIFYING/VIEWING/NEGOTIATION, que `status` nunca distinguió), y
-- vive en una columna propia con su propio historial (lead_stage_history).
-- El servicio de transición (server/utils/leads/pipeline.ts) mantiene
-- `status` sincronizado desde `stage` en cada movimiento para que los
-- consumidores existentes seas coherentes sin tocarlos uno a uno.
ALTER TABLE leads ADD COLUMN stage TEXT NOT NULL DEFAULT 'new'; -- new|contacted|qualifying|qualified|viewing|offer|negotiation|won

-- Backfill determinista desde el status actual — no hay otra fuente de
-- verdad. 'lost' no dice en qué fase se perdió el lead, así que se queda en
-- el DEFAULT 'new' ya aplicado por el ADD COLUMN de arriba: es una fase
-- desconocida marcada como tal, no una invención.
UPDATE leads SET stage = 'contacted' WHERE status = 'contacted';
UPDATE leads SET stage = 'qualified' WHERE status = 'qualified';
UPDATE leads SET stage = 'offer' WHERE status = 'proposal';
UPDATE leads SET stage = 'won' WHERE status = 'won';

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
-- Inmutable a propósito (FASE 13 §87): ninguna ruta de la aplicación hace
-- UPDATE/DELETE sobre esta tabla, sólo INSERT.
CREATE INDEX IF NOT EXISTS lead_stage_history_lead ON lead_stage_history (lead_id, created_at);
CREATE INDEX IF NOT EXISTS lead_stage_history_org ON lead_stage_history (organization_id, created_at);

-- No se fabrica historial para los leads que ya existían (FASE 13 §125: "si
-- sólo conocemos stage actual, no crear timestamps históricos ficticios") —
-- lead_stage_history se queda vacía para ellos hasta su primer movimiento
-- real después de esta migración.

-- ---------------------------------------------------------------------------
-- 3) FASE 11 — el motor de matching también sobre developer_properties
-- ---------------------------------------------------------------------------
--
-- property_matches (migración 0067) tiene su FK fija a agent_properties: una
-- promoción de obra nueva era invisible para el motor. Sigue la convención ya
-- establecida en el repositorio ("una tabla por tipo de propiedad y concepto
-- hijo", floor_plans/agent_property_floor_plans, developer_property_rooms/
-- agent_property_rooms) en vez de una FK polimórfica: misma forma exacta que
-- property_matches, FK a developer_properties.
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
