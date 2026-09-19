-- Migration number: 0064    Id externo (Twilio) en appointment_notifications
--
-- El canal WhatsApp de los avisos de cita pasa a enviarse de verdad por
-- Twilio (server/utils/whatsapp.ts). Twilio devuelve un SID por mensaje y
-- después llama al webhook de estado (server/api/twilio/status.post.ts)
-- diciendo si llegó, se leyó o falló; para actualizar la fila correcta hace
-- falta guardar ese SID. Nullable: las filas de email e internas, y las de
-- WhatsApp anteriores a esto, no tienen ninguno.
--
-- Aditiva (ADD COLUMN nullable + índice).

ALTER TABLE appointment_notifications ADD COLUMN external_id TEXT;
CREATE INDEX appointment_notifications_external ON appointment_notifications (external_id);
