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
`counterOffer()` (`submitted`/`countered` → `countered`, términos nuevos) ·
`newOffer()` (bloque N6: `countered` → `submitted`, la nueva oferta del
comprador en respuesta a una contraoferta; revisión `new_offer`,
`OFFER_RESUBMITTED` en Activity) ·
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

## Términos y referencias (bloque N6)

Oferta, contraoferta y nueva oferta llevan **los mismos términos**:
importe, condiciones, condición de financiación y vencimiento
(`normalizeOfferTerms()`):

- `financeCondition` es del catálogo `OFFER_FINANCE_CONDITIONS`
  (`utils/pipelineCatalog.ts`): `cash`, `mortgage_subject`,
  `mortgage_preapproved`, `mortgage_approved`, `other`. Otro valor = 422.
  Los textos libres que ya hubiera guardados se siguen mostrando tal cual.
- `expiration` en formato de fecha del proyecto; una fecha sola
  (`2026-11-30`) vence al final del día (`23:59:59`). Mal formada = 422.
- `actorType` sólo `buyer | seller | user | system` (422 si no).
- Al crear, `leadId`, `buyerRequirementId`, `matchId` (de la tabla de
  matches de su catálogo) y `commercialId` tienen que ser de la
  organización (404 si no), además del inmueble (vivo), comprador y
  vendedores. El comprador no puede ser también vendedor (422).

El historial (`offer_revisions`) se lee en orden de inserción; cada
revisión trae `actorName` cuando la registró un usuario del panel.

### API (sin rutas nuevas)

- `GET /api/admin/saas/offers` — filtros `propertyId`(+`propertyKind`) o
  sólo `propertyKind`, `buyerContactId`, `sellerContactId`, `leadId`,
  `commercialId` y `status` (un estado u `open` = borrador/enviada/
  contraoferta). Cada fila trae `buyerName`, `sellers`, `propertyName`,
  `commercialName`, `dealId` (su operación, si existe) e `isExpired`.
- `GET /api/admin/saas/offers/:id` — `{ offer, sellerContactIds, revisions }`
  con la oferta ya etiquetada.
- `POST /api/admin/saas/offers/:id/counter` — `kind: 'counter'` (por
  defecto) o `kind: 'new_offer'`, con `amount`, `conditions`,
  `financeCondition`, `expiration` y `actorType`.

## Dónde se crea una oferta

Sólo desde disparadores reales — nada se inventa para completar la lista
del encargo:

- **CRM → Ofertas** (`/admin/ofertas`, bloque N6) — «+ Nueva oferta» con
  inmueble, comprador, vendedor(es), comercial, importe, condiciones,
  financiación y vencimiento (`components/admin/offers/OfferFormModal.vue`).
- **Ficha de la propiedad** (los dos catálogos, panel «Ofertas») — la misma
  ventana con el inmueble ya puesto.
- **Resultado de visita** (§86) — "Crear oferta" en el modal de
  `/admin/visitas`.
- **Compatibilidades** (§87) — "Crear oferta" en un match ya **seleccionado**.
- **Ficha de Cliente → "Ofertas" → "+ Nueva oferta"** (§88) — ahora con la
  misma ventana completa, con el comprador fijado.

Todas crean un **borrador** (`draft`), nunca lo envían solas.

## Activity

`OFFER_CREATED` / `OFFER_SUBMITTED` / `OFFER_COUNTERED` /
`OFFER_RESUBMITTED` / `OFFER_ACCEPTED` / `OFFER_REJECTED` /
`OFFER_WITHDRAWN` / `OFFER_EXPIRED` — una por cada transición real, incluida
la automática del cron. `contactId` en el evento es siempre
`buyerContactId`.

## Dónde se ve

- **CRM → Ofertas** — listado global con filtros (estado, catálogo,
  comercial, inmueble, comprador, vendedor). Una fila abre
  `components/admin/offers/OfferDetailModal.vue`: partes, términos actuales,
  acciones según estado (enviar; contraoferta del vendedor; nueva oferta del
  comprador; aceptar —con la revisión vista, 409 si quedó obsoleta—;
  rechazar; retirar; crear operación) y el **historial inmutable**.
  `?offer=<id>` la abre directamente (enlaces de la cronología).
- **Ficha de la propiedad** — panel «Ofertas» con el mismo detalle.
- **Ficha de Contacto / Lead / Cliente → pestaña "Ofertas"**; en la de
  Cliente, «Contraoferta» e «Historial» abren el mismo detalle (ya no hay
  contraoferta de sólo importe).
- **Ficha de la operación** — «Oferta aceptada» con sus términos y «Ver la
  negociación».

## Privado (§92)

Ninguna oferta se expone en el DTO público de una propiedad, en el
Constructor Web ni en la web pública — todo vive bajo
`/api/admin/saas/offers/**`, detrás de `requireOrgScope()` como el resto del
panel. Ningún código de este proyecto que sirve páginas públicas importa
`server/utils/offers/service.ts`.

## Lo que no hace (a propósito)

- `actorType: 'buyer'`/`'seller'` deja que el comercial registre un
  movimiento que le llegó por teléfono o en persona — no hay un portal donde
  comprador/vendedor actúen ellos mismos.
- `currency` es de la oferta, no de la organización (por defecto `eur`).
- Una oferta no se edita ni se borra: se retira, y la siguiente negociación
  es otra oferta.
