# Activity Timeline (FASE 21)

Activity representa **qué ocurrió** en el negocio — deliberadamente distinta
de `admin_audit_log` ("qué cambio técnico/administrativo se hizo").
`admin_audit_log` dice "Laura cambió Lead.stage de QUALIFYING a QUALIFIED";
Activity dice "Lead cualificado". No se duplica una dentro de la otra.

## Modelo

Tabla `activities` (migración 0076), append-only: ningún código de este
proyecto hace `UPDATE` ni `DELETE` sobre ella.

- `eventType` — código estable, uno de `ACTIVITY_EVENT_TYPES` en
  `server/utils/activity/service.ts`.
- `entityType`/`entityId` — la entidad que originó el evento.
- `contactId` / `leadId` / `propertyId`+`propertyKind` / `appointmentId` /
  `buyerRequirementId` — relaciones explícitas, en columnas propias, no
  dentro de `metadataJson`: así se puede listar "toda la actividad de este
  contacto/lead/inmueble/cita" con un índice, sin deserializar JSON fila a
  fila.
- `actorType` (`user` | `contact` | `system` | `ai`) + `actorId`.
- `metadataJson` — contexto adicional (p.ej. de/a de una reasignación). Nunca
  el contenido de una nota o de un mensaje — eso es información potencialmente
  sensible y no aporta nada a "qué ocurrió" a nivel de negocio.

## `ActivityService` — el único sitio que escribe

`server/utils/activity/service.ts` exporta `recordActivity()` (nunca lanza —
un fallo al dejar constancia no debe deshacer la acción real que lo originó,
mismo criterio que `logAdminAction`/`notifyAppointment`) y `listActivity()`
(paginada por cursor `before`, exige exactamente un filtro de entidad).

Ningún endpoint ni componente inserta en `activities` directamente.

## Eventos implementados, y por qué esos y no más

Sólo eventos con un disparador real ya existente en el repositorio — nunca
se inventó uno para completar la lista del megaprompt ("no es necesario
implementar eventos que todavía no ocurren realmente"):

| Evento | Dónde se emite |
|---|---|
| `LEAD_CREATED` | `server/utils/leads.ts` → `upsertLead()` |
| `LEAD_ASSIGNED` / `LEAD_REASSIGNED` | `server/utils/leads/routing.ts` → `assignLead()` (rutas automáticas y reasignación manual, mismo choke point) |
| `LEAD_QUALIFIED` | `server/utils/leads/pipeline.ts` → `transitionLeadStage()`, sólo la primera vez que se alcanza `qualified` |
| `BUYER_REQUIREMENT_CREATED` | `server/utils/buyerRequirements/service.ts` → `createBuyerRequirement()` |
| `MATCH_SELECTED` / `MATCH_DISCARDED` | `server/utils/matching/service.ts` → `setMatchStatus()` (nunca para el status `new`) |
| `APPOINTMENT_CREATED` | `adminCreate.ts`, `book.post.ts` (reserva pública), `tours.ts` (una por parada) |
| `APPOINTMENT_RESCHEDULED` / `APPOINTMENT_CANCELLED` | `PATCH /api/admin/saas/visits/:id` y los endpoints públicos de gestión (`reschedule.post.ts`/`cancel.post.ts`) |
| `VIEWING_COMPLETED` / `VIEWING_NO_SHOW` | `PATCH /api/admin/saas/visits/:id`, sólo cuando `visits.type === 'property_viewing'` |
| `VISIT_OUTCOME_RECORDED` | `server/utils/appointments/outcome.ts` → `recordVisitOutcome()` — el evento sólo dice qué resultado se anotó, nunca el texto de las notas |
| `TASK_CREATED` / `TASK_COMPLETED` | `server/utils/tasks/service.ts` → `createTask()`/`updateTask()` (FASE 22, ver `docs/tasks.md`) |
| `OFFER_CREATED` / `OFFER_SUBMITTED` / `OFFER_COUNTERED` / `OFFER_ACCEPTED` / `OFFER_REJECTED` / `OFFER_WITHDRAWN` / `OFFER_EXPIRED` | `server/utils/offers/service.ts` — una por cada transición real, incluida la automática del cron `offers:expire` (FASE 23, ver `docs/offers.md`) |
| `DEAL_CREATED` / `DEAL_STAGE_CHANGED` / `DEAL_CLOSED` / `DEAL_CANCELLED` | `server/utils/deals/service.ts` (FASE 24, ver `docs/deals.md`) — Deal Operation, no confundir con la tabla legacy `deals` de cierres para comisiones, que no emite Activity |
| `TASK_CANCELLED` | `updateTask()` al pasar una tarea a `cancelled` (bloque N6) |
| `OFFER_RESUBMITTED` | `newOffer()` — la nueva oferta del comprador tras una contraoferta (bloque N6) |
| `DEAL_RECORD_LINKED` / `DEAL_RECORD_UNLINKED` | `linkDealRecord()`/`unlinkDealRecord()` — una reserva, unas arras o un contrato vinculados a la operación o soltados (bloque N6); `metadata` = `{ kind, recordId }` |
| `PROPERTY_SENT` | `server/utils/comms/inbox.ts#sendOutbound` — ficha enviada por WhatsApp y aceptada por el proveedor (FASE 29) |
| `PROPERTY_SHARE_OPENED` | `server/utils/comms/inbox.ts#applyMessageStatus` — la PRIMERA confirmación de lectura de WhatsApp de un mensaje `property_share` («el cliente abrió la ficha», bloque N6). `actorType: 'contact'` |
| `CALL_COMPLETED` | `server/utils/comms/calls.ts` — llamada con evidencia real de que se contestó (FASE 29) |

Deliberadamente ausentes:

- `LEAD_CONTACTED` — no tiene un disparador distinto de lo que ya cuentan
  `messages`/`calls`.
- **«Match encontrado» automático** — el motor de matching calcula las
  compatibilidades al vuelo y sólo persiste un `property_matches` cuando una
  persona decide (seleccionar, descartar) o se envía la ficha. No existe un
  momento real, fechable, en el que «se encuentre» un match: registrarlo
  sería inventar el evento.
- **«El cliente abrió la ficha» por la web pública** — la web no asocia sus
  visitas a ningún contacto (sólo a una cookie anónima); cruzarlas sería
  perfilado sin consentimiento. La única señal real es la lectura confirmada
  de WhatsApp (arriba), la misma que usa el Lead Score (FASE 32).

## Lectura

`GET /api/admin/saas/activity` — exige un filtro de entidad: `contactId`,
`leadId`, `propertyId` (+ `propertyKind`), `appointmentId` o (bloque N6)
`dealId`. Sin filtro, 422: pedir toda la actividad de la organización de
golpe no es un caso de uso real de este endpoint.

- `dealId` reconstruye la cronología de una operación sin columna nueva:
  eventos con `entityType = 'deal'` de esa operación, los de su oferta
  aceptada (`entityType = 'offer'`), los de sus tareas (`tasks.deal_id`) y
  los de sus citas (`visits.deal_id`). Subconsultas, no listas de ids: el
  número de parámetros no crece con la operación (D1 admite 100 por
  consulta). Una operación de otra agencia (o borrada) devuelve `rows: []`.
- `eventTypes=A,B` acota a esos tipos (los chips de la cronología); un tipo
  que no está en `ACTIVITY_EVENT_TYPES` es 422.
- `before` (cursor) y `limit` (máx. 100) paginan hacia atrás.
- Cada fila trae `actorName` cuando la hizo un usuario del panel de esta
  organización (`users` acotado por `organization_id`).

## Dónde se ve (bloque N6)

Un único componente, `components/admin/activity/ActivityTimeline.vue`, con
todos los tipos de evento (texto de `composables/useActivityRenderer.ts`,
etiquetas en `utils/pipelineCatalog.ts`), quién lo hizo, un enlace a lo que
lo originó, chips por grupo (Leads, Necesidades y matching, Citas y visitas,
Tareas, Ofertas, Operación, Comunicaciones) y «Ver más antigua»:

- ficha de **Contacto** (`/admin/contactos/:id`, pestaña Actividad);
- ficha de **Lead** (`/admin/leads/:id`, pestaña Actividad);
- ficha de **Propiedad**, los dos catálogos (panel «Actividad» bajo el
  editor, `components/admin/property/PropertyCrmPanels.vue`);
- ficha de **Operación** (`/admin/deal-operations/:id`, panel «Actividad»).

La ficha antigua de Cliente (`/admin/clientes/:id`) mantiene su cronología
mezclada (`composables/useClientTimeline.ts`), que sólo toma de
`activities` los seis tipos que no tenían otra representación — para no
enseñar dos veces el mismo hecho. No se ha tocado.

## Lo que no hace (a propósito)

- No hay idempotencia explícita salvo donde hay webhook: `PROPERTY_SHARE_OPENED`
  sólo se registra la primera vez que el mensaje pasa a `read` (un `read`
  repetido no supera la comprobación de orden de estados).
- No hay una vista de actividad de toda la organización: siempre se mira
  desde una entidad.
