# Emails transaccionales (Resend)

Cada evento real de la plataforma (nuevo lead, cita confirmada, contrato
enviado, depósito recibido…) genera un email real, registrado y separado por
organización. Este documento cubre cómo funciona, la configuración manual en
Resend/Cloudflare, y los 14 disparadores implementados.

## Arquitectura

`server/utils/email/` es el sistema completo:

- **`templates.ts`** — registro de las 15 plantillas (14 pedidas + `appointment_cancelled`,
  que ya existía y se ha migrado al mismo sistema). Cada una declara su
  `kind` (`transactional` | `commercial`), a quién va dirigida
  (`client` | `internal` | `user`) y genera asunto + cuerpo en `es`/`en`.
- **`layout.ts`** — la plantilla HTML responsiva compartida (tablas + estilos
  en línea, lo único que los clientes de correo reales renderizan de forma
  consistente) con la marca de cada organización (logo/color/nombre) y un
  pie que distingue estructuralmente transaccional de comercial: solo el
  comercial lleva enlace de cancelación.
- **`send.ts`** — `sendTransactionalEmail()` resuelve la identidad de envío
  de la organización (remitente, responder-a, idioma — con reserva a los
  valores de plataforma si la organización no ha configurado los suyos),
  renderiza la plantilla, y guarda una fila en `email_log` **antes** de
  intentar el envío — así el intento queda registrado incluso si Resend no
  responde. `sendInternalNotification()` es el mismo mecanismo para las
  notificaciones al equipo (nuevo lead, mensaje de contacto, reclamación,
  contrato aceptado): va a los "destinatarios internos" configurados en la
  organización, no a un cliente.
- **`resendClient.ts`** — llamada real a la API de Resend (fetch plano, sin
  SDK, mismo patrón que `server/utils/stripe.ts`) y la comprobación real de
  dominio verificado.
- **`signature.ts`** — verifica la firma Svix de los webhooks de Resend
  (`Stripe-Signature` de Stripe es HMAC-SHA256 hex sobre
  `timestamp.cuerpo`; Svix es HMAC-SHA256 **base64** sobre
  `id.timestamp.cuerpo` — esquemas distintos, cada uno con su propia
  implementación).
- **`resendEvents.ts`** — aplica un evento de webhook ya verificado a
  `email_log` (entregado/rebotado/reclamación).

## Nunca se marca "entregado" sin que Resend lo confirme

`email_log.status` solo pasa a `delivered`/`bounced`/`complained` desde
`server/api/resend/webhook.post.ts` — nunca desde el envío síncrono inicial,
que solo prueba que Resend *aceptó* la petición (`sent`), no que un buzón la
recibió. Es la misma distinción que ya existe para los pagos de Stripe
(`docs/stripe-payments.md`).

## Cola de fallos y reintentos

Cada fila de `email_log` guarda el email completo ya renderizado
(`from_header`, `reply_to`, `subject`, `html`) — no solo metadatos — así un
reintento no necesita volver a resolver la marca de la organización ni
volver a renderizar la plantilla. Un envío fallido queda `queued` con
`next_retry_at` (backoff: 2, 10, 30, 120, 360 minutos); `server/tasks/notifications/retry-email-queue.ts`
(cron horario) reintenta cada fila vencida. Tras 5 intentos pasa a `failed`
de forma permanente ("reintentos limitados") — visible en
`/admin/emails` para que un humano lo note, nunca reintentado
indefinidamente en silencio.

## Idempotencia del webhook

Igual que `server/api/stripe/webhook.post.ts`: un `INSERT` que reclama el
`svix-id` antes de procesarlo (no *check-then-act*, que sería inseguro ante
redenvíos concurrentes) en `resend_webhook_events` — un redenvío de Svix
responde 200 sin reprocesar nada.

## Transaccional vs. comercial

De las 15 plantillas, solo `saved_search_alert` es `commercial` — el resto
son transaccionales (confirman una acción del propio destinatario, o son
avisos operativos internos) y **nunca** llevan enlace de cancelación
(`layout.ts` lo aplica estructuralmente por `kind`, no es una decisión que
tome cada plantilla). Una reclamación de spam (`email.complained`) sobre un
email comercial da de baja automáticamente esa búsqueda guardada — sin
esperar a que el destinatario encuentre el enlace de cancelación.

## Configuración por organización

`/admin/organizations` (solo super_admin, mismo sitio que el dominio propio
de cada organización — ver `docs/multi-domain.md`) expone:

- **Nombre y dirección del remitente** — si no se configuran, se usa el
  remitente de plataforma (`notificaciones@sa-inmobiliaria.com`).
- **Responder a** — opcional; si no se configura, Resend usa el remitente.
- **Destinatarios internos** (JSON, p. ej. `["ops@empresa.com"]`) — a quién
  llegan las notificaciones de nuevo lead/contacto/reclamación/contrato
  aceptado. Vacío por defecto: sin destinatarios configurados, esas
  notificaciones simplemente no se envían (no hay error, no hay reintento
  infinito por un buzón que no existe).
- **Idioma** — `es`/`en`, usado por defecto en las plantillas de esa
  organización (cada envío puede además pasar un idioma explícito).

El campo "dominio verificado" es de solo lectura: se recalcula
automáticamente contra la API de Resend cada vez que se guarda la dirección
del remitente (ver siguiente sección) — nunca es un interruptor manual.

## Configuración manual en Resend + Cloudflare

1. **Resend Dashboard → API Keys** — crear una clave y guardarla como
   secreto del Worker:
   ```
   wrangler secret put RESEND_API_KEY
   ```
2. **Resend Dashboard → Domains → Add Domain** — el dominio desde el que se
   quiere enviar (p. ej. `sa-inmobiliaria.com`, o el propio de una
   organización si cada una envía desde el suyo). Resend da los registros
   DNS a añadir (normalmente `TXT` para SPF/DKIM y opcionalmente `MX` si se
   quiere recibir en ese dominio) — añadirlos donde esté gestionado el DNS
   de ese dominio.
3. Esperar a que el estado pase a **Verified** en el Dashboard de Resend
   (minutos, hasta 72h si la propagación DNS tarda). Sin esto, Resend
   rechaza enviar desde ese dominio aunque `RESEND_API_KEY` esté bien
   configurado.
4. Guardar la dirección del remitente en `/admin/organizations` (paso
   anterior) — al guardar, la plataforma consulta la API de Resend y marca
   "dominio verificado" según el estado real, no antes.
5. **Resend Dashboard → Webhooks → Add Endpoint** — URL:
   `https://<dominio-de-producción>/api/resend/webhook`. Eventos a
   suscribir: `email.sent`, `email.delivered`, `email.bounced`,
   `email.complained` (suscribir más no rompe nada — los no gestionados se
   ignoran).
6. Resend muestra el **Signing Secret** (`whsec_...`) de ese endpoint —
   guardarlo como:
   ```
   wrangler secret put RESEND_WEBHOOK_SECRET
   ```
7. Repetir 5-6 para staging con su propia URL si se prueban envíos ahí —
   cada entorno tiene su propio signing secret.

Sin el paso 1, todo envío queda honestamente `not_connected` (mismo patrón
que Stripe). Sin los pasos 5-6, los emails se envían con normalidad
(`status=sent`) pero la plataforma nunca sabrá si de verdad llegaron,
rebotaron o fueron marcados como spam — a diferencia de los depósitos de
Stripe, aquí no hay una tarea de reconciliación que consulte el estado
después: `email_log` se quedaría en `sent` para siempre, aunque el correo
nunca llegara a su destino. El webhook (pasos 5-6) es la única vía a
`delivered`/`bounced`/`complained`.

## Los 15 disparadores

| Plantilla | Disparador real | Destinatario |
|---|---|---|
| `lead_created` | Cualquier alta de lead (`server/utils/leads.ts`, usado por el formulario de contacto, reservas de agente, etc.) | Interno |
| `contact_message` | Formulario de contacto (`/api/public/contact`, `type=contact`) | Interno |
| `complaint` | Formulario de reclamación (`/api/public/contact`, `type=complaint`) | Interno |
| `appointment_created` | Reserva de cita (`/api/public/agents/:slug/book`) | Cliente |
| `appointment_modified` | Cita reprogramada (admin o el propio cliente) | Cliente |
| `appointment_cancelled` | Cita cancelada (admin o el propio cliente) | Cliente |
| `appointment_reminder_24h` | Cron horario, 24h antes | Cliente |
| `appointment_reminder_1h` | Cron por minuto, 1h antes | Cliente |
| `contract_sent` | Un admin envía un contrato (`/api/admin/saas/contracts/:id/send`) | Cliente |
| `contract_accepted` | El cliente acepta el contrato (`/api/public/contracts/:token/accept`) | Interno |
| `deposit_received` | Webhook de Stripe confirma el pago (`checkout.session.completed`, `payment_status=paid`) | Cliente |
| `payment_failed` | Webhook de Stripe confirma el fallo (`checkout.session.async_payment_failed`, `payment_intent.payment_failed`) | Cliente |
| `user_welcome` | Un admin crea una cuenta (`/api/admin/users`) — nunca reenvía la contraseña que se tecleó al crearla; incluye un enlace para que el nuevo usuario defina la suya | Usuario nuevo |
| `password_reset` | `/api/auth/forgot-password` | Usuario |
| `saved_search_alert` (comercial) | Cron horario, nuevas coincidencias | Cliente (suscrito) |

## Historial en el panel

`/admin/emails` muestra el historial real de envíos de la organización —
plantilla, destinatario, tipo (transaccional/comercial), estado e intentos.
`/admin/depositos` tiene además su propio historial de eventos de Stripe
(no de email).

## Validación local

`test/unit/email.signature.test.ts` y `test/unit/email.send.test.ts` cubren
firma Svix, éxito/fallo/reintento agotado, identidad de remitente por
organización (con reserva a la de plataforma), notificaciones internas, y
aplicación de eventos de webhook (incluida la baja automática por
reclamación) — con un proveedor simulado (`fetch` interceptado) para el
camino de éxito y el código real de "no conectado" (sin red) para el resto.
`tests/e2e/resend-webhook.spec.ts` y `tests/e2e/transactional-email.spec.ts`
cubren la capa HTTP: firma/idempotencia del webhook, disparadores reales
(alta de usuario, formulario de contacto), aislamiento entre
organizaciones, y el flujo de recuperación de contraseña. Ningún test envía
un email real ni usa una clave real de Resend.
