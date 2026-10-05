# Calendar (FASE 20)

Calendar es una vista, no un dominio nuevo. Todo lo que muestra y todo lo que
mueve es `visits` (Appointment, FASE 17-19) — no existe ninguna tabla
`calendar_events` ni nada parecido.

> **Actualizado en el bloque N5 (FASES 17-20):**
> - los filtros de oficina (`officeId`, la entidad Oficinas), tipo (todos los
>   tipos nuevos) y cliente (`contactId`, directo o por el lead);
> - el iCal con la zona horaria correcta;
> - el estado honesto de Google/Outlook;
> - la edición completa de una cita.
>
> Todo eso está en [citas-y-visitas.md](citas-y-visitas.md). Lo de abajo es
> el diseño original de la FASE 20; donde contradiga a ese documento, manda
> el nuevo.

## Dónde vive

`pages/admin/visitas.vue`, pestaña "Calendario" (junto a Lista y Tours, ya
existentes). Cuatro sub-vistas: Día, Semana, Mes (la que ya existía desde
antes de esta FASE, ahora ampliada) y Agenda (pensada para móvil).

## Backend

- `GET /api/admin/saas/calendar` — `visits` por rango de fechas (`from`/`to`,
  obligatorios) con los filtros de la sección 10 del megaprompt: `agentId`,
  `officeId` (oficina como entidad; `office`, texto libre, por compatibilidad),
  `type`, `status` (siempre `visits.status`, nunca `confirmationStatus` — son
  conceptos distintos, FASE 17), `propertyId` + `propertyKind`, `contactId`
  (el contacto de la cita o, si no tiene, el de su lead) y `leadId`.
- `POST /api/admin/saas/visits` — crea **una** cita suelta desde el panel
  (`server/utils/appointments/adminCreate.ts`), no un tour de una parada.
  Misma validación que `createTour()` por parada (comercial real, inmueble
  real si lo hay, solape contra la agenda real), pero — a diferencia de la
  reserva pública y de Tours — admite tanto `developer_properties` (obra
  nueva) como `agent_properties` (2ª mano).
- `PATCH /api/admin/saas/visits/:id` — ya existía (FASE 17-18); esta FASE le
  añade `durationMinutes` para el "resize" del calendario, con la misma
  comprobación de solapes que ya usaba para mover una cita.
- `GET /api/admin/saas/properties/search` (`searchPropertiesCompact()` en
  `server/utils/properties/searchService.ts`, FASE 27 — antes vivía en
  `properties/search.ts`) — el filtro de Propiedad necesitaba buscar en los
  dos catálogos a la vez; no existía nada así en el repo
  (`PropertyPickerModal.vue`/`/api/admin/comms/properties` sólo cubre obra
  nueva, pendiente de migrar al mismo servicio en FASE 29). Se pensó para
  reutilizarse también en Offer/Deal (FASE 23-24).

## Migración 0075 — qué añade y por qué

- `visits.property_kind` (`agent` | `developer`, nullable, backfill
  `'developer'` para toda fila con `property_id` ya existente): hasta esta
  FASE, `visits.property_id` sólo apuntaba a `developer_properties` — la
  reserva pública nunca ofreció 2ª mano. El nuevo POST admite ambas, así que
  hace falta saber a qué catálogo pertenece cada `property_id`.
- `visits.calendar_provider` / `external_calendar_id` / `external_event_id` /
  `calendar_sync_status` — sólo almacenamiento preparado para una futura
  sincronización con Google Calendar / Outlook (secciones 23-25 del
  megaprompt). Nada los escribe todavía. La forma que tendría ese proveedor
  cuando exista está en `server/utils/appointments/calendarProvider.ts`
  (una interfaz, sin implementación).

## Decisiones de diseño (huecos reales del repo, no elegidos por preferencia)

- ~~**Office = `team_members.office_name`.**~~ Superado: desde la migración
  0086 existe la entidad Oficinas y el filtro es `officeId` (bloque N5). El
  texto libre se sigue aceptando como `office` por compatibilidad.
- **Permisos por fila: no existen.** El RBAC de este panel es por área
  (`crm`, `general`, …), no por comercial. El filtro de Comercial en Calendar
  organiza la vista; no restringe qué puede ver cada usuario — ni aquí ni en
  Lista ni en Tours, donde tampoco existía esa restricción antes.
- **Drag & drop y resize reutilizan el "Appointment Domain Service" que ya
  había** (`PATCH /api/admin/saas/visits/:id`): validan conflictos,
  invalidan la confirmación del cliente y notifican — nunca mueven sólo el
  bloque visual.
- **Sin librería de calendario.** El grid de Semana/Día es una cuadrícula
  horaria simple (07:00-20:00, una fila por hora); "resize" es un control
  explícito (±15 min en el detalle de la cita), no un asa de arrastre en
  píxeles — un asa de arrastre real habría exigido posicionamiento por
  píxel que este proyecto no tenía y que no merecía la pena introducir sólo
  para esto.
- ~~**Activity todavía no existe**~~ Superado: crear, mover y cancelar una
  cita registran `APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED` y
  `APPOINTMENT_CANCELLED` (FASE 21) desde estos mismos servicios.

## Pruebas

- `test/unit/adminAppointment.test.ts` — `createAdminAppointment()`: comercial
  real, inmueble real (los dos catálogos), solape, aislamiento entre tenants.
- `tests/e2e/calendar.spec.ts` — sobre HTTP real: crear cita suelta (los dos
  catálogos), conflicto 409, filtros de `/calendar` (rango, comercial, office,
  tipo, estado, propiedad), mover y redimensionar una cita, aislamiento entre
  tenants, búsqueda de propiedad unificada, y un smoke test de que la pestaña
  Calendario carga con sus cuatro sub-vistas. Usa un comercial propio en vez
  de reutilizar el de `appointments.spec.ts`/`tours.spec.ts`/`visitOutcome.spec.ts`
  para no competir por el mismo espacio de horas aleatorias (la misma clase de
  problema que el rate limit de FASE 19, pero de agenda en vez de peticiones).
