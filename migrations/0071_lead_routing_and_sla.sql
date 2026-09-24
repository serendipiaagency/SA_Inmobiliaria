-- Migration number: 0071    FASE 15 — Lead Routing; FASE 16 — Lead SLA
--
-- Aditiva: ALTER TABLE ADD COLUMN (nullable) y CREATE TABLE/INDEX nuevos.
-- No toca ninguna columna existente.
--
-- No se añade Office ni Team como entidades: no existen en el repositorio
-- (mismo hueco ya documentado en 0066/0068/0069). El "Team" de la FASE 15 se
-- resuelve reutilizando `team_members.department` (texto ya existente) como
-- clave de agrupación — no se crea una tabla `teams` paralela para un
-- concepto que hoy sólo es una etiqueta.

-- ---------------------------------------------------------------------------
-- 1) FASE 15 — Lead Routing
-- ---------------------------------------------------------------------------
--
-- Reglas evaluadas en orden de `priority` (menor primero). `scope` dice qué
-- comparar; `match_value` es el valor a igualar (zona, idioma, tipo de
-- propiedad, department) — NULL para 'property', que siempre usa el
-- comercial responsable real de esa Property. Una regla asigna a una
-- persona fija (`target_commercial_id`) o reparte dentro de un grupo
-- (`target_department`, NULL = toda la organización) según `strategy`.
CREATE TABLE IF NOT EXISTS lead_routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL, -- property | zone | language | property_type | new_build | department
  match_value TEXT,
  target_commercial_id INTEGER, -- team_members.id — sin FK real, mismo criterio que leads.agent_id/visits.agent_id
  target_department TEXT,
  strategy TEXT NOT NULL DEFAULT 'round_robin', -- round_robin | workload — sólo aplica cuando target_commercial_id es NULL
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS lead_routing_rules_org_priority ON lead_routing_rules (organization_id, priority);

-- Historial de asignaciones — nunca se pierde quién tuvo un lead antes.
-- `assigned_by` NULL = lo decidió el routing automático, no una persona.
CREATE TABLE IF NOT EXISTS lead_assignment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_commercial_id INTEGER,
  to_commercial_id INTEGER,
  rule_id INTEGER REFERENCES lead_routing_rules(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  assigned_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS lead_assignment_history_lead ON lead_assignment_history (lead_id, created_at);
CREATE INDEX IF NOT EXISTS lead_assignment_history_org ON lead_assignment_history (organization_id, created_at);

-- Estado persistente del round robin, por organización + ámbito ('org' o un
-- nombre de department). Concurrency-safe vía compare-and-swap en el
-- servicio (UPDATE ... WHERE last_assigned_commercial_id = <leído>), mismo
-- principio que el resto del repo usa para "reclamar y procesar" con un
-- índice único en vez de check-then-insert.
CREATE TABLE IF NOT EXISTS lead_round_robin_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  scope_key TEXT NOT NULL,
  last_assigned_commercial_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_round_robin_state_scope ON lead_round_robin_state (organization_id, scope_key);

-- ---------------------------------------------------------------------------
-- 2) FASE 16 — Lead SLA
-- ---------------------------------------------------------------------------
--
-- leads.first_response_at y leads.next_action_at ya existían (migración
-- 0069, preparadas sin rellenar). Faltan qualified_at (primera vez que
-- alcanza QUALIFIED, nunca recalculado) y first_appointment_at (primera cita
-- conseguida, no la próxima futura).
ALTER TABLE leads ADD COLUMN qualified_at TEXT;
ALTER TABLE leads ADD COLUMN first_appointment_at TEXT;

-- Umbrales por organización — nunca una regla universal hardcodeada.
-- use_business_hours queda preparada (FASE 16 §33: "diseñar para poder
-- soportarlo") pero el cálculo de esta fase usa tiempo natural; no se
-- implementa horario comercial sin una definición real que auditar primero.
CREATE TABLE IF NOT EXISTS sla_settings (
  organization_id INTEGER PRIMARY KEY,
  new_lead_unattended_minutes INTEGER NOT NULL DEFAULT 30,
  qualified_without_action_hours INTEGER NOT NULL DEFAULT 24,
  inactive_lead_days INTEGER NOT NULL DEFAULT 7,
  use_business_hours INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- Ciclo de vida de alerta con resolución automática. El índice único parcial
-- (sólo sobre status='open') es lo que impide crear la misma alerta cada vez
-- que corre el cron — sustituye a un check-then-insert por una garantía real
-- de la base de datos.
CREATE TABLE IF NOT EXISTS lead_sla_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- unattended | qualified_no_action | inactive
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  opened_at TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  resolved_reason TEXT, -- auto | manual
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_sla_alerts_open_unique ON lead_sla_alerts (lead_id, type) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS lead_sla_alerts_org_status ON lead_sla_alerts (organization_id, status);
