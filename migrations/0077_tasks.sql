-- Migration number: 0077    FASE 22 — Task + Next Action
--
-- Task representa TRABAJO PENDIENTE — deliberadamente distinta de Appointment
-- (tiempo reservado) y de Activity (algo que ya ocurrió). No se convierte una
-- en otra: completar una Task no crea una cita, y una cita no es una Task.
--
-- No copia datos de las entidades relacionadas (nombre de contacto,
-- dirección de propiedad, origen del lead): sólo guarda las relaciones
-- (contact_id, lead_id, property_id+kind, appointment_id, deal_id) y las
-- consume en el momento de mostrarlas, igual que activities y visits.
--
-- deal_id no tiene FK real todavía — Deal no existe hasta FASE 24. Columna
-- añadida ya (aditivo, nunca hará falta otra migración para esto) siguiendo
-- el mismo precedente que visits.propertyId/propertyKind: entero suelto sin
-- FK, resuelto por la capa de aplicación.
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  assignee_id INTEGER, -- team_members.id — el comercial responsable
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  contact_id INTEGER,
  lead_id INTEGER,
  property_id INTEGER,
  property_kind TEXT, -- agent | developer
  appointment_id INTEGER,
  deal_id INTEGER,
  created_by INTEGER, -- users.id
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS tasks_org_status_due ON tasks (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_assignee_status_due ON tasks (assignee_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_contact ON tasks (contact_id);
CREATE INDEX IF NOT EXISTS tasks_lead ON tasks (lead_id);
CREATE INDEX IF NOT EXISTS tasks_property ON tasks (property_id, property_kind);
CREATE INDEX IF NOT EXISTS tasks_appointment ON tasks (appointment_id);
CREATE INDEX IF NOT EXISTS tasks_deal ON tasks (deal_id);

-- Next Action: leads.next_action_at ya existía (migración 0069, usado desde
-- FASE 16 por la alerta SLA "cualificado sin próxima acción") pero nada lo
-- escribía todavía — todo lead cualificado tenía la alerta condenada a
-- dispararse siempre. A partir de esta FASE, next_action_type/next_action_at
-- son una PROYECCIÓN sincronizada (nunca editable a mano) de la Task abierta
-- o la Appointment futura más próxima de ese lead — nunca una segunda fuente
-- de verdad. Ver server/utils/leads/nextAction.ts.
ALTER TABLE leads ADD COLUMN next_action_type TEXT;
