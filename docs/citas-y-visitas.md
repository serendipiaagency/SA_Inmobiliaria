# Citas, tours, resultado de visita y calendario (núcleo N5, FASES 17-20)

Una **cita** es una fila de `visits`, la única agenda de la plataforma. La
Lista, el Calendario y los Tours de `/admin/visitas` son tres formas de
verla; el iCal de cada comercial, una cuarta. Ninguna guarda una copia.

No hay migración nueva: todas las columnas que usa este bloque las añadió la
0086 (`contact_id`, `office_id`, `timezone`, `meeting_point`,
`internal_notes`, `cancellation_reason`, `cancelled_at`, `reminder_status`,
`created_by`, `updated_at`, `deleted_at` y el resultado estructurado).

## Catálogo compartido

`utils/appointmentCatalog.ts` es la única lista de valores con su etiqueta en
castellano. La usan el servidor (validación) y el panel (selectores).

| Tipo (`type`) | Etiqueta | Necesita email o teléfono |
|---|---|---|
| `property_viewing` | Visita a inmueble | sí |
| `call` | Llamada | sí |
| `video_call` | Videollamada (canal siempre vídeo, con enlace Jitsi) | sí |
| `meeting` | Reunión | no |
| `valuation` | Tasación | no |
| `listing` | Captación | no |
| `signing` | Firma (arras, reserva, encargo…) | no |
| `notary` | Notaría (la que ya creaba la operación) | no |
| `open_house` | Open house | no |
| `other` | Otro | no |

«Necesita email o teléfono» quiere decir que hay un cliente al que avisar: el
dato puede venir de la propia cita, de su contacto o de su lead. Un tipo
desconocido es un 422; antes se convertía en silencio en «visita».

Otros catálogos del mismo fichero: canales, estados, confirmación,
recordatorio, resultado, percepción del precio y valoraciones 1-5.

## Campos de una cita (FASE 17)

| Campo | Notas |
|---|---|
| `propertyId` + `propertyKind` | Obra nueva (`developer`) o 2ª mano (`agent`). Se busca en su catálogo. |
| `leadId`, `contactId` | Si el lead ya tiene a su persona, el contacto tiene que ser ella (422 si no). Sin contacto, la cita hereda el del lead. |
| `agentId` | Obligatorio al crear. |
| `officeId` | Sin oficina, la del comercial. |
| `scheduledAt`, `endsAt` | Inicio y fin libres. El fin puede llegar como `endsAt` o como `durationMinutes`; sin ninguno, la franja del comercial. Entre 5 min y 12 h. |
| `timezone` | IANA (`Europe/Madrid`). Sin ella, la de la oficina. |
| `status` | `scheduled`, `completed`, `cancelled`, `no_show`. |
| `cancellationReason` | **Obligatorio al cancelar.** Se guarda con `cancelledAt`. Reactivar la cita los borra. |
| `confirmationStatus` | `pending`, `confirmed` (la da el cliente desde su enlace) y `confirmed_internal` (la anota la agencia). El panel no puede poner `confirmed`. |
| `reminderStatus` | Lo escribe el envío de recordatorios: `pending`, `sent` o `not_applicable` (sin email ni teléfono). Se ve en la ficha. |
| `meetingPoint`, `notes`, `internalNotes` | Texto. Las notas internas no salen en el iCal ni en ningún aviso. |
| `createdBy`, `updatedAt` | Autor y última edición. |

### Reglas al crear o editar

- Toda referencia (comercial, lead, contacto, oficina, inmueble, operación) se
  busca **dentro de la agencia**. Una de otra agencia responde 404, igual que
  una que no existe.
- Un inmueble **nuevo** en la cita (alta o cambio) tiene que estar fuera de la
  papelera: si no, 422 con `trashedPropertyMessage`. Si se conserva el que ya
  tenía, no se revalida: la cita es historia.
- Los solapes se comprueban contra la agenda real del comercial. La consulta
  mira hacia atrás hasta 12 h, para ver también una cita de la víspera que
  cruza la medianoche. El índice único `visits_agent_slot_unique` sigue siendo
  la red de seguridad (409).
- Mover el inicio, el fin o el comercial devuelve la confirmación a `pending`.
  Mover el inicio, además, reinicia los recordatorios.
- La edición sólo cambia lo que llega. El formulario del panel manda sólo lo
  que el usuario ha tocado, para que guardar una nota no borre la
  confirmación que dio el cliente.

Servicios: `server/utils/appointments/fields.ts` (validación común),
`adminCreate.ts` (alta), `update.ts` (edición). Las Domain Tools usan los
mismos servicios. `cancel_viewing` admite `reason`; sin él, deja dicho desde
dónde se canceló. La cancelación desde el enlace del cliente guarda «Cancelada
por el cliente desde su enlace».

## Tours: visitas multi-inmueble (FASE 18)

Un tour es una cabecera (`property_tours`: cliente, lead y notas) y sus
paradas. Cada parada es una cita real de `visits`.

- **Cada parada tiene su hora y su duración** (o su fin). El ejemplo «10:00 de
  45 min y 10:45 de 60 min» funciona tal cual.
- **Los dos catálogos.** Cada parada guarda `propertyKind`. Antes no lo
  guardaba y por eso no se podía ofertar ni filtrar.
- **Lead y contacto** del tour se propagan a todas las paradas. Editarlos
  desde «Editar / reordenar» también los propaga.
- **Ruta.** Las paradas se suben y bajan. «Recalcular horas» encadena la ruta:
  cada parada empieza al acabar la anterior más el desplazamiento elegido, y
  conserva su duración. Al reordenar un tour ya creado:
  - las horas nuevas pasan la comprobación de solapes de cada comercial;
  - la confirmación de cada parada movida vuelve a `pending` y sus
    recordatorios se reinician;
  - queda `APPOINTMENT_RESCHEDULED` en Activity y se avisa al cliente.
  - Las paradas canceladas no se mueven. Si alguna ya se hizo, el tour ya
    empezó: las horas no se recalculan y cada parada se mueve por separado.
- **Optimización real de ruta: no implementada, a propósito.** El cálculo
  vive en `utils/tourPlanning.ts` (`planSequentialSchedule`), compartido por
  el servidor y el formulario. El punto de extensión es la interfaz
  `RouteOptimizer` del mismo fichero:
  - un proveedor real (Google Routes, OSRM…) recibiría las coordenadas de la
    ficha de cada inmueble;
  - devolvería el orden y el trayecto entre paradas, y las horas se seguirían
    calculando igual;
  - sin coordenadas, debe devolver `null` en ese tramo, nunca una distancia
    inventada.

  Hoy el orden lo decide el comercial y el trayecto es su margen.

Endpoint: `POST /api/admin/saas/tours` tiene tres acciones (el presupuesto de
rutas de Nitro es 0):

- sin `action`: crear. Recibe `contactId`, `leadId`, `notes`, `timezone` y
  `stops[]` con `propertyId`, `propertyKind`, `agentId`, `scheduledAt`,
  `endsAt` o `durationMinutes`, `channel` y `meetingPoint`;
- `action: 'update'` + `tourId`: edita cliente, lead, contacto y notas;
- `action: 'reorder'` + `tourId` + `stopIds`: reordena; con `recalculate`,
  `gapMinutes` y `startAt`, recalcula las horas.

`GET /api/admin/saas/tours` devuelve cada parada con su resultado y sus
ofertas.

## Resultado de la visita (FASE 19)

`POST /api/admin/saas/visits/:id/outcome` (sólo con la visita `completed`):

- `outcome`: interesado, se lo piensa o no le convenció;
- `interestLevel`: 1-5;
- `liked` y `disliked`: qué le gustó y qué no, cada uno en su columna;
- `pricePerception`: barato, ajustado o caro;
- `locationRating`, `conditionRating`, `layoutRating`: 1-5;
- `wantsSecondVisit`, `wantsToOffer`, `discarded`: marcas;
- `notes`.

Acciones reales que salen del resultado:

- `followUp`: una tarea de seguimiento (TaskService).
- `secondVisit`: la segunda visita ya agendada. Es una cita real, con el mismo
  inmueble, cliente y comercial, y pasa por la comprobación de solapes. Es la
  primera escritura: si choca (409), no se anota nada.
- `createOffer`: una oferta en borrador con el **OfferService** existente
  (importe, condiciones, financiación y vencimiento). Funciona en la Lista y
  en los Tours. Si la visita no tiene contacto, se elige con `contactId`; se
  valida en la agencia y queda vinculado a la visita.
- `discarded`, o «no le convenció», pasa el PropertyMatch de esa persona con
  ese inmueble a «descartado». Descartar es incompatible con «Interesado»,
  con ofertar y con agendar segunda visita (422).

Todo se valida **antes** de escribir: un resultado nunca se queda a medias.
El resultado sigue sin tocar el catálogo ni las necesidades del comprador
(`test/unit/visitOutcome.test.ts`).

**Ofertas de una visita.** Son las del comprador de la cita sobre su
inmueble: el comprador es el contacto de la cita o, si no tiene, el de su
lead. La relación es por `(contacto, catálogo, inmueble)`, no por una columna
nueva. Se ven en la Lista, en los Tours y en la ficha de la cita, con enlace
a la pestaña «Ofertas» del contacto.

## Calendario (FASE 20)

`GET /api/admin/saas/calendar?from&to` admite estos filtros:

- `agentId`;
- **`officeId`** (la oficina como entidad: la de la cita o, si no tiene, la
  de su comercial);
- **`type`** (cualquier tipo del catálogo);
- `status`;
- `propertyId` + `propertyKind`;
- **`contactId`** (el cliente: contacto de la cita o de su lead) y `leadId`.

`office` (el texto libre antiguo del comercial) se mantiene por
compatibilidad.

`GET /api/admin/saas/visits` (la Lista) devuelve la misma fila completa:
todos los campos, nombres de lead, contacto y oficina, el resultado y las
ofertas. Admite `status`, `type`, `agentId`, `officeId`, `contactId` y
`leadId`. Con **`?id=`** devuelve la ficha de una cita (`{ row }`, 404 si es
de otra agencia).

Las dos lecturas viven en `server/utils/appointments/query.ts`.

### iCal con la zona horaria correcta

Las horas de `visits` son **hora de pared**. El feed
`/calendar/<token>.ics` las escribía tal cual con `Z`, así que una cita a las
10:00 en Madrid aparecía a las 12:00 en verano. Ahora
(`server/utils/appointments/ical.ts` y `timezone.ts`) cada cita se convierte
a su instante UTC real y se emite con `Z`. La zona se resuelve en este orden:

1. la de la cita;
2. la de su oficina;
3. la de la oficina del comercial;
4. la de la agencia (Sistema → Configuración);
5. `DEFAULT_AGENCY_TIMEZONE`, la misma que ese panel muestra si nunca se
   guardó.

El feed también:

- declara `X-WR-TIMEZONE`;
- pliega las líneas a 75 octetos;
- incluye el tipo, el punto de encuentro y la hora local en la descripción;
- sólo lista citas de la agencia del comercial.

### Google Calendar y Outlook

**No hay integración.** El panel lo dice así: «No conectado · próximamente».

- La sincronización en los dos sentidos necesita OAuth por cuenta, que este
  despliegue no tiene.
- La forma que tendría el proveedor está en
  `server/utils/appointments/calendarProvider.ts`.
- Las columnas que rellenaría ya existen (`calendar_provider`,
  `external_event_id`…), pero nada las escribe.

Lo que sí funciona hoy es la suscripción iCal de solo lectura de cada
comercial.

## Pendiente (conocido)

- Los **recordatorios** (`server/tasks/appointments/reminders.ts`) y el cálculo
  de huecos libres comparan la hora de pared con el reloj UTC del servidor.
  En una agencia a UTC+2 el aviso de «1 h antes» sale 3 h antes. Es el mismo
  problema que tenía el iCal, pero fuera del alcance de este bloque. La
  conversión ya existe (`zonedWallTimeToUtc` en `timezone.ts`) y es la que
  hay que reutilizar ahí.
- Añadir o quitar paradas de un tour ya creado: hoy se cancela la parada (con
  motivo) o se crea otra cita.

## Pruebas

- `test/unit/appointmentsNucleoN5.test.ts`:
  - catálogo;
  - alta con todos los campos, validaciones y aislamiento (lead, contacto,
    oficina, inmueble, operación y comercial ajenos: 404; papelera: 422);
  - edición completa, cancelación con motivo, confirmación interna,
    reprogramar y recordatorios;
  - solapes, también a través de la medianoche;
  - tours de duración distinta y de los dos catálogos, edición de cabecera, y
    reordenar y recalcular (incluido el choque con la agenda);
  - resultado estructurado, descarte con match, oferta real desde una cita y
    desde una parada de 2ª mano, y segunda visita;
  - filtros del calendario;
  - iCal en verano, invierno, Canarias y Dubái, con la resolución de zona.
- `test/unit/domainTools.test.ts`: `cancel_viewing` deja motivo.
- `tests/e2e/nucleo-n5.spec.ts`: lo mismo sobre HTTP real y el panel.
  `tests/e2e/tours.spec.ts` y `activity.spec.ts` cancelan ya con motivo.
