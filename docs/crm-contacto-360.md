# Contacto 360, roles, propietarios y notas

Núcleo inmobiliario, bloque N2 (megaprompt FASES 0, 8 y 9; ver
[`auditoria-nucleo-megaprompt.md`](./auditoria-nucleo-megaprompt.md)). Usa las
tablas de la migración 0086: `contact_roles`, `property_contacts`, `notes` y
las columnas nuevas de `contacts` (`country`, `source`, `office_id`,
`last_contact_at`, `next_action_type`, `next_action_at`).

## Qué faltaba

- Un contacto **no se podía editar**: `updateContact()` existía sin ninguna
  ruta.
- No había roles (comprador, vendedor, propietario…), ni forma de decir quién
  es el propietario de una propiedad, ni notas como entidad.
- La ficha del contacto tenía cuatro pestañas (Necesidades, Leads,
  Comunicaciones, Ficha).

## API (sin rutas nuevas)

Tres recursos del motor CRUD genérico (`server/utils/adminResources.ts`), con
su lógica en `server/utils/contacts/crm.ts`:

| Recurso | Para qué | Reglas |
|---|---|---|
| `contacts` | alta (`POST`), lectura (`GET /:id`, con `roles`), edición (`PUT /:id`), papelera | Alta y edición pasan por la misma normalización (teléfono, email) y deduplicación que Contactos → Nuevo: si el email/teléfono es de **otra** persona de la agencia, 409 con `data.duplicates`, salvo `force: true`. `roles` deja exactamente esos roles. Restaurar un contacto lo deja «activo». |
| `property-contacts` | propietario, copropietario, apoderado, inquilino o contacto de una propiedad (`propertyKind` + `propertyId`) | Propiedad y contacto de la misma agencia (404 si no); sólo propietario/copropietario llevan %; la suma de % de los vivos de la propiedad **no pasa del 100**; la misma persona no puede estar dos veces con el mismo papel (409). Vincular como propietario añade el rol «Propietario». Filtros: `propertyKind`, `propertyId`, `contactId`, `role`. El listado trae `contact` (nombre, email, teléfono). |
| `notes` | nota sobre un contacto, lead, propiedad (con `propertyKind`), cita u operación | La entidad tiene que existir y ser de la agencia. Rellena la columna desnormalizada (`contactId`, `leadId`…): una nota sobre un lead también aparece entre las del contacto. El autor es la sesión. Fijadas primero. Borrar = papelera. Filtros: `entityType`, `entityId`, `propertyKind`, `contactId`, `leadId`, `propertyId`, `appointmentId`, `dealOperationId`. |

El motor genérico gana dos capacidades declarativas, usadas por estos
recursos:

- `filterFields`: columnas por las que el listado admite un filtro exacto por
  query. Sólo esas, nunca una columna arbitraria.
- `decorateRows`: completa las filas del listado con datos de otras tablas,
  siempre acotado a la organización.

`GET /api/admin/saas/contacts/:id` (la ficha 360) devuelve además: `roles`,
nombre del comercial y de la oficina, `score` (el mejor de sus leads),
`lastContactAt` (el más reciente entre la ficha y sus leads), `properties`
(en las que figura, de los dos catálogos), `visits` (por `contact_id`, por sus
leads o por su email) y `documents` (de sus propiedades y los concedidos).
Ofertas (`saas/offers?buyerContactId|sellerContactId`), tareas
(`saas/tasks?contactId`), notas (`notes?entityType=contact`) y actividad
(`saas/activity?contactId`) se piden por pestaña.

`GET /api/admin/saas/contacts` admite `role` y devuelve los `roles` de cada
contacto.

## Panel

- **Ficha del contacto** (`pages/admin/contactos/[id].vue`): cabecera con
  teléfono, email, WhatsApp, idioma, país, comercial, oficina, origen, estado,
  score, último contacto y próxima acción, botones Llamar / WhatsApp / Email y
  «Editar» (`components/admin/contacts/ContactEditModal.vue`). Pestañas:
  Resumen, Necesidades, Propiedades, Leads, Visitas, Ofertas,
  Comunicaciones, Emails, WhatsApp, Llamadas, Tareas, Documentos, Notas,
  Actividad, Ficha y duplicados. «Documentos» (bloque N7a) lista lo que esa
  persona puede descargar y por qué (propietaria, acceso concedido o
  público), con los concedidos sin efecto marcados — ver
  [`documentos-y-multimedia.md`](./documentos-y-multimedia.md).
- **Listado de Contactos**: filtro por rol y roles de cada fila.
- **Editor de propiedades**: paso «Propietarios»
  (`components/property-builder/PropertyContactsManager.vue`) en los dos
  catálogos — buscar o crear el contacto, papel, %, principal.
- **Notas**: `components/admin/notes/NotesPanel.vue`, reutilizable en
  cualquier entidad. Montado en la ficha del contacto, del lead, de la
  propiedad (los dos catálogos, en `PropertyCrmPanels.vue`), de la cita
  (`AppointmentDetailModal.vue`) y de la operación (cierre D3a). El recurso
  `notes` valida en el servidor que esa propiedad (en su catálogo), cita u
  operación sea de la agencia (404 si no) y el listado va acotado a ella.
- **«Creado por X el Y»** (cierre D3a): la cabecera del contacto enseña quién
  lo dio de alta (`createdByName`, o «usuario eliminado» con
  `createdByDeleted`), resuelto en el servidor con `withCreatorNames()`
  (`server/utils/crm/labels.ts`): sólo usuarios de la agencia (y el super
  admin de la plataforma), en lote y troceado. Lo mismo en la ficha del lead,
  la cita, la operación y cada tarea (`components/admin/CreatedBy.vue`).

## Alta de un contacto: WhatsApp, id externo y «Unificar» (cierre D2L)

El servidor ya deduplicaba por email, teléfono, WhatsApp e id externo
(`findDuplicateContacts`), pero «Contactos → Nuevo contacto» sólo pedía
nombre, tipo, email y teléfono, el id externo no tenía interfaz en ningún
sitio y ante un duplicado sólo dejaba abrir el existente o crear igualmente.

- El alta y la edición (`ContactEditModal.vue`) piden también **WhatsApp** e
  **id externo con su sistema** (`externalSource` + `externalId`: «12345»
  de Idealista no es «12345» de otro CRM). Los dos van juntos (422 si
  falta uno) y la pareja no puede ser de otro contacto de la agencia, ni
  siquiera archivado (409, también con `force`: el índice único
  organización+sistema+id no admite «crear igualmente»). La ficha lo
  enseña en «Ficha y duplicados».
- `POST /api/admin/saas/contacts` (el alta del panel) pasa por
  `createContactFromPanel()` (`server/utils/contacts/crm.ts`): valida igual
  que la edición —antes guardaba el cuerpo tal cual, también un comercial u
  oficina de otra agencia (ahora 404)— y devuelve la fila como siempre.
- **«Unificar»** (`mergeIntoContactId`, también en `POST
  /api/admin/contacts`): `unifyIntoContact()` completa el contacto
  existente con los datos NUEVOS que le falten y no crea ninguno. Reglas:
  nunca pisa un dato que ya tiene (un email distinto se ignora y se
  informa en `skipped`); nunca le pone un email, teléfono, WhatsApp o id
  externo que ya sea de OTRA persona de la agencia (sería un duplicado
  cruzado); los roles marcados se suman sin quitar ninguno; las notas se
  añaden a las suyas. El contacto tiene que ser de la agencia y estar
  activo (404 si no). Queda en Activity como `CONTACT_UNIFIED` (metadata:
  `filled`, `skipped`, `addedRoles`) y en Auditoría. El panel abre después
  la ficha del contacto unificado.

No es la fusión de dos fichas (abajo): «Unificar» al dar de alta no mueve
nada de otra ficha porque la otra no llega a existir.

## Unificar duplicados

«Ficha y duplicados» → «Buscar duplicados» → «Revisar y fusionar»
(`server/utils/contacts/merge.ts`, endpoints `saas/contacts/merge-preview` y
`saas/contacts/merge`). Nunca automático, nunca un `DELETE` del contacto: el
duplicado se archiva (`status: 'archived'`, `deletedAt`) y todo lo que
colgaba de él pasa al que se conserva, siempre con `organization_id` de la
agencia:

| Qué | Cómo se mueve |
| --- | --- |
| Necesidades, leads, clientes, tareas, citas, selecciones de propiedades | `contactId` → superviviente |
| Compatibilidades (matches de los dos catálogos) | `contactId` → superviviente (es la copia del de su necesidad); estado y puntuación no cambian |
| Ofertas y operaciones como comprador | `buyerContactId` → superviviente |
| Vendedor de una oferta u operación | se mueve; si el superviviente ya vende en esa misma, se borra la fila repetida (índice único) |
| Propietario / inquilino de una propiedad (`property_contacts`) | se mueve; si el superviviente ya tiene **el mismo papel en la misma propiedad**, queda una sola fila: la suya, con el % de las dos sumado (la suma de la propiedad no cambia, así que no puede pasar del 100 %), principal si lo era cualquiera y las notas de ambas; la del duplicado va a la papelera y se queda en él. Las que ya estaban en la papelera se mueven tal cual |
| Roles | se mueven; un rol que el superviviente ya tiene se borra (índice único) |
| Accesos a documentos (`property_document_access`) | se mueven; si el superviviente ya tenía acceso a ese documento, se borra la fila repetida. Así un propietario o comprador unificado no pierde sus documentos en «Mi cuenta» ni en la pestaña «Documentos» |
| Notas | las de la persona (`entityType: contact`) y la columna `contactId` de las que cuelgan de sus leads |
| Etiquetas | se mueven; una que el superviviente ya tiene se borra (índice único) |
| Campos personalizados | sólo los que el superviviente no tiene; un valor distinto del duplicado se queda en él (archivado), nunca pisa el suyo |
| Cabecera | idioma, país, origen, oficina, comercial y próxima acción se heredan sólo si el superviviente los tiene vacíos; «último contacto» es el más reciente de los dos; las notas libres se juntan |
| Actividad | **no se reescribe** (`activities` es append-only). Se registra `CONTACT_MERGED` en el superviviente con `mergedContactIds`, y su cronología (`listActivity` → `contactActivityCond`) incluye la de esos contactos; en cadena (A → B → C) C ve la de los tres |

**Bloqueos.** Si uno es comprador y el otro vendedor en la misma oferta u
operación, no son la misma persona: la vista previa lo explica, el botón
«Confirmar fusión» queda desactivado y el servidor responde 422 sin mover
nada (no se «arregla» quitando a uno de los dos lados).

Las comunicaciones (WhatsApp, llamadas) cuelgan del lead o del cliente, así
que siguen a la persona al moverse estos.

## Pruebas

- `test/unit/cierreD2l.test.ts`: alta con WhatsApp e id externo
  (duplicados, id externo sin sistema o ya usado), «Unificar» (no pisa, no
  crea duplicados cruzados, Activity) y aislamiento entre agencias.
- `test/unit/contactsCrm.test.ts`: validación de cabecera y roles, edición
  con 409 por duplicado, aislamiento entre agencias, suma de % de
  propietarios, listados de los dos catálogos, notas y su desnormalización;
  unificar duplicados (cada vínculo pasa al superviviente, choques de
  índices únicos, % sumado sin pasar del 100 %, bloqueo comprador/vendedor,
  cronología en cadena y nada de otra agencia se toca).
- `tests/e2e/nucleo-n2.spec.ts`: API completa (alta, edición, 409, filtro por
  rol, propietarios con %, notas, aislamiento) y navegador (cabecera,
  «Editar», pestañas, notas, tareas, paso «Propietarios»).
