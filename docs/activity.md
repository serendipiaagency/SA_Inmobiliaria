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

Deliberadamente ausentes: `PROPERTY_SENT` (no hay envío rastreable
todavía — llegará con el Centro de Comunicaciones), `LEAD_CONTACTED` (no
tiene un disparador distinto de lo que ya cuentan `messages`/`calls` en la
cronología de Cliente), y todo lo de Offer/Deal (FASE 23-24, no
implementadas al escribir esto).

## Lectura

`GET /api/admin/saas/activity` — exige exactamente uno de `contactId`,
`leadId`, `propertyId` (+ `propertyKind`) o `appointmentId`. Sin filtro,
422: pedir toda la actividad de la organización de golpe no es un caso de
uso real de este endpoint.

## Dónde se ve

La ficha de Cliente (`/admin/clientes/:id`, pestaña "Actividad") ya tenía una
cronología montada al vuelo (`composables/useClientTimeline.ts`) a partir de
tablas reales (visitas, operaciones, reservas, leads, `admin_audit_log`,
mensajes, llamadas) — esa pestaña **ya cumplía** buena parte de lo que pide
esta FASE. Se amplía, no se sustituye: `useClientTimeline.ts` incorpora
ahora los eventos de `activities` que **no tenían representación previa**
(`LEAD_ASSIGNED`, `LEAD_REASSIGNED`, `LEAD_QUALIFIED`,
`BUYER_REQUIREMENT_CREATED`, `MATCH_SELECTED`, `MATCH_DISCARDED`) y descarta
explícitamente los que sí la tenían (`APPOINTMENT_*`, `VIEWING_*`,
`VISIT_OUTCOME_RECORDED`, `LEAD_CREATED`) para no mostrar el mismo hecho dos
veces.

Property y Lead no tienen todavía una ficha 360º propia donde mostrar su
actividad — Lead ni siquiera tiene una vista de detalle hoy, sólo el tablero
de `/admin/leads` — así que por ahora sólo se consume desde Contacto. El
backend (`GET /api/admin/saas/activity?leadId=`/`propertyId=`) ya está listo
para cuando esas vistas existan.

## Lo que esta FASE no hace (a propósito)

- No hay idempotencia explícita: ningún disparador actual viene de un
  webhook con riesgo real de entrega duplicada. Se añadirá si/cuando lo haya
  (Centro de Comunicaciones, FASE 29).
- No renderiza actividad en Property ni en una ficha de Lead — no existen
  esas vistas de detalle en el producto todavía.
