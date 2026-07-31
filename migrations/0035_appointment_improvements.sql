-- Migration number: 0035    Diez mejoras de uso/proceso sobre la agenda de
-- citas (0034): buffer entre citas, tope diario, calificación previa,
-- gestión propia por el cliente, recordatorios, exportación de calendario
-- y el rastro de notificaciones que todo lo anterior necesita.

ALTER TABLE team_members ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN max_appointments_per_day INTEGER;
ALTER TABLE team_members ADD COLUMN ical_token TEXT;

ALTER TABLE visits ADD COLUMN client_email TEXT;
ALTER TABLE visits ADD COLUMN client_phone TEXT;
ALTER TABLE visits ADD COLUMN client_budget REAL;
ALTER TABLE visits ADD COLUMN client_interest TEXT;
ALTER TABLE visits ADD COLUMN management_token TEXT;
ALTER TABLE visits ADD COLUMN reminder_24h_sent_at TEXT;
ALTER TABLE visits ADD COLUMN reminder_1h_sent_at TEXT;
ALTER TABLE visits ADD COLUMN video_link TEXT;

CREATE UNIQUE INDEX visits_management_token ON visits (management_token) WHERE management_token IS NOT NULL;
CREATE UNIQUE INDEX team_members_ical_token ON team_members (ical_token) WHERE ical_token IS NOT NULL;

-- Rastro real de cada aviso relacionado con una cita (confirmación,
-- recordatorio, cancelación) — `delivered` se queda honestamente en 0 para
-- canales sin proveedor conectado (email/whatsapp), en vez de fingir un
-- envío que no ocurrió. `internal` siempre queda disponible en el panel.
CREATE TABLE appointment_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  visit_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- confirmation | reminder_24h | reminder_1h | cancelled | rescheduled
  channel TEXT NOT NULL DEFAULT 'internal', -- internal | email | whatsapp
  recipient TEXT,
  message TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX appointment_notifications_visit ON appointment_notifications (visit_id, created_at);
CREATE INDEX appointment_notifications_org_read ON appointment_notifications (organization_id, read_at);
