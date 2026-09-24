-- Migration number: 0071    FASES 15-16 — Asignación de leads y SLA
--
-- Aditiva: tablas y columnas nuevas. No borra ni reescribe ningún dato.
--
-- ---------------------------------------------------------------------------
-- 1) El Comercial puede ser una cuenta
-- ---------------------------------------------------------------------------
--
-- `team_members` es el Comercial real del producto (es a donde apuntan
-- leads.agent_id, visits.agent_id y agent_properties.agent_id). Pero no estaba
-- enlazado con `users`, así que el sistema podía asignarle un lead a Laura sin
-- saber qué cuenta es Laura — y por tanto sin poder avisarla cuando se le pasa
-- el plazo de atención.
--
-- NULLable a propósito: hay comerciales que son fichas públicas de la web sin
-- cuenta en el panel, y obligarles a tener una sería inventarse un usuario.
-- NULL significa "no tiene cuenta", y el SLA lo trata como tal: avisa a la
-- organización en vez de a nadie en concreto.
ALTER TABLE team_members ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS team_members_user ON team_members (user_id);

-- ---------------------------------------------------------------------------
-- 2) Reglas de asignación, del tenant y con prioridad
-- ---------------------------------------------------------------------------
--
-- Una agencia reparte por el dueño del inmueble; otra por oficina y turno
-- rotatorio. No hay una política global correcta, así que las reglas son datos
-- de cada organización y no código.
--
-- `priority` existe para que el orden sea una decisión y no el resultado
-- accidental de cómo devuelva las filas la base de datos.
CREATE TABLE IF NOT EXISTS lead_routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,        -- menor = se evalúa antes
  enabled INTEGER NOT NULL DEFAULT 1,

  -- Condiciones. NULL = esta regla no filtra por ese criterio.
  match_source TEXT,                            -- web | portal | referral | ads | social | call
  match_portal TEXT,                            -- Idealista, Fotocasa…
  match_zone TEXT,                              -- ciudad / distrito / código postal
  match_property_type TEXT,
  match_language TEXT,

  -- Estrategia de elección dentro del grupo que cumple las condiciones.
  strategy TEXT NOT NULL DEFAULT 'round_robin', -- property_owner | specific | round_robin | least_load
  target_commercial_id INTEGER,                 -- sólo para 'specific'
  target_office TEXT,                           -- acota el grupo por office_name

  -- Si se respeta el horario, un comercial fuera de su franja no entra en el
  -- reparto. Desactivado por defecto: activarlo sin horarios configurados
  -- dejaría leads sin asignar.
  respect_working_hours INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS lead_routing_rules_org ON lead_routing_rules (organization_id, enabled, priority);

-- ---------------------------------------------------------------------------
-- 3) Turno rotatorio persistente
-- ---------------------------------------------------------------------------
--
-- El round robin NO puede ser Math.random(): dos leads seguidos irían al mismo
-- comercial la mitad de las veces y nadie podría explicar el reparto.
--
-- Es un contador por ámbito (organización + regla + oficina). El avance se
-- hace con `UPDATE ... SET counter = counter + 1`, que en SQLite es atómico:
-- dos leads que entren a la vez obtienen contadores distintos y van a
-- comerciales distintos. Y sobrevive a los despliegues, porque está en la base
-- y no en memoria del proceso.
CREATE TABLE IF NOT EXISTS lead_routing_cursors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  scope_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_routing_cursors_scope ON lead_routing_cursors (organization_id, scope_key);

-- ---------------------------------------------------------------------------
-- 4) Historial de asignaciones
-- ---------------------------------------------------------------------------
--
-- Tiene que poder responderse "¿por qué este lead es de Laura?" meses después,
-- y "¿quién se lo quitó a Marta y cuándo?". Por eso se guarda la explicación
-- completa que produjo el motor, no sólo el identificador de la regla: si la
-- regla cambia mañana, la explicación de ayer sigue siendo legible.
CREATE TABLE IF NOT EXISTS lead_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_commercial_id INTEGER,
  to_commercial_id INTEGER,
  rule_id INTEGER,
  /** automatic | manual | fallback */
  source TEXT NOT NULL DEFAULT 'automatic',
  /** "Zona Chamberí → Oficina Centro → turno rotatorio → Laura" */
  explanation TEXT,
  reason TEXT,
  assigned_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS lead_assignments_lead ON lead_assignments (lead_id, id);
CREATE INDEX IF NOT EXISTS lead_assignments_org ON lead_assignments (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- 5) Los tiempos del ciclo de atención (FASE 16)
-- ---------------------------------------------------------------------------
--
-- `first_response_at` ya existe desde la migración 0069 y significa lo mismo
-- que la fase llama firstHumanResponseAt: la primera respuesta real de una
-- persona. NO se duplica con otro nombre.
--
-- Lo que faltaba es distinguir el INTENTO de la RESPUESTA:
--
--   first_contact_at        — se intentó contactar (llamada, email, WhatsApp),
--                             haya contestado o no.
--   first_response_at       — hubo interacción humana de verdad (0069).
--
-- Los dos quedan a NULL hasta que ocurran. Rellenarlos con created_at diría
-- que a todos los leads se les atendió al instante, y cualquier métrica
-- construida encima sería mentira.
ALTER TABLE leads ADD COLUMN first_contact_at TEXT;
ALTER TABLE leads ADD COLUMN qualified_at TEXT;
ALTER TABLE leads ADD COLUMN first_appointment_at TEXT;

-- Por qué está asignado a quien está, sin tener que consultar el historial.
ALTER TABLE leads ADD COLUMN routing_rule_id INTEGER;
ALTER TABLE leads ADD COLUMN routing_explanation TEXT;

-- El índice que sostiene "cuántos leads vivos lleva cada comercial", que es la
-- consulta del reparto por carga y la del SLA. Va sobre `status` porque ahí es
-- donde vive el cierre de un lead en este modelo (won|lost): no hay una
-- columna `outcome` aparte.
CREATE INDEX IF NOT EXISTS leads_org_agent_status ON leads (organization_id, agent_id, status);

-- ---------------------------------------------------------------------------
-- 6) Configuración del SLA, por organización
-- ---------------------------------------------------------------------------
--
-- Los plazos son una decisión de negocio de cada agencia, no una constante del
-- código. Los valores por defecto son los de una fila que no existe todavía:
-- mientras nadie configure nada, el SLA no alerta de nada.
CREATE TABLE IF NOT EXISTS sla_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  /** Minutos desde que entra el lead hasta que alguien debe haberlo atendido. */
  first_response_minutes INTEGER NOT NULL DEFAULT 60,
  /** Días sin ningún contacto antes de avisar. */
  stale_days INTEGER NOT NULL DEFAULT 7,
  /** Si sólo cuentan las horas laborables configuradas del comercial. */
  business_hours_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS sla_settings_org ON sla_settings (organization_id);

-- ---------------------------------------------------------------------------
-- 7) Alertas de SLA
-- ---------------------------------------------------------------------------
--
-- Una alerta tiene ciclo de vida: nace, y se cierra sola cuando desaparece el
-- motivo (alguien respondió, se cualificó, se puso una cita). No se borra: se
-- marca resuelta, para que "cuántas veces se nos pasó el plazo el mes pasado"
-- siga teniendo respuesta.
--
-- El índice único sobre (lead, kind) abierto evita que el mismo problema
-- genere una alerta nueva en cada pasada del proceso.
CREATE TABLE IF NOT EXISTS lead_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  /** unanswered | qualified_without_next_action | stale */
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',          -- open | resolved | dismissed
  detail TEXT,
  commercial_id INTEGER,
  resolved_at TEXT,
  resolved_reason TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS lead_alerts_org_status ON lead_alerts (organization_id, status, kind);
CREATE UNIQUE INDEX IF NOT EXISTS lead_alerts_open_unique ON lead_alerts (lead_id, kind) WHERE status = 'open';
