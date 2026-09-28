# Task + Next Action (FASE 22)

Task representa **trabajo pendiente** — deliberadamente distinta de
Appointment (**tiempo reservado**) y de Activity (**algo que ya ocurrió**).
Ninguna se convierte en otra: completar una Task no crea una cita, y una cita
no es una Task.

## Modelo

Tabla `tasks` (migración 0077). No copia datos de sus relaciones (nombre de
contacto, dirección de propiedad, origen del lead): sólo guarda sus ids
(`contactId`, `leadId`, `propertyId`+`propertyKind`, `appointmentId`,
`dealId`) y los resuelve al mostrarla, igual que `activities` y `visits`.

- `type` — `call | whatsapp | email | follow_up | document | viewing | offer | signature | other`.
- `title` — texto humano, p.ej. "Llamar a María para feedback de visita".
- `assigneeId` — `team_members.id`, el comercial responsable. Nunca se guarda
  sólo el nombre.
- `dueAt` — cuándo. Nullable a propósito: una tarea "algún día" sin fecha es
  válida, pero **no participa en Next Action** (ver abajo) porque no hay con
  qué ordenarla junto a una cita real.
- `priority` — `low | medium | high | urgent`.
- `status` — `open | in_progress | completed | cancelled`. `completedAt` se
  fija sólo al pasar a `completed`.
- `dealId` — sin FK real todavía: Deal no existe hasta FASE 24. Mismo
  precedente que `visits.propertyId`/`propertyKind` (entero suelto,
  resuelto por la capa de aplicación).

`overdue` (vencida) nunca se guarda: se deriva de `status` + `dueAt` en el
momento de leer (`isTaskOverdue()`), igual que la spec pide para no
mantener una segunda copia que se pueda desincronizar.

## `TaskService` — el único sitio que escribe

`server/utils/tasks/service.ts` — `createTask()` y `updateTask()`. Completar
una tarea (`status: 'completed'`): fija `completedAt`, registra
`TASK_COMPLETED` en Activity, y recalcula la próxima acción del lead si la
tarea estaba ligada a uno. Ningún endpoint inserta en `tasks` directamente.

## Next Action — proyección, nunca una segunda fuente de verdad

`leads.nextActionAt` existía desde FASE 16 (migración 0069) pero nada lo
escribía todavía: la alerta SLA "cualificado sin próxima acción" estaba
condenada a dispararse siempre para cualquier lead cualificado. Esta FASE
completa esa columna (y añade `nextActionType`, migración 0077) con
`syncLeadNextAction()` (`server/utils/leads/nextAction.ts`):

> nextAction = la Task abierta con `dueAt` más próxima, **o** la Appointment
> futura (`status = 'scheduled'`, `scheduledAt` en el futuro) más próxima de
> ese lead — la que sea antes. Ninguna de las dos si no hay ninguna.

`nextActionType` guarda `task:<type>` o `appointment:<visit.type>` — no un
booleano, para que el badge sepa qué icono mostrar sin un JOIN aparte.

**Nunca se escribe a mano.** `syncLeadNextAction()` se llama, siempre justo
después de la operación real, desde cualquier sitio que pueda cambiar cuál es
la próxima acción de un lead: crear/completar una Task, y
crear/reprogramar/cancelar una Appointment (`adminCreate.ts`,
`visits/[id].patch.ts`, `tours.ts`, la reserva pública y sus endpoints de
gestión). Igual que `recordActivity()`, nunca lanza: un fallo al recalcular
la proyección no debe deshacer la reserva o la tarea real que lo disparó — se
recalculará en la siguiente escritura sobre ese lead.

Con esto, la alerta `qualified_no_action` de FASE 16
(`server/utils/leads/sla.ts`, sin cambios en esta FASE) empieza a significar
de verdad lo que su nombre dice.

## Visit Outcome → Task (§56 del encargo)

La maqueta original de FASE 19 para "¿qué pasa después de una visita?"
proponía cuatro pasos siguientes: *Segunda visita, Oferta, Descartar,
Seguimiento*. Sólo **Seguimiento** crea algo nuevo aquí: al anotar el
resultado de una visita, marcar "Crear tarea de seguimiento" (con una fecha)
da de alta una Task real (`type: 'follow_up'`), ligada a la visita, al lead y
al contacto si los hay, asignada por defecto al mismo comercial de la visita.

Los otros tres no se inventan: "Segunda visita" ya se resuelve reservando
otra cita desde Calendar (no necesita un mecanismo propio), y "Oferta"/
"Descartar" no tienen todavía un disparador real distinto de los que ya
existen (Oferta llega con FASE 23).

## Dónde se ve

- **CRM → Tareas** (`/admin/tareas`) — todas las tareas de la organización.
  Igual que Calendar, el filtro por comercial organiza la vista, no la
  restringe: RBAC en este proyecto es por área (`crm`), nunca por fila, así
  que no existe un "sólo las mías" del lado del servidor.
- **Ficha de Cliente → pestaña "Tareas"** — sólo si la ficha tiene un Contact
  moderno vinculado (`clients.contactId`), mismo criterio que la pestaña
  "Actividad" de FASE 21.
- **Leads** — cada tarjeta muestra su "Próxima acción" (cuando la hay) y un
  botón "+ Tarea" para crear una suelta ligada a ese lead sin salir del
  tablero.
- **Resultado de visita** (`/admin/visitas`) — "Crear tarea de seguimiento".

## Lo que esta FASE no hace (a propósito)

- No hay un picker de contacto/lead/propiedad en "+ Nueva tarea" de la
  pantalla Tareas: desde ahí sólo se crean tareas sueltas, sin relación. Una
  tarea ligada a una entidad se crea desde esa entidad (Cliente, Leads,
  Resultado de visita) — evita reconstruir un buscador genérico de contactos
  sólo para este formulario.
- Lead y Property no tienen todavía una ficha 360º propia donde listar sus
  tareas relacionadas (mismo límite que Activity en FASE 21) — el backend
  (`GET /api/admin/saas/tasks?leadId=`/`propertyId=`) ya está listo para
  cuando esas vistas existan.
- Una Task sin `dueAt` es válida pero no entra en el cálculo de Next Action:
  no hay con qué compararla contra una cita real. Documentado, no un bug.
