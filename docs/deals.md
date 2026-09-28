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

**Rutas también separadas a propósito**: `/api/admin/saas/deal-operations*`
y `/admin/deal-operations/:id`, nunca `saas/deals*` — que sigue siendo,
sin tocar, la ruta de la tabla legacy (`area('finance')` en
`adminRouteMatrix.ts`). La nueva vive bajo `area('crm')`.

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

## Dónde se ve

- **Ficha de Cliente → pestaña "Ofertas"** — botón "Crear operación" sobre
  una oferta `accepted` sin operación todavía; "Ver operación →" si ya
  existe.
- **Ficha de Cliente → pestaña "Operaciones"** — las operaciones donde esa
  persona es compradora o vendedora.
- **`/admin/deal-operations/:id`** — la ficha 360º de la operación: Resumen,
  control de etapa, Timeline, Tareas, Citas, Partes.

## Lo que esta FASE no hace (a propósito)

- **No hay pestañas de Documentos ni Notas** en la ficha de la operación
  (§116 prohíbe explícitamente las "tabs falsas"): este proyecto no tiene
  una infraestructura transversal de Document/Note que reutilizar —
  auditado, no existe en ninguna FASE anterior. Inventar una sólo para esta
  ficha habría sido justo eso.
- **No hay vista de pipeline/kanban** de operaciones — el encargo la marca
  como opcional (§118) y no había una necesidad real que la pidiera para
  esta FASE; el backend (`listDeals` con filtro por `status`/`stage`) ya
  deja la puerta abierta para añadirla sin cambios de modelo.
- La tabla legacy `deals` **no se toca, no se migra, no se renombra**. Sigue
  siendo la fuente para todo lo que ya la usaba, y el puente sólo añade
  filas — nunca lee, nunca actualiza una fila existente.
