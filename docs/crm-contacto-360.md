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
  Actividad, Ficha y duplicados.
- **Listado de Contactos**: filtro por rol y roles de cada fila.
- **Editor de propiedades**: paso «Propietarios»
  (`components/property-builder/PropertyContactsManager.vue`) en los dos
  catálogos — buscar o crear el contacto, papel, %, principal.
- **Notas**: `components/admin/notes/NotesPanel.vue`, reutilizable en
  cualquier entidad.

## Pruebas

- `test/unit/contactsCrm.test.ts`: validación de cabecera y roles, edición
  con 409 por duplicado, aislamiento entre agencias, suma de % de
  propietarios, listados de los dos catálogos, notas y su desnormalización.
- `tests/e2e/nucleo-n2.spec.ts`: API completa (alta, edición, 409, filtro por
  rol, propietarios con %, notas, aislamiento) y navegador (cabecera,
  «Editar», pestañas, notas, tareas, paso «Propietarios»).
