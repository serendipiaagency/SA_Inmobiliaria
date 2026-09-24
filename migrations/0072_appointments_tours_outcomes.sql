-- Migration number: 0072    FASES 17-19 — Cita canónica, tours y resultado de visita
--
-- Aditiva: columnas y tablas nuevas. No borra ni reescribe ningún dato.
--
-- ---------------------------------------------------------------------------
-- 1) `visits` ES la cita canónica
-- ---------------------------------------------------------------------------
--
-- La fase pide una entidad Appointment que sirva para visitas, llamadas,
-- videollamadas, tasaciones y firmas, y prohíbe expresamente crear calendarios
-- separados. `visits` YA es una reserva de tiempo con agenda, control de
-- solapamiento, recordatorios y enlace de videollamada, así que la cita
-- canónica es esta tabla — no una nueva al lado.
--
-- Se conserva el nombre `visits`. Renombrarla obligaría a reescribir todas las
-- consultas existentes y a una migración destructiva, a cambio de nada que el
-- usuario note. Lo que importa es que haya UNA tabla, no cómo se llame.
--
-- `channel` (presencial/vídeo/teléfono) ya existía y NO se sustituye: es el
-- medio. `type` es el propósito. Son ejes distintos — una tasación puede ser
-- presencial o por videollamada — y mezclarlos perdería uno de los dos.
ALTER TABLE visits ADD COLUMN type TEXT NOT NULL DEFAULT 'property_viewing';
-- property_viewing | call | video_call | meeting | valuation | capture | signature | open_house | other

-- La persona y la oportunidad. NULLables: hay visitas que se reservan desde la
-- web pública antes de que exista ficha de nadie.
ALTER TABLE visits ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
ALTER TABLE visits ADD COLUMN lead_id INTEGER REFERENCES leads(id);

-- La zona horaria en la que se acordó la cita. Sin esto, "las 17:00" de una
-- agencia en Canarias y otra en Madrid son la misma fila y horas distintas.
-- NULL = no se registró; se interpreta con la zona de la organización.
ALTER TABLE visits ADD COLUMN timezone TEXT;

-- Confirmación y recordatorios son estados propios, no se deducen del estado
-- de la cita: una cita programada puede estar confirmada por el cliente o no,
-- y eso cambia quién tiene que llamar a quién.
ALTER TABLE visits ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending'; -- pending | confirmed | declined
ALTER TABLE visits ADD COLUMN confirmed_at TEXT;

ALTER TABLE visits ADD COLUMN meeting_point TEXT;
-- Notas que el cliente NO debe ver. Separadas de `notes` a propósito: mezclarlas
-- acaba con un comentario interno en un recordatorio por email.
ALTER TABLE visits ADD COLUMN internal_notes TEXT;

-- Cancelar deja constancia de quién y por qué. Sin esto, una cita cancelada
-- sólo dice que ya no existe.
ALTER TABLE visits ADD COLUMN cancellation_reason TEXT;
ALTER TABLE visits ADD COLUMN cancelled_at TEXT;
ALTER TABLE visits ADD COLUMN cancelled_by INTEGER;

ALTER TABLE visits ADD COLUMN organization_timezone_applied INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS visits_org_type ON visits (organization_id, type);
CREATE INDEX IF NOT EXISTS visits_contact ON visits (contact_id);
CREATE INDEX IF NOT EXISTS visits_lead ON visits (lead_id);

-- ---------------------------------------------------------------------------
-- 2) Tours: varias paradas, una agenda (FASE 18)
-- ---------------------------------------------------------------------------
--
-- Enseñar cuatro pisos en una tarde NO se guarda como property_ids = [A,B,C]
-- dentro de una cita: haría falta orden, hora y resultado por parada, y un
-- array no tiene ninguno de los tres.
--
-- El tour AGRUPA; cada parada real es una cita de tipo property_viewing, que
-- es la que reserva el tiempo. Así no hay dos calendarios que puedan
-- divergir: la hora vive en la cita y el tour no la duplica.
CREATE TABLE IF NOT EXISTS property_tours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contact_id INTEGER REFERENCES contacts(id),
  lead_id INTEGER REFERENCES leads(id),
  buyer_requirement_id INTEGER REFERENCES buyer_requirements(id),
  commercial_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  scheduled_date TEXT,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'planned', -- planned | in_progress | completed | cancelled
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS property_tours_org ON property_tours (organization_id, status);
CREATE INDEX IF NOT EXISTS property_tours_contact ON property_tours (contact_id);

-- Cada parada apunta a su cita, que es la fuente de la hora. `sort_order` es
-- el orden de visita, que se puede cambiar sin tocar las horas.
CREATE TABLE IF NOT EXISTS property_tour_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  tour_id INTEGER NOT NULL REFERENCES property_tours(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  /** La cita que reserva el tiempo de esta parada. La hora NO se copia aquí. */
  visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned', -- planned | visited | skipped | cancelled
  meeting_point TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS property_tour_stops_tour ON property_tour_stops (tour_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS property_tour_stops_unique ON property_tour_stops (tour_id, property_id);

-- ---------------------------------------------------------------------------
-- 3) Resultado de la visita (FASE 19)
-- ---------------------------------------------------------------------------
--
-- UN resultado por cita: el índice único lo garantiza. Dos resultados
-- contradictorios sobre la misma visita harían imposible responder "¿le gustó
-- o no?".
--
-- REGLA CRÍTICA, y está en el diseño y no sólo en la documentación: esto es
-- PERCEPCIÓN DEL COMPRADOR, no un hecho del inmueble. Que alguien diga "la
-- cocina está anticuada" NO cambia `agent_properties.condition`, ni el precio,
-- ni la necesidad del comprador. Son opiniones de una persona sobre una tarde
-- concreta; convertirlas en datos del catálogo dejaría la ficha a merced de
-- quien peor humor tuviera ese día.
CREATE TABLE IF NOT EXISTS visit_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  tour_stop_id INTEGER REFERENCES property_tour_stops(id) ON DELETE SET NULL,

  /** ¿Se realizó de verdad? NULL = todavía no consta. No se asume que sí. */
  completed INTEGER,
  /** 0..5. NULL = no se preguntó; distinto de 0, que es "no le interesó nada". */
  interest_score INTEGER,

  liked TEXT,
  disliked TEXT,
  /** too_expensive | fair | bargain — lo que le pareció A ÉL, no lo que vale. */
  price_perception TEXT,
  location_feedback TEXT,
  condition_feedback TEXT,
  layout_feedback TEXT,

  wants_second_viewing INTEGER NOT NULL DEFAULT 0,
  wants_offer INTEGER NOT NULL DEFAULT 0,
  discarded INTEGER NOT NULL DEFAULT 0,
  discard_reason TEXT,
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  follow_up_at TEXT,

  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS visit_outcomes_visit ON visit_outcomes (visit_id);
CREATE INDEX IF NOT EXISTS visit_outcomes_org ON visit_outcomes (organization_id, created_at);
