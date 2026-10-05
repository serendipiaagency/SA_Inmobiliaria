# Leads: ficha, alta manual, historial, enrutado y SLA (núcleo inmobiliario, N3)

Bloque N3 del megaprompt «Núcleo inmobiliario» (FASES 12-16), sobre las
columnas que ya añadió la migración 0086 (`leads.office_id`, `team_id`,
`created_by`, `deleted_at`, `first_contact_at`, `converted_at`, `language`,
`external_id`; `lead_routing_rules.target_office_id` y `schedule_json`). **No
hay migración nueva.**

Sin rutas nuevas: el lead es el recurso `leads` del motor CRUD genérico
(`server/api/admin/[resource]/**`), igual que `contacts`, con su lógica en
`server/utils/leads/admin.ts`.

| Petición | Qué hace |
| --- | --- |
| `POST /api/admin/leads` | Alta manual con deduplicación (`createLeadFromAdmin`) |
| `PUT /api/admin/leads/:id` | Edición de los datos de captación (`updateLeadFromAdmin`) |
| `GET /api/admin/leads/:id` | Ficha completa (`getLeadDetail`) |
| `DELETE /api/admin/leads/:id` | 405: un lead no se borra, se marca como perdido |
| `PATCH /api/admin/saas/leads/:id` | Fase (`stage` + `reason`) o resultado (`lost`, `lostReason`, `note`) — lo único que escribe `lead_stage_history` |
| `POST /api/admin/saas/leads/:id/reassign` | Comercial (`commercialId` + `reason`) — deja `lead_assignment_history` |

## Campos (FASE 12)

Todos los de la fase tienen interfaz: nombre, teléfono, email, WhatsApp,
origen (`utils/leadCatalog.ts#LEAD_SOURCES`, con etiqueta en castellano) y
su detalle, campaña, los cinco UTM, propiedad de interés, portal, página de
entrada, referrer, mensaje original, comercial, oficina, equipo, estado,
fase, prioridad, score, primera respuesta, último contacto, próxima acción,
contacto al que se convierte y motivo de pérdida, más idioma e id externo.

- El **mensaje original** se escribe en el alta y nunca se reescribe (el
  PUT lo ignora).
- El **contacto al que se convierte** es `leads.contact_id` (la columna
  `converted_contact_id` sólo existe en producción por la deriva de la 0069
  y no se usa). Enlazar un contacto fecha `converted_at` la primera vez.
- Los catálogos (origen, prioridad, idioma) se validan en el servidor: un
  valor desconocido es un 422, nunca se ignora en silencio.
- Oficina, equipo, comercial, contacto y propiedad se comprueban dentro de
  la organización (404 si son de otra), y un equipo de otra oficina no se
  combina con la oficina elegida (422).

## Pipeline e historial (FASE 13)

Cada cambio queda en `lead_stage_history` con usuario, fecha, fase anterior,
fase nueva y motivo — también los movimientos de resultado: perder
(`to_stage = 'lost'`, motivo del catálogo No responde / No interesado /
Duplicado / otro, más el comentario) y reactivar (`'reactivated'`). La fase
en la que estaba un lead perdido no cambia; reactivarlo vuelve a ella.

En el panel: el Kanban abre una ventana para el motivo al soltar en
«Perdidos» (antes era un `prompt` de texto libre) y la ficha tiene «Cambiar
fase» con motivo, «Marcar como perdido» y «Reactivar», y la pestaña
«Historial de fases».

## Deduplicación (FASE 14)

`findLeadDuplicates()` busca, dentro de la organización y sin leads
borrados:

1. el mismo **id externo** del mismo origen;
2. el mismo **email** (sin distinguir mayúsculas);
3. la misma **persona**: un contacto que coincide exacto por email,
   **teléfono** o **WhatsApp** normalizados (`findDuplicateContacts`, la de
   siempre) con un lead todavía abierto.

Con coincidencias, el alta responde 409 con la lista y quien decide elige:
`mergeIntoLeadId` (**unificar**: completa ese lead con lo que le falte, sin
pisar nada, y suma las notas) o `force: true` (**crear igualmente**, queda
en Auditoría). La captación pública (`upsertLead`) usa el mismo orden vía
`findReusableLead()`; un lead cerrado (ganado o perdido) nunca se reabre en
silencio: la persona que vuelve genera uno nuevo.

La edición vuelve a comprobar si el email, teléfono, WhatsApp o id externo
nuevos ya son de otro lead (409 salvo `force`).

## Enrutado (FASE 15)

Ámbitos de regla (`utils/leadCatalog.ts#ROUTING_SCOPES`): propiedad, zona,
**oficina**, idioma, tipo de inmueble, obra nueva, **equipo** y reparto
general/departamento, más **horario** en cualquier regla.

- **Oficina**: `matchValue` = id de la oficina; aplica a los leads de esa
  oficina (vacío: a todos). `targetOfficeId` limita el reparto a los
  comerciales de una oficina en cualquier regla.
- **Equipo**: `matchValue` = id del equipo (entidad Equipos); reparte entre
  sus comerciales.
- **Idioma**: compara con `leads.language`, que ahora rellenan el alta
  manual y la captación.
- **Horario** (`scheduleJson`): `{ "days": [1..7], "from": "HH:MM", "to":
  "HH:MM", "timezone": "Europe/Madrid" }`. Fuera del horario la regla no
  aplica y se prueba la siguiente; admite franjas que cruzan la medianoche.

`validateRoutingRule()` comprueba al guardar el ámbito, el horario y que la
oficina o el equipo de `matchValue` son de la agencia (`matchValue` es
texto, el motor genérico no puede validarlo como relación).

Con comercial elegido en el alta manual no se enruta: se asigna y queda en
el historial como «Asignado a mano en el alta». La ficha enseña el
historial de asignaciones con la regla y quién lo hizo.

## SLA (FASE 16)

| Medida | Quién la rellena |
| --- | --- |
| `createdAt` | La entrada del lead |
| `firstContactAt` | `markLeadContacted()` en el primer contacto saliente por cualquier canal (WhatsApp aceptado por el proveedor, llamada contestada o anotada como contestada), o un usuario que pasa el lead a Contactado o más allá |
| `firstResponseAt` (primera respuesta humana) | Lo mismo cuando lo hace una persona; también el primer cambio de fase manual |
| `qualifiedAt` | La primera vez que llega a Cualificado |
| `firstAppointmentAt` | La primera cita: reserva pública, cita o tour creados desde el panel |
| `lastContactAt` | Cada contacto, entrante o saliente |

La primera respuesta humana cierra la alerta «sin atender» en el momento,
sin esperar al cron; «sin contacto X días» cuenta ya los contactos que salen
de la agencia. Las citas y tours del panel validan ahora que el lead sea de
la organización (antes un id ajeno se guardaba en la cita).
