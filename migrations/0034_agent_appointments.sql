-- Migration number: 0034    Agenda de citas con agentes
-- `visits` ya existía pero solo guardaba un `agent_name` de texto libre, sin
-- FK a team_members y sin ningún concepto de disponibilidad/duración/solape
-- — cualquier fecha/hora era "válida". Esto añade disponibilidad real por
-- agente (horario semanal + bloqueos puntuales) y liga cada visita a un
-- agente concreto para poder comprobar conflictos de verdad.

ALTER TABLE team_members ADD COLUMN slot_duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE visits ADD COLUMN agent_id INTEGER;
ALTER TABLE visits ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE visits ADD COLUMN ends_at TEXT;
UPDATE visits SET ends_at = datetime(scheduled_at, '+60 minutes') WHERE ends_at IS NULL;

CREATE TABLE agent_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=domingo .. 6=sábado
  start_time TEXT NOT NULL, -- 'HH:MM'
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX agent_availability_agent ON agent_availability (agent_id);

CREATE TABLE agent_time_off (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX agent_time_off_agent_date ON agent_time_off (agent_id, date);
