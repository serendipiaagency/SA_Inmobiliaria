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

- `deletedAt` — papelera (migración 0086, bloque N6). Una tarea borrada
  no sale en ningún listado (`listTasks`), ni en la ficha de su operación,
  ni en el panel comercial, ni cuenta para la próxima acción del lead; la
  fila y su Activity se conservan.

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

## Edición completa y papelera (bloque N6)

`updateTask()` edita **todos** los campos: tipo, título, responsable,
fecha, prioridad, estado (`open | in_progress | completed | cancelled` —
«En curso» se elige como cualquier otro) y las relaciones `contactId`,
`leadId`, `propertyId`+`propertyKind`, `appointmentId` y `dealId` (`null`
desvincula). Reglas:

- Cada relación **nueva** se valida en la organización
  (`assertTaskReferences`): contacto, lead, responsable, cita viva, operación
  viva y propiedad de cualquiera de los dos catálogos — ajena o inexistente
  = **404**, nunca 403.
- Cambiar la propiedad a una de la **papelera** es trabajo nuevo sobre ella:
  **422**. Conservar la que ya tenía, aunque se haya borrado después, es
  historia y se permite (sólo se juzga lo que cambia).
- Cancelar registra `TASK_CANCELLED`; completar, `TASK_COMPLETED`; reabrir
  una completada le quita `completedAt`.
- Cualquier cambio de estado, fecha, tipo o lead recalcula la próxima acción
  del lead anterior **y** del nuevo.
- Una tarea nueva puede nacer `open` o `in_progress` (nunca completada).

Borrar es `deleteTask()` — `deletedAt`, nunca un `DELETE`: sale de todo y
recalcula la próxima acción de su lead. Una tarea borrada ya no se edita ni
se vuelve a borrar (404). No hay restauración desde el panel.

### API (sin rutas nuevas)

- `GET /api/admin/saas/tasks` — además de los filtros de siempre,
  `status=active` (abiertas + en curso, la vista por defecto del panel). Cada
  fila trae `assigneeName`, `contactName`, `leadName`, `propertyName` y
  `appointmentLabel`, resueltos dentro de la organización.
- `POST /api/admin/saas/tasks` — acepta `status` (`open`/`in_progress`).
- `PATCH /api/admin/saas/tasks/:id` — todos los campos de arriba (ids como
  número, `null` o `''` para desvincular; uno mal formado es 422) y
  `{ deleted: true }` para mandarla a la papelera (no hay ruta `DELETE`: el
  presupuesto de rutas de Nitro está agotado).

## Dónde se ve

- **CRM → Tareas** (`/admin/tareas`) — todas las tareas de la organización,
  con filtro Pendientes (por defecto) / Abiertas / En curso / Vencidas /
  Vencen hoy / Completadas / Canceladas / Todas. «+ Nueva tarea» y «Editar»
  abren `components/admin/tasks/TaskFormModal.vue`, con todos los campos y
  un buscador para cada relación (`components/admin/pickers/RecordPicker.vue`:
  contactos y leads del motor genérico, inmuebles de
  `properties/search` —sólo vivos—, citas y operaciones). La columna
  «Relacionada con» enseña nombres reales con enlace; el estado se cambia
  desde su desplegable; «Borrar» pide confirmación. Igual que Calendar, el
  filtro por comercial organiza la vista, no la restringe.
- **Ficha de la operación** — sus tareas, con «+ Nueva tarea» (la operación
  fijada; comprador, inmueble y lead propuestos) y «Editar».
- **Ficha de Contacto / Lead → pestaña "Tareas"**, **Ficha de Cliente**, y
  **Leads** (botón «+ Tarea» de cada tarjeta).
- **Leads** — cada tarjeta y la vista Tabla muestran la próxima acción con
  su tipo (`nextActionLabel()`: «Tarea · Llamada · mañana», «Cita · Visita a
  inmueble · en 3 d»); la ficha del lead la enseña en «Tiempos (SLA)».
- **Resultado de visita** (`/admin/visitas`) — "Crear tarea de seguimiento".

## Lo que no hace (a propósito)

- Una Task sin `dueAt` es válida pero no entra en el cálculo de Next Action:
  no hay con qué compararla contra una cita real. Documentado, no un bug.
- No hay papelera visible ni «restaurar» de tareas en el panel.
