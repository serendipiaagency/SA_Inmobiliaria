-- Migration number: 0073    FASE 18 — Visitas multi-inmueble (Tour + TourStop)
--
-- Aditiva: CREATE TABLE nueva + ALTER TABLE ADD COLUMN (nullable) sobre
-- `visits` + índices. No toca ninguna columna ni tabla existente.
--
-- Decisión de diseño: un Tour es un cliente viendo varios inmuebles en una
-- misma salida, guiado por un comercial. Cada parada sigue siendo una cita
-- real (una fila de `visits`) — la hora, el estado, el comercial y la
-- confirmación del cliente de cada parada viven ahí, no se duplican aquí, así
-- que nunca puede haber dos versiones del horario de una parada que se
-- contradigan. `property_tours` es sólo la cabecera (de quién es el tour,
-- notas) y el orden de sus paradas.
--
-- Por eso no se añade `property_tour_stops` como tabla propia: una parada
-- sin más identidad que "una visita que pertenece a un tour, en una
-- posición" no necesita su propia tabla — `visits.tour_id` +
-- `visits.tour_stop_order` son esa relación, aditivos sobre la tabla que ya
-- es la cita canónica (migración 0072).

CREATE TABLE IF NOT EXISTS property_tours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  -- Mismo criterio que visits.lead_id (migración 0072): opcional, se enlaza
  -- cuando se sabe qué lead pidió el tour.
  lead_id INTEGER REFERENCES leads(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS property_tours_org ON property_tours(organization_id, created_at);

ALTER TABLE visits ADD COLUMN tour_id INTEGER REFERENCES property_tours(id);
ALTER TABLE visits ADD COLUMN tour_stop_order INTEGER;

CREATE INDEX IF NOT EXISTS visits_tour ON visits(tour_id, tour_stop_order);
