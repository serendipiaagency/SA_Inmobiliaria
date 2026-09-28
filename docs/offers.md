# Offer (FASE 23)

Offer representa una **propuesta económica negociable** — deliberadamente
distinta de Task (trabajo pendiente), Appointment (tiempo reservado) y Deal
(la operación ya en ejecución, FASE 24).

## Modelo

Tres tablas (migración 0078):

- **`offers`** — la oferta. `currentAmount`/`current*` son una **proyección**
  del estado actual, para leer sin JOIN. Referencia `propertyId`+
  `propertyKind` (los dos catálogos, mismo patrón que `visits`/`tasks`),
  `buyerContactId` (Contact real — nunca una entidad Buyer paralela),
  y opcionalmente `leadId`, `buyerRequirementId`, `matchId`
  (`property_matches.id`, FASE 11) y `commercialId`.
- **`offer_sellers`** — quiénes son los vendedores (Contact real, 0 o más).
  Este proyecto **no tiene una tabla `PropertyContact`** que registre la
  propiedad de un inmueble (auditado: ninguna FASE anterior la creó), así
  que quién es vendedor de una oferta concreta lo decide quien la crea —
  fila a fila, no una relación de propiedad global del inmueble.
- **`offer_revisions`** — el histórico, **append-only**. §79 del encargo es
  categórico: nunca sobrescribir 620.000 → 630.000 → 625.000 perdiendo las
  cantidades anteriores. Cada revisión guarda el importe, condiciones,
  condición financiera, expiración, quién la hizo (`actorType`/`actorId`) y
  cuándo — íntegras, para siempre.

## `OfferService` — el único sitio que escribe

`server/utils/offers/service.ts`. **No hay un `PATCH` genérico** — §84 del
encargo lo prohíbe explícitamente ("no modificar status/amount directamente
desde UI") — sólo funciones con nombre, una por transición real:

`createOffer()` (→ `draft`) · `submitOffer()` (`draft` → `submitted`) ·
`counterOffer()` (`submitted`/`countered` → `countered`, importe nuevo) ·
`acceptOffer()` (`submitted`/`countered` → `accepted`) · `rejectOffer()`
(→ `rejected`) · `withdrawOffer()` (`draft`/`submitted`/`countered` →
`withdrawn`) · `expireOffer()` (`submitted`/`countered` con `expiration`
pasada → `expired`, sólo la llama el cron, nunca la UI).

Cada una valida qué transiciones son legales desde el estado actual (422 si
no), inserta una revisión inmutable, y sólo entonces actualiza la
proyección `offers.current*` — en ese orden, siempre.

## Concurrencia (§85)

Dos personas pueden estar mirando la misma oferta a la vez: una acepta justo
cuando la otra acaba de contraofertar. `acceptOffer()` admite un
`expectedRevisionId` opcional (el `currentRevisionId` que el cliente tenía
cuando pulsó "Aceptar"); si no coincide con el actual, responde **409** en
vez de aceptar una cantidad que ya no es la vigente. Optimistic locking
simple sobre una sola columna — no hace falta más para una tabla que un
usuario humano edita, nunca un proceso automático de alta frecuencia.

## Expiración

`server/tasks/offers/expire.ts`, cron horario (mismo slot que
`cms:expire-articles`/`leads:sla-check` — `nuxt.config.ts` `scheduledTasks`,
sin Cron Trigger nuevo). Marca `expired` las ofertas `submitted`/`countered`
cuya `expiration` ya pasó, vía `expireOffer()` — así también quedan su
revisión y su `OFFER_EXPIRED` en Activity, igual que cualquier otra
transición real. `isOfferExpired()` es el mismo cálculo en lectura, para que
un badge en la UI no tenga que esperar hasta una hora a que pase el cron.

## Dónde se crea una oferta

Sólo desde disparadores reales — nada se inventa para completar la lista
del encargo:

- **Resultado de visita** (§86) — "Crear oferta" en el modal de
  `/admin/visitas`, junto a "Crear tarea de seguimiento" (FASE 22). Crea un
  borrador con el inmueble y comprador de la visita.
- **Compatibilidades** (§87) — "Crear oferta" en un match ya **seleccionado**
  (no tiene sentido ofertar sobre uno descartado). Trae `buyerRequirementId`
  y `matchId` (`property_matches.id`) de serie.
- **Ficha de Cliente → "Ofertas" → "+ Nueva oferta"** (§88) — con un buscador
  de inmueble sobre los dos catálogos (`GET /api/admin/saas/properties/search`,
  FASE 20).

Las tres crean un **borrador** (`draft`), nunca lo envían solas: el
comercial revisa y pulsa "Enviar" desde la pestaña "Ofertas".

## Activity

`OFFER_CREATED` / `OFFER_SUBMITTED` / `OFFER_COUNTERED` / `OFFER_ACCEPTED` /
`OFFER_REJECTED` / `OFFER_WITHDRAWN` / `OFFER_EXPIRED` — una por cada
transición real, incluida la automática del cron. `contactId` en el evento
es siempre `buyerContactId`: un vendedor no ve todavía sus ofertas en su
propia cronología (ver más abajo).

## Dónde se ve

**Ficha de Cliente → pestaña "Ofertas"** — las ofertas donde esa persona es
compradora o vendedora, con sus acciones (Enviar / Contraoferta / Aceptar /
Rechazar / Retirar) según el estado. Property no tiene todavía una ficha
360º propia (mismo límite que Activity/Task en FASE 21-22) — el backend
(`GET /api/admin/saas/offers?propertyId=`) ya está listo para cuando exista.

## Privado (§92)

Ninguna oferta se expone en el DTO público de una propiedad, en el
Constructor Web ni en la web pública — todo vive bajo
`/api/admin/saas/offers/**`, detrás de `requireOrgScope()` como el resto del
panel. Ningún código de este proyecto que sirve páginas públicas importa
`server/utils/offers/service.ts`.

## Lo que esta FASE no hace (a propósito)

- No hay ficha 360º de Property donde listar sus ofertas — no existe esa
  vista de detalle en el producto todavía (mismo límite documentado en
  FASE 21/22 para Activity y Task).
- `actorType: 'buyer'`/`'seller'` en las acciones (contraofertar, aceptar…)
  deja que el comercial registre un movimiento que le llegó por teléfono o
  en persona — no hay un portal público donde comprador/vendedor actúen
  ellos mismos sobre su oferta. No se inventa esa superficie sin que el
  encargo la pida.
- `currency` es de la oferta, no de la organización: no existe una
  configuración de moneda por agencia en este proyecto, así que cada oferta
  guarda la suya (por defecto `eur`).
