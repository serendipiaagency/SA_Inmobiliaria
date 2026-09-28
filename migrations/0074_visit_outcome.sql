-- Migration number: 0074    FASE 19 — Visit Outcome
--
-- Aditiva: sólo ALTER TABLE ADD COLUMN, todas nullable. No toca ninguna
-- columna ni tabla existente.
--
-- Decisión de diseño: el resultado de una visita es PERCEPCIÓN, no HECHO.
-- Que un comercial anote "le gustó pero la cocina le pareció anticuada" no
-- cambia las características reales del inmueble (`agent_properties` /
-- `developer_properties`), y que un cliente reaccione de una forma en una
-- visita concreta no cambia lo que dice buscar (`buyer_requirements`). Por
-- eso este resultado vive exclusivamente en `visits` — la cita canónica
-- (FASE 17) — como una nota atada a ESA visita, nunca como una escritura en
-- el catálogo o en la necesidad del comprador. server/utils/appointments/
-- outcome.ts no importa esos dos módulos, y un test dedicado
-- (test/unit/visitOutcome.test.ts) compara esas tablas fila a fila antes y
-- después de grabar un resultado para que ese límite no se rompa sin darse
-- cuenta.
--
-- Mismo patrón que ya usa comms_calls.outcome (categoría cerrada + texto
-- libre) — es el único sitio del repo donde ya existía un "resultado de
-- interacción" antes de esta migración.

ALTER TABLE visits ADD COLUMN outcome TEXT; -- interested | wants_to_think | not_interested — nunca obligatorio
ALTER TABLE visits ADD COLUMN outcome_notes TEXT;
ALTER TABLE visits ADD COLUMN outcome_recorded_at TEXT;
