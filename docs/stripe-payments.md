# Pagos con Stripe

Hoy la plataforma solo cobra un tipo de pago: **fianzas/señales de contrato**
(`deposit_payments`, `/admin/depositos`), vía Stripe Checkout en modo
`payment`. Este documento cubre cómo se confirma un pago de verdad (webhook,
no solo la palabra del navegador del cliente), la configuración manual en
Stripe/Cloudflare, y una nota de diseño sobre Stripe Connect para cuando
haga falta cobrar directamente a nombre de cada inmobiliaria.

## Por qué un webhook, no solo el `success_url`

Antes de este bloque, la única confirmación de pago era manual: un admin
pulsaba "Comprobar estado" (`/api/admin/saas/deposits/:id/refresh`), que
consulta la Checkout Session a Stripe. Eso sigue existiendo como respaldo,
pero nunca es automático ni fiable como único mecanismo: nada obliga al
cliente a volver a `success_url` después de pagar (puede cerrar la pestaña),
y ese `success_url` en sí mismo no es una prueba de pago — es solo la URL a
la que Stripe redirige al navegador, que cualquiera podría visitar sin haber
pagado. La única fuente fiable es una llamada **servidor-a-servidor** de
Stripe con firma verificable: el webhook.

`server/api/stripe/webhook.post.ts` (público, sin sesión — la confianza viene
de la firma, no de una cookie) hace, en este orden:

1. Rechaza si `STRIPE_WEBHOOK_SECRET` no está configurado (503) — nunca
   acepta un webhook sin poder verificarlo.
2. Verifica la cabecera `Stripe-Signature` (HMAC-SHA256 sobre
   `timestamp.cuerpo_bruto`, con la ventana de 5 minutos que recomienda
   Stripe contra repetición) — `server/utils/stripe.ts#verifyStripeSignature`.
   Cualquier fallo de firma es 400.
3. Deduplica por `event_id` (Stripe reintenta entregas — "at-least-once", no
   "exactly-once") insertando primero una fila reclamando ese id en
   `stripe_webhook_events`; si ya existe, responde 200 sin reprocesar nada.
4. Aplica el evento (`server/utils/stripe.ts#applyStripeEvent`), que **nunca
   lee un importe del payload** — el importe se fijó en el servidor al crear
   la Checkout Session (`/api/admin/saas/deposits`, nunca vuelve a tocarse) y
   el webhook solo está autorizado a mover el *estado* del depósito.

Eventos gestionados:

| Evento | Efecto en `deposit_payments` |
|---|---|
| `checkout.session.completed` | Si `payment_status=paid` → `paid` + `paid_at`; si no, sigue `processing`. Captura el `payment_intent` real. |
| `checkout.session.async_payment_succeeded` | Igual que arriba. |
| `checkout.session.async_payment_failed` | → `failed`. |
| `payment_intent.payment_failed` | → `failed` (busca por `stripe_payment_intent_id`, no por sesión). |
| `charge.refunded` | → `refunded` + `refunded_at` (busca por el `payment_intent` del cargo). |

Cualquier otro tipo de evento que Stripe entregue (según lo que se suscriba
en el Dashboard) se acepta con 200 y se registra como "no gestionado" — nunca
un error, porque Stripe reintenta indefinidamente un webhook que no responde
2xx.

## Reconciliación (por si el webhook falla)

`server/tasks/payments/reconcile-deposits.ts` corre cada hora (mismo slot
`0 * * * *` que `cms:expire-articles`, ver `wrangler.toml`) y revisa los
depósitos que llevan más de 15 minutos en `processing`: si el webhook nunca
llegó (entrega fallida, el endpoint se configuró después de enviar el enlace
de pago, etc.), esta tarea consulta directamente a Stripe y corrige el
estado. No sustituye al webhook — lo respalda con una latencia de hasta una
hora en el peor caso.

## Configuración manual (Stripe Dashboard + Cloudflare)

1. **Stripe Dashboard → Developers → API keys** — copiar la Secret key
   (modo Live cuando esté listo para cobros reales; Test mientras tanto) y
   guardarla como secreto del Worker:
   ```
   wrangler secret put STRIPE_SECRET_KEY
   ```
2. **Stripe Dashboard → Developers → Webhooks → Add endpoint** — URL:
   `https://<dominio-de-producción>/api/stripe/webhook`. Eventos a
   suscribir: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.payment_failed`,
   `charge.refunded` (suscribir de más no rompe nada — los no gestionados se
   ignoran, ver arriba).
3. Stripe muestra el **Signing secret** (`whsec_...`) de ese endpoint
   concreto — guardarlo como:
   ```
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
4. Repetir 2-3 para el entorno de staging si se prueban pagos ahí, con su
   propia URL (`https://<worker-staging>/api/stripe/webhook`) — cada entorno
   tiene su propio signing secret, no se reutiliza el de producción.

Sin el paso 1, los depósitos se crean como `not_connected` (ver
`server/utils/stripe.ts`). Sin los pasos 2-3, los pagos se completan en
Stripe con normalidad pero esta plataforma nunca se entera hasta que un
admin pulsa "Comprobar estado" o corre la reconciliación horaria.

## Historial de eventos en el panel

`/admin/depositos` muestra, bajo la lista de depósitos, el historial de
eventos de Stripe recibidos para esa organización
(`/api/admin/saas/stripe-events`, respaldado por `stripe_webhook_events`) —
qué se recibió, cuándo, y qué se hizo con ello. Sirve para diagnosticar
"dije que había pagado y aquí no se refleja" sin tener que mirar el
Dashboard de Stripe.

## Nota de diseño: Stripe Connect (no implementado)

Hoy hay **una sola cuenta de Stripe para toda la plataforma**
(`STRIPE_SECRET_KEY` es un secreto de Worker, no por organización) — cuando
una inmobiliaria cobra una fianza, el dinero entra en la cuenta de Stripe de
SA Inmobiliaria, no en la suya. Es el modelo correcto mientras la propia
plataforma sea quien facture a sus clientes finales (agencias) y estas no
necesiten recibir dinero de SUS clientes directamente a través de Stripe.

Si en el futuro cada inmobiliaria necesita cobrar a **su propio** cliente
final y recibir el dinero en **su propia** cuenta bancaria (no en la de SA
Inmobiliaria), eso es [Stripe Connect](https://stripe.com/docs/connect), no
una extensión del modelo actual. Cambios que requeriría, a alto nivel:

- Una columna `stripe_account_id` en `organizations` (cuenta conectada de
  cada tenant) — el patrón de credencial-por-organización ya existe en
  `server/utils/publication/credentials.ts` (AES-GCM por org) si se necesita
  guardar algo más que un id de cuenta pública.
- Onboarding: cada organización pasa por Stripe Connect Onboarding
  (`Account Links`) para verificar su identidad ante Stripe — esto no lo
  puede completar SA Inmobiliaria en su nombre.
- `createDepositCheckout` pasaría `stripe_account: org.stripeAccountId`
  (Direct charges) o `on_behalf_of` + `transfer_data` (Destination charges)
  según si se cobra una comisión de plataforma (`application_fee_amount`) o
  no.
- El webhook tendría que distinguir eventos de la cuenta plataforma de
  eventos de una cuenta conectada (Stripe los entrega de forma distinta:
  un endpoint "Connect" recibe `account` en el payload).

No se ha implementado nada de esto — la tabla `deposit_payments` ya tiene
`organization_id`, pero ninguna columna de cuenta conectada, y
`server/utils/stripe.ts` sigue leyendo una única clave de plataforma.
