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
| `PATCH /api/admin/saas/leads/:id` | Fase (`stage` + `reason`) o resultado (`lost`, `lostReason`, `note`) — lo único que escribe `lead_stage_history`. Desde el cierre D2L el motivo es obligatorio (422 sin él) y un lead de otra agencia es un 404 |
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
- **Propiedad de interés con su catálogo** (cierre D2L, migración 0089): el
  formulario usa el buscador de los dos catálogos (el `EntityPicker` de
  citas y tours, `GET /api/admin/saas/properties/search`) y manda
  `propertyId` + `propertyKind` (`agent` = 2ª mano, `developer` = obra
  nueva). Sin catálogo es un 422 —nunca se adivina—, de otra agencia un 404
  y en la papelera un 422 (`assertLiveProperty`). Volver a guardar la misma
  propiedad (id y catálogo) no la revalida, para que una que se mandó
  después a la papelera no impida editar el resto. Quitarla deja los dos
  campos a NULL. La ficha (`GET /api/admin/leads/:id` → `property`) trae
  catálogo, nombre, si está en la papelera, el enlace a su ficha
  (`adminPath`) y `inferred` cuando el lead es anterior a la 0089.
- **Contacto**: el formulario tiene un selector opcional de contactos
  existentes (`contactId`). Sin él, el alta resuelve la persona como
  siempre (`resolveContact`). Uno de otra agencia es un 404; uno archivado
  (unificado con otro o en la papelera) un 422.

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

**Motivo obligatorio en cada movimiento (cierre D2L).** Antes el motivo sólo
se exigía al perder; la ficha lo tenía opcional, el Kanban y la Tabla no lo
pedían y la acción masiva escribía siempre «Acción masiva». Ahora:

- `components/admin/leads/LeadStageReasonModal.vue` pide el motivo con
  motivos rápidos en chips según la fase de destino
  (`utils/leadCatalog.ts#LEAD_STAGE_QUICK_REASONS`, más
  `LEAD_STAGE_GENERIC_REASONS`) y texto libre (máx. 300). La usan «Cambiar
  fase…» y «Reactivar» en la ficha, soltar una tarjeta en el Kanban (sacar
  una de «Perdidos» la reactiva), la fase de la Tabla y la acción masiva
  «Cambiar fase» (su ventana hace de confirmación). Cancelar no mueve nada.
- El servidor lo exige en la ruta del panel
  (`requirePanelStageReason`, `server/utils/leads/pipeline.ts`): `reason`
  al cambiar de fase, `lostReason` del catálogo al perder (el comentario
  `note` sigue siendo opcional) y `note` al reactivar → 422 sin él.
- La acción masiva valida `params.reason` al crear el job
  (`validateLeadBulkParams`, `server/utils/bulkActions/leadActions.ts`):
  sin motivo el job no se crea. Cada fila del historial dice «Acción
  masiva: <motivo>».
- Las entradas automáticas no pasan por esa validación: las
  automatizaciones y los workflows de INMO ya traen su motivo descriptivo,
  y `update_lead` sin `reason` deja «Automatización», «Cambio hecho con
  INMO» o «Domain Tools API» según quién llame.

Edición inline en la vista Tabla (cierre C1): la «Fase» y el «Comercial» de
cada fila se cambian ahí mismo (`components/admin/InlineEdit.vue`: clic →
desplegable → se guarda al elegir; Esc o × cancela; el error del servidor
se queda visible bajo el control). La fase va por el MISMO
`PATCH /api/admin/saas/leads/:id` que el Kanban (`transitionLeadStage` /
`setLeadOutcome`, con su fila en `lead_stage_history`); «Perdido» abre el
mismo modal de motivo (cancelarlo no cambia nada), y llevar a una fase un
lead perdido lo reactiva primero (`'reactivated'`) y después lo mueve, así
el historial dice las dos cosas. El comercial va por la misma reasignación
(`/reassign`, historial de asignaciones y `LEAD_REASSIGNED`). Sólo se
ofrece con escritura en CRM; sin ella la fila sólo enseña los valores.

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

- **Propiedad / zona / tipo / obra nueva** (cierre D2L): el contexto sale
  de la propiedad del lead EN SU CATÁLOGO (`leads.property_kind`,
  `buildRoutingContextFromProperty(…, propertyKind)`). Antes se probaba
  primero 2ª mano y luego obra nueva, y con el mismo id en los dos
  catálogos un lead de la web de obra nueva se enrutaba con la zona y el
  comercial de un piso de 2ª mano. Esa resolución heredada se conserva sólo
  para los leads sin catálogo (NULL), en `resolveLeadPropertyKind()`
  (`server/utils/leads/property.ts`). La regla «Propiedad» usa el
  `agent_id` del catálogo resuelto (las dos tablas lo tienen desde la 0047;
  antes sólo se miraba 2ª mano).

- **Oficina**: `matchValue` = id de la oficina; aplica a los leads de esa
  oficina (vacío: a todos). `targetOfficeId` limita el reparto a los
  comerciales de una oficina en cualquier regla.
- **Equipo**: `matchValue` = id del equipo (entidad Equipos); reparte entre
  sus comerciales.
- **Idioma**: compara con `leads.language`, los dos lados normalizados al
  catálogo (`utils/crmCatalog.ts#normalizeLanguage`: «en-GB», «English» o
  «Inglés» son `en`). Hasta el cierre D2L sólo lo rellenaba el alta manual y
  esta regla no se aplicaba nunca a un lead entrante. Ahora:
  - la web pública lo envía en contacto, captación (Constructor Web), reserva
    de visita, verificación de visitante, referidos y chat
    (`composables/useVisitorLanguage.ts`: el idioma elegido en el selector
    de la web —cookie `locale_chosen`— o, si no eligió, el del navegador), y
    el servidor lo normaliza (`server/utils/leads/captureLanguage.ts`; uno
    fuera del catálogo se queda en NULL, nunca rompe el formulario);
  - la API v1 acepta `language` (fuera del catálogo → 422);
  - INMO `create_lead` acepta `language`;
  - `upsertLead()` lo normaliza, lo guarda si el lead no tenía y lo pasa al
    Contact que crea; nunca pisa el que ya tiene.
  WhatsApp (webhooks de Meta/Twilio) no informa del idioma: esos leads
  siguen llegando sin él.
- **Horario** (`scheduleJson`): `{ "days": [1..7], "from": "HH:MM", "to":
  "HH:MM", "timezone": "Europe/Madrid" }`. Fuera del horario la regla no
  aplica y se prueba la siguiente; admite franjas que cruzan la medianoche.

`validateRoutingRule()` comprueba al guardar el ámbito, el horario y que la
oficina o el equipo de `matchValue` son de la agencia (`matchValue` es
texto, el motor genérico no puede validarlo como relación); en una regla de
idioma guarda el código del catálogo (422 si no es ninguno).

**Editor de reglas (cierre D2L).** `/admin/lead-routing-rules/:id` ya no usa
el formulario genérico (id de oficina o equipo tecleado, horario como JSON):
`components/admin/leads/RoutingRuleEditor.vue` ofrece desplegables de las
oficinas, equipos, comerciales, idiomas y tipos de inmueble de la agencia
según el ámbito, y un editor de horario (días L-D, franja desde/hasta, zona
horaria, atajos «Laborables», «Fines de semana», «Noches») que genera el
mismo JSON de arriba —una franja por regla—. Guarda por el mismo CRUD
genérico. El listado enseña la oficina o el equipo de `matchValue` por su
nombre.

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

## Cierre D2L: dónde más se usa el catálogo de la propiedad

Todo lo que escribe `leads.property_id` escribe también `property_kind`
cuando lo sabe:

| Entrada | Catálogo |
| --- | --- |
| Alta y edición del panel | el elegido en el buscador (obligatorio con propiedad) |
| Formulario de contacto / captación y chat de la web | `developer` (la web sólo enseña obra nueva: `publicPropertyBySlug`) |
| Reserva de visita con un comercial | `developer` (sólo admite `developer_properties`) |
| API v1 (`POST /api/v1/leads`) | `propertyKind` del cuerpo; sin él, `developer` (como siempre); ajena o en la papelera → 422 |
| INMO `create_lead` | `propertyKind`; sin él, `developer` |
| INMO `update_lead` | `propertyId` + `propertyKind` obligatorios juntos (`null` la quita) |
| Unificar en un lead existente / reutilizarlo (`upsertLead`) | el de la entrada nueva, nunca un id nuevo con el catálogo del anterior |

Lectores que ya lo usan: el enrutado (arriba), la ficha del lead, el
contador de leads de la ficha pública de una promoción
(`engagement.get.ts`: sólo `developer` o NULL), y el filtro por inmueble del
dashboard comercial y del listado de leads (`propertyKind` opcional junto a
`propertyId`; los leads antiguos sin catálogo siguen contando).

Pruebas: `test/unit/cierreD2l.test.ts` y `tests/e2e/cierre-d2l.spec.ts`.
