-- Migration number: 0072    FASE 17 — Appointment (entidad transversal de citas)
--
-- Aditiva: sólo ALTER TABLE ADD COLUMN (todas nullable o con default que
-- preserva el comportamiento actual) e índices nuevos. No toca ninguna
-- columna existente ni crea tabla nueva.
--
-- Decisión de diseño (ya razonada en sesiones previas): `visits` es la cita
-- canónica de la plataforma — no se crea una tabla `appointments` paralela.
-- Esta migración le añade lo que le faltaba para serlo de verdad:
--
--  - `type`: el PARA QUÉ de la cita (visita a inmueble, llamada de
--    seguimiento…), un eje distinto de `channel` (el CÓMO: presencial, vídeo,
--    teléfono — ya existente desde antes). Antes de esta migración no había
--    forma de distinguir una visita a un inmueble de una llamada de
--    seguimiento salvo leyendo `notes` a mano.
--  - `confirmation_status` + `confirmed_at`: si el cliente ha confirmado su
--    asistencia, distinto de `status` (el ciclo de vida interno:
--    agendada/completada/cancelada/no-show). El texto público ya llamaba
--    "confirmada" a una cita simplemente agendada — este campo es la
--    confirmación real, explícita, del cliente.
--  - `lead_id`: antes de esta migración no existía ninguna clave foránea
--    entre `visits` y `leads` (auditado y documentado en
--    server/api/admin/[resource]/[id]/related.get.ts): el cruce se hacía por
--    nombre/email, igual que con `clients`. Se añade sólo para `leads`
--    porque es la relación que de verdad hace falta ahora mismo (FASE 16:
--    `markFirstAppointment` ya conocía el id del lead en el momento de crear
--    la cita, pero no había dónde guardarlo).

ALTER TABLE visits ADD COLUMN type TEXT NOT NULL DEFAULT 'property_viewing'; -- property_viewing | call | other
ALTER TABLE visits ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending'; -- pending | confirmed
ALTER TABLE visits ADD COLUMN confirmed_at TEXT;
ALTER TABLE visits ADD COLUMN lead_id INTEGER REFERENCES leads(id);

CREATE INDEX IF NOT EXISTS visits_type ON visits(type);
CREATE INDEX IF NOT EXISTS visits_lead ON visits(lead_id);
