-- Migration number: 0075    FASE 20 — Calendar
--
-- Calendar no es una segunda agenda: se construye enteramente sobre `visits`
-- (Appointment sigue siendo la fuente de verdad). Esta migración sólo añade
-- lo mínimo que Calendar necesita y no podía obtener ya de `visits`:
--
-- 1. `property_kind` — hasta ahora `visits.property_id` sólo referenciaba
--    `developer_properties` (la reserva pública nunca ofreció 2ª mano). El
--    filtro de Propiedad de Calendar debe cubrir ambos catálogos, así que la
--    nueva creación de citas desde el panel (POST /api/admin/saas/visits)
--    también podrá apuntar a `agent_properties`. Backfill: toda fila
--    existente con property_id ya era, por invariante del código anterior,
--    una developer_property — se marca explícitamente en vez de dejarla
--    ambigua.
-- 2. `calendar_provider` / `external_calendar_id` / `external_event_id` /
--    `calendar_sync_status` — sólo almacenamiento preparado para una futura
--    sincronización con Google Calendar / Outlook (sección 23-25 del
--    megaprompt). Nada los escribe todavía; no son obligatorios.

ALTER TABLE visits ADD COLUMN property_kind TEXT; -- agent | developer
UPDATE visits SET property_kind = 'developer' WHERE property_id IS NOT NULL AND property_kind IS NULL;

ALTER TABLE visits ADD COLUMN calendar_provider TEXT; -- futuro: google | outlook
ALTER TABLE visits ADD COLUMN external_calendar_id TEXT;
ALTER TABLE visits ADD COLUMN external_event_id TEXT;
ALTER TABLE visits ADD COLUMN calendar_sync_status TEXT;
