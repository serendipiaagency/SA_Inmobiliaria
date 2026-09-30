-- Migration number: 0082    FASE 29 — Communications Center: property_kind en Conversation/Message/Call, timestamps de entrega/lectura en Message

-- El picker de propiedades del Centro de Comunicaciones (§124/§143 del
-- encargo) sólo buscaba en developer_properties: comms_conversations/
-- comms_messages/comms_calls.property_id asumía siempre developer_properties
-- (ver el comentario original de esa columna), así que agent_properties (2ª
-- mano) no se podía compartir. Se añade property_kind con el mismo
-- vocabulario 'agent'/'developer' que ya usan activities/tasks/
-- deal_operations/bulk_action_jobs, nunca una FK real — dos catálogos
-- Drizzle distintos, mismo criterio ya documentado en
-- activities.propertyId/propertyKind. NULL en filas existentes se lee como
-- 'developer' en el código (es lo único que existía hasta ahora): no se
-- rellena a mano porque no cambia ningún dato, sólo nombra la suposición que
-- ya era implícita.
ALTER TABLE comms_conversations ADD COLUMN property_kind TEXT; -- agent | developer; NULL en filas antiguas = developer
ALTER TABLE comms_messages ADD COLUMN property_kind TEXT;
ALTER TABLE comms_calls ADD COLUMN property_kind TEXT;

-- Message (§109/§135): el estado (queued|sent|delivered|read|failed) sólo
-- tenía un updated_at compartido — en cuanto avanza de sent a delivered, el
-- momento real del envío ya no se puede recuperar. Tres columnas, cada una
-- se rellena sólo la primera vez que el estado alcanza ese punto (nunca se
-- inventa una fecha para un estado que el proveedor no ha confirmado
-- todavía).
ALTER TABLE comms_messages ADD COLUMN sent_at TEXT;
ALTER TABLE comms_messages ADD COLUMN delivered_at TEXT;
ALTER TABLE comms_messages ADD COLUMN read_at TEXT;
