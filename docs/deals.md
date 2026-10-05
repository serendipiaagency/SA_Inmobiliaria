# Deal Operation (FASE 24)

Deal Operation representa la **operación ya en ejecución/cierre** —
deliberadamente distinta de Lead (la oportunidad) y de Offer (la
negociación, FASE 23). Lead ≠ Offer ≠ Deal (§93 del encargo): nunca se
crea en automático ni de forma irreversible (§94) — nace de una acción
real, "Crear operación", sobre una Offer que ya está `accepted`.

## Por qué se llama `dealOperations`/`deal_operations`, y no `deals`

Antes de escribir esta FASE ya existía una tabla `deals` (junto a
`valuations`), con consumidores reales y en producción desde antes:

- **`pages/admin/operaciones.vue`** — "Operaciones cerradas", alta manual de
  un cierre con importe/comisión, y su toggle de comisión pagada.
- **`server/api/admin/saas/deals-revenue.get.ts`** — el dashboard de ingresos
  (`pages/admin/ingresos.vue`), agregado por mes y por comercial.
- **`server/api/admin/[resource]/[id]/performance.get.ts`** — rendimiento
  comercial.
- **Ficha de Cliente, pestaña Resumen** — `totals.deals`/`totals.dealsVolume`/
  `totals.commission`.

Esa tabla es un **apunte plano de una venta/alquiler ya cerrada**, para
comisiones — sin etapas, sin comprador/vendedor como Contact real, sin
oferta vinculada. Son dos entidades distintas a propósito, no la misma cosa
con dos nombres:

| | `deals` (legacy) | `dealOperations` (FASE 24) |
|---|---|---|
| Qué es | Apunte contable de un cierre ya hecho | La operación completa, con pipeline |
| Comprador/vendedor | Texto libre (`clientName`) | Contact real (`buyerContactId`, `deal_operation_sellers`) |
| Oferta | No existe el concepto | Vinculada 1:1 a una Offer `accepted` |
| Etapas | No tiene | 8 etapas reales, con histórico append-only |
| Cómo nace | Alta manual en `/admin/operaciones` | "Crear operación" sobre una Offer aceptada |
| Cómo se cierra | Ya nace cerrada | `closeDeal()` — y ahí crea su puente legacy |

Renombrar la tabla legacy no era una opción sin permiso explícito del
propietario (datos vivos, consumidores en producción); inventar un nombre
que colisionara con ella (como intentó esta FASE al principio, hasta que
`npm run typecheck` lo hizo evidente) tampoco. De ahí `deal_operations`/
`deal_operation_sellers`/`deal_operation_stage_history` — nombres que no
pisan nada existente.

**Rutas también separadas a propósito**: la API vive bajo
`/api/admin/saas/deal-operations` (área `crm` en `adminRouteMatrix.ts`) y la
ficha bajo `/admin/deal-operations/:id` — nunca `saas/deals*`, que sigue
siendo, sin tocar, la ruta de la tabla legacy (área `finance`).

**Una única clave de ruta, a propósito.** Toda la API — listar, ficha,
crear, cambiar de etapa, cerrar, cancelar — vive en dos ficheros,
`deal-operations.get.ts` (lista, o su ficha con `?id=`) y
`deal-operations.post.ts` (crea sin `action`; transiciona con
`action: 'stage'|'close'|'cancel'` + `id` en el body), en vez del `GET
/deal-operations/:id` y `POST /deal-operations/:id/{stage,close,cancel}`
más RESTful con los que se escribió esta FASE al principio. El motivo no es
de diseño: `npm run typecheck` empezó a fallar en CI con TS2589 ("Type
instantiation is excessively deep") en un componente sin relación
(`AIAnalysis.vue`) en cuanto se añadía una segunda clave de ruta nueva.

Medido en un worktree limpio de `main`, añadiendo rutas una a una: el
margen que `nitro-fetch-warmup.ts` había ganado en su día (P1-14,
`docs/production-hardening-audit.md`, +150 rutas) se había agotado por el
crecimiento acumulado de las FASE 15-23 hasta quedar en **una sola ruta
nueva** de margen en todo el proyecto — no algo específico de esta FASE.
Tipar explícitamente la respuesta de la ficha, ensanchar la URL a `string`
en la llamada que paga la factura, y añadir un segundo `$fetch` de
calentamiento no lo arreglaron; sólo bajar el número de claves de ruta
nuevas a una lo hizo. De ahí que todo el pipeline de Deal Operation quepa
en una sola clave (`GET`/`POST /api/admin/saas/deal-operations`) — no
porque el diseño REST con `/:id/acción` fuera incorrecto, sino porque el
margen real del pipeline de CI no daba para las seis claves que ese diseño
necesitaba. Ver P1-14 para el mecanismo completo y cómo volver a medir el
techo cuando haga falta.

## El puente, una sola dirección

Al cerrar una `dealOperations` con `closeDeal()`
(`server/utils/deals/service.ts`), se crea además un apunte en la tabla
legacy `deals` — así el dashboard de ingresos y el panel de comisiones que
ya existían ven también lo cerrado por este pipeline nuevo, sin migrar ni
tocar su esquema ni sus consumidores. El id de ese apunte se guarda en
`dealOperations.legacyDealId`, sólo como trazabilidad.

Es **unidireccional**: este pipeline nunca lee de vuelta la tabla legacy.
`commissionRate`/`commissionAmount` nacen en `0` en el apunte creado — el
admin los rellena luego con el `PATCH` legacy ya existente
(`deals/[id].patch.ts`), exactamente igual que hoy con un cierre dado de
alta a mano. `clientName` se resuelve de `contacts.name` (comprador),
`propertyName` con el mismo patrón de catálogo que usan las citas
(`agentProperties.reference`/calle, o `developerProperties.name`),
`agentName` de `teamMembers.name`, y `dealType` de la `transactionType`
real del inmueble (`'rent'` → `'rental'`, cualquier otra cosa → `'sale'`).

## Modelo (migración 0079)

Tres tablas:

- **`deal_operations`** — la operación. `propertyId`+`propertyKind` (mismo
  patrón de dos catálogos que `visits`/`tasks`/`offers`), `buyerContactId`
  (Contact real), `acceptedOfferId` (índice único — una operación por
  oferta), y opcionalmente `leadId`/`buyerRequirementId`/`commercialId`.
  `agreedAmount`/`currency` se copian de la Offer aceptada al crear (§103)
  y no se editan sueltos.
- **`deal_operation_sellers`** — igual criterio que `offer_sellers`
  (FASE 23): este proyecto no tiene una tabla `PropertyContact`, así que
  quién vende en esta operación concreta se copia de la oferta al crear.
- **`deal_operation_stage_history`** — append-only, mismo principio que
  `lead_stage_history` (FASE 13): nunca se sobrescribe un movimiento
  anterior.

Además, `visits.deal_id` (nullable, aditiva) — mismo nombre de columna que
ya usa `tasks.deal_id` (FASE 22, migración 0077, pensada desde entonces
para esta FASE). Ambas apuntan a `deal_operations`, nunca a la tabla
legacy `deals`.

## Etapas

`accepted_offer → reservation → deposit_contract → financing →
documentation → notary → signature → closed`. `stage` (dónde está en el
proceso) y `status` (`active`/`closed`/`cancelled`) son conceptos separados
a propósito: una operación puede estar en cualquier etapa y seguir activa,
pero sólo `closeDeal()` la lleva a `closed` en ambos campos a la vez.

Notaría y Firma **no son campos de fecha nuevos**: son Appointments reales
(`visits` con `type: 'notary'`, `dealId` puesto), así que aparecen en
Calendar automáticamente — sin un "DealCalendar" aparte (§109/§126).

## `DealService` — el único sitio que crea o transiciona un Deal

`server/utils/deals/service.ts`:

- `createDeal()` — exige una Offer `accepted`, rechaza si ya existe una
  operación para esa oferta (409), copia importe/moneda/compradores/
  vendedores, inserta la primera fila de histórico, registra
  `DEAL_CREATED`.
- `transitionDealStage()` — mueve de etapa; rechaza `toStage: 'closed'`
  (esa es `closeDeal()`) y cualquier movimiento si la operación ya no está
  `active`.
- `closeDeal()` — pone `stage`/`status` en `closed`, `closedAt`, sincroniza
  el inmueble (ver abajo), crea el puente legacy, registra `DEAL_CLOSED`.
- `cancelDeal()` — exige motivo, pone `status: 'cancelled'`; **no borra
  nada** (§114): histórico, Offer, Appointments, Tasks y Activity quedan
  intactos.
- `listDeals()` / `getDealDetail()` — filtros (propiedad, comprador,
  vendedor, lead, comercial, estado, etapa) y la ficha completa con
  histórico, citas, tareas y próxima acción derivada.

## Sincronización del estado del inmueble (§111/§112)

Sólo se toca cuando el catálogo tiene de verdad un valor que lo
represente — nunca se inventa uno:

- `propertyKind === 'agent'` y `transactionType === 'sale'` → al cerrar, se
  pone `agentProperties.status = 'sold'`.
- Cualquier otra combinación (alquiler en 2ª mano — no existe un valor
  "rented" en el catálogo; cualquier obra nueva — su `status` es sólo fase
  de construcción, nunca estado de venta) → **no se toca nada**,
  deliberadamente, sin inventar una taxonomía que el catálogo no tiene.

## Próxima acción (§122)

Igual mecanismo que Lead (`syncLeadNextAction`, FASE 22): la más próxima
entre la primera Task abierta con `dueAt` y la primera Appointment
`scheduled` futura, ambas filtradas por `dealId` — sin ningún sistema de
seguimiento nuevo.

## Oficina, Kanban y documentos vinculados (bloque N6)

- **Oficina** — `deal_operations.office_id` (migración 0086) es la entidad
  Oficinas: `updateDeal()` sólo acepta una oficina viva de la organización
  (ajena o borrada = 404) y, junto con ella, el comercial
  (`team_members` de la organización). Se edita en la ficha y se filtra en el
  listado/Kanban (`officeId`).
- **Kanban** — `/admin/deal-operations`: una columna por cada una de las 8
  etapas. Mover una tarjeta (arrastrar o «Mover a…») llama a
  `transitionDealStage()`, que deja la fila append-only en
  `deal_operation_stage_history` (con `actorId` y `reason` opcional) y
  `DEAL_STAGE_CHANGED` en Activity; soltar en «Cerrada» pide confirmación y
  llama a `closeDeal()`. El historial de la ficha enseña quién movió cada
  etapa y el motivo.
- **Reserva, arras y contratos** — las columnas `deal_operation_id` de
  `reservations`, `deposit_payments` y `contracts` (migración 0086).
  `linkDealRecord()`/`unlinkDealRecord()`: registro de otra agencia = 404;
  ya vinculado a OTRA operación = 409 (primero se desvincula de aquélla);
  desvincular algo que no es de esta operación = 404; vincular dos veces lo
  mismo es idempotente. Nada se borra. Cada movimiento deja
  `DEAL_RECORD_LINKED`/`DEAL_RECORD_UNLINKED` en Activity. Arras y contratos
  son del área **Finanzas**: la ficha sólo los lee si el usuario puede leer
  Finanzas, y vincularlos exige poder escribir en Finanzas (403 si no); la
  reserva basta con CRM, como esta ruta. Reservas, Depósitos y Contratos
  enseñan «Operación #…» bajo cada fila vinculada.
- **Papelera** — una operación con `deleted_at` no sale en el listado y su
  ficha es 404 (tampoco se le cuelgan tareas nuevas). No hay todavía una
  acción de borrar operaciones en el panel.

### API (las dos rutas de siempre)

- `GET /api/admin/saas/deal-operations` — filtros `propertyId`(+`propertyKind`),
  `buyerContactId`, `sellerContactId`, `leadId`, `commercialId`,
  `officeId`, `status`, `stage`. Cada fila trae `buyerName`,
  `propertyName`, `commercialName`, `officeName` y `linkedRecords`. Con
  `?id=` devuelve la ficha: `deal` (etiquetada), `sellers`, `stageHistory`
  (con `actorName`), `appointments`, `tasks` (sin las de la papelera),
  `nextAction`, `acceptedOffer` y `records` (`reservations`, `deposits`,
  `contracts`, cada uno con `linked` y `candidates`, y `financeVisible`).
- `POST /api/admin/saas/deal-operations` — además de crear/`stage`/`close`/
  `cancel`: `action: 'update'` (`officeId`, `commercialId`) y
  `action: 'link' | 'unlink'` (`kind`: `reservation | deposit | contract`,
  `recordId`).

## El menú: «Operaciones» y la pantalla antigua

- **CRM → Operaciones** lleva ahora a `/admin/deal-operations` (Kanban y
  lista de este pipeline).
- La pantalla antigua `/admin/operaciones` (tabla legacy `deals`) **sigue en
  la misma URL** — ningún enlace se rompe — y en el menú pasa a llamarse
  **Finanzas → «Cierres y comisiones»**, que es lo que es: el registro plano
  de cierres para comisiones e Ingresos. Enlaza al pipeline, y el pipeline
  enlaza a ella.

## Dónde se ve

- **CRM → Operaciones** (`/admin/deal-operations`) — Kanban por etapas y
  lista, con filtros por estado, oficina, comercial y catálogo.
- **`/admin/deal-operations/:id`** — la ficha: etapa (con motivo), historial
  de etapas, «Reserva, arras y contratos», tareas (crear y editar), citas,
  partes con oficina y comercial editables, la oferta aceptada con su
  negociación completa, la cronología de **Actividad** y las comunicaciones
  con el comprador.
- **Detalle de una oferta aceptada** — «Crear operación» o «Ver operación».
- **Ficha de Cliente → pestañas "Ofertas" y "Operaciones"**.

## Lo que no hace (a propósito)

- **No hay pestañas de Documentos ni Notas** en la ficha de la operación:
  las reservas, arras y contratos reales se vinculan (arriba), pero no hay
  un gestor documental propio de la operación.
- La tabla legacy `deals` **no se toca, no se migra, no se renombra**. Sigue
  siendo la fuente para todo lo que ya la usaba, y el puente sólo añade
  filas — nunca lee, nunca actualiza una fila existente.
- No se vincula una operación a una reserva por el inmueble de forma
  automática: `reservations.property_id` no lleva catálogo y adivinarlo
  podría unir cosas que no son. Se vincula a mano desde la ficha.
