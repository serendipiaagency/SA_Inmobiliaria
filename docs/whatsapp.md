# WhatsApp para avisos de citas (Twilio)

> Esto cubre sólo los **avisos automáticos de cita** con las credenciales
> de Twilio del Worker. La **bandeja de WhatsApp por agencia** (recibir y
> responder, compartir propiedades, llamadas) es otra pieza:
> [docs/communications.md](./communications.md).

Los avisos de cita (confirmación, recordatorios de 24 h y 1 h, cancelación,
cambio) salen por tres canales: aviso interno (siempre), email (Resend) y
WhatsApp. El canal WhatsApp se reportaba honestamente como "no conectado";
desde `server/utils/whatsapp.ts` se envía de verdad por Twilio cuando hay
credenciales, y el webhook de estado dice si llegó.

## Qué hace falta

| Secreto del Worker | Qué es |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx…` (Twilio Console → Account info) |
| `TWILIO_AUTH_TOKEN` | El auth token de la cuenta. También firma el webhook de estado. |
| `TWILIO_WHATSAPP_FROM` | El remitente: `+14155238886` (sandbox de Twilio) o el número aprobado, con o sin `whatsapp:`. |
| `TWILIO_WHATSAPP_CONTENT_SID` (opcional) | Una plantilla aprobada (`HX…`). Ver "la ventana de 24 h". |
| `WHATSAPP_DEFAULT_COUNTRY_PREFIX` (opcional) | Prefijo para teléfonos guardados sin `+` (p. ej. `+34`). Sin él, un teléfono sin prefijo internacional se rechaza en vez de adivinar el país. |

`wrangler secret put <NOMBRE>` en producción (`--env staging` en staging).
Sin los tres primeros, `isWhatsAppConfigured()` es falso y **nada cambia**:
la fila de `appointment_notifications` queda `delivered = 0` con el motivo,
y Estado del sistema enseña "WhatsApp para avisos de citas: sin configurar".

## Cómo probar sin cuenta aprobada: el sandbox

Twilio da un sandbox de WhatsApp gratuito: el remitente es `+14155238886` y
cada teléfono destino tiene que haber enviado antes `join <palabra>` (la
palabra la enseña la consola) a ese número. Con eso, reservar una visita
desde la web pública con un teléfono unido al sandbox manda el aviso real.

## La ventana de 24 horas (límite de WhatsApp, no nuestro)

Un negocio sólo puede escribir texto libre a un cliente durante las 24 h
siguientes al último mensaje que **ese cliente** le envió. Fuera de esa
ventana WhatsApp exige una plantilla aprobada. Consecuencia práctica:

- La **confirmación** de una cita reservada desde la web puede caer fuera
  (el cliente nunca nos escribió por WhatsApp). El **recordatorio de 24 h**
  casi siempre cae fuera.
- Con `TWILIO_WHATSAPP_CONTENT_SID` configurado, el aviso se envía con esa
  plantilla y su variable `{{1}}` recibe el texto del aviso: funciona dentro
  y fuera de la ventana. Crear y aprobar la plantilla es un trámite en la
  consola de Twilio (Content Template Builder → WhatsApp → aprobación de
  Meta, normalmente en horas).
- Sin plantilla, el texto se manda tal cual: funciona en el sandbox y dentro
  de la ventana; fuera de ella Twilio responde con el error 63016 y eso es
  lo que queda registrado en la fila (no "enviado").

## Qué significa `delivered`

`delivered = 1` al insertar la fila significa **"Twilio lo aceptó"** (igual
que el email significa "Resend lo aceptó"). La entrega real la confirma el
webhook `POST /api/twilio/status`, que Twilio llama con `MessageSid` y
`MessageStatus`:

- `delivered` / `read` → la fila queda `delivered = 1` sin error.
- `failed` / `undelivered` → `delivered = 0` y el motivo (con el `ErrorCode`)
  en `error_message`.
- `queued` / `sent` → se ignora (todavía nada).

El webhook se registra al enviar (`StatusCallback`) con el origen público
de la petición que generó el aviso; los recordatorios del cron no tienen
petición y usan `PRIMARY_DOMAIN` si está configurado — sin él se envían
igual, pero sin confirmación de entrega. La firma `X-Twilio-Signature`
(HMAC-SHA1 con el auth token sobre URL + parámetros) se comprueba siempre;
una llamada sin firma válida recibe 403 y no toca nada. Un SID que no es
nuestro se responde 200 y se ignora.

## Piezas

| Pieza | Fichero |
| --- | --- |
| Envío, normalización de teléfonos, firma del webhook, clasificación de estados | `server/utils/whatsapp.ts` |
| Uso en los avisos de cita | `server/utils/appointments/notifications.ts` |
| Webhook de estado | `server/api/twilio/status.post.ts` |
| Columna `external_id` (SID de Twilio) | migración `0064` |
| Estado en el panel | Sistema → Estado del sistema, fila "WhatsApp para avisos de citas" |
| Pruebas | `test/unit/whatsapp.test.ts` (fetch simulado; firma calculada aparte con `node:crypto`) |

## Qué NO es esto

El canal `whatsapp` de **Publicación multicanal** (difusión de anuncios)
sigue sin adaptador: eso es otra cosa — mensajes a listas, con plantillas
de marketing y consentimiento — y `server/utils/publication/channels.ts` lo
sigue marcando `implemented: false`. Esto cubre el caso concreto que los
clientes esperaban: que la cita que reservan les llegue al WhatsApp.
