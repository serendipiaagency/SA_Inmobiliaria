# Campos personalizados y etiquetas (bloque N7b, FASE 0)

**Qué cierra:** dos hallazgos de la FASE 0 de `docs/auditoria-nucleo-megaprompt.md`:

- **CustomFieldDefinition / CustomFieldValue — FALTA.** Las tablas existían desde la migración 0086, pero nada las usaba.
- **Tag — PARCIAL.** Sólo lo escribía la acción masiva «Añadir etiqueta»: no se veía, no se filtraba y los contactos no se podían etiquetar.

**Sin migración nueva y sin ficheros de ruta nuevos.** Todo va por el motor genérico (`server/api/admin/[resource]/**` + `server/utils/adminResources.ts`) y por parámetros nuevos de endpoints que ya existían.

## Campos personalizados

### Definición (CRM → Campos personalizados)

Página `pages/admin/campos-personalizados.vue`, recurso genérico `custom-fields` (área **CRM**), tabla `custom_field_definitions`.

| Dato | Regla (servidor: `server/utils/customFields/service.ts#validateCustomFieldDefinition`) |
|---|---|
| Se aplica a (`entityType`) | `property` (los dos catálogos), `contact`, `lead`, `appointment` (cita), `deal` (operación). No cambia una vez creado. |
| Etiqueta | Obligatoria, ≤ 120 caracteres. |
| Clave (`key`) | `a-z0-9_`, empieza por letra; si no se da, sale de la etiqueta («Fecha de llaves» → `fecha_de_llaves`). No cambia una vez creada (los valores cuelgan de ella). Repetida en la misma agencia y entidad → 409 con un mensaje claro (también si está en la papelera). |
| Tipo | `text`, `textarea`, `number`, `boolean`, `date`, `select`, `multiselect`. Sólo se puede cambiar mientras ningún registro tenga valor. |
| Opciones | Obligatorias y sin repetir en `select`/`multiselect` (≤ 100, ≤ 120 caracteres cada una); el resto no guarda opciones. |
| Sección, orden, ayuda | Agrupan y ordenan el campo en la ficha; la ayuda sale debajo del control. El orden se cambia con ▲▼ (reescribe 10, 20, 30… para no dejar empates). |
| Obligatorio | El panel de la ficha no guarda sin él (se comprueba sobre el estado resultante: lo guardado + lo nuevo). |
| Público | **Sólo en propiedades.** En cualquier otra entidad → 422. Es lo único que puede salir en la web. |
| Estado | `active` / `archived`. Archivar lo oculta de las fichas y conserva los valores. |

Borrar manda la definición a la Papelera (`deleted_at`); restaurar la devuelve; «Eliminar definitivamente» borra también todos sus valores.

### Valores (en cada ficha)

Componente reutilizable `components/admin/custom-fields/CustomFieldsPanel.vue`, montado en:

| Ficha | Dónde |
|---|---|
| Propiedad (web y 2ª mano) | Debajo del editor, panel «Etiquetas / Campos personalizados» (`components/admin/property/PropertyExtraPanels.vue`, una línea en `PropertyBuilder.vue`). |
| Contacto | Pestaña «Ficha y duplicados». |
| Lead | Pestaña «Datos». |
| Cita | Ventana de detalle de la cita (Visitas y Calendario). |
| Operación | Columna derecha de la ficha de la operación. |

Dos recursos sobre la misma tabla `custom_field_values`, porque el área de permisos la pone la entidad (mismo patrón que `property-bulk-jobs` / `lead-bulk-jobs`):

| Recurso | Área | Entidades |
|---|---|---|
| `property-custom-field-values` | Portal Web | `property` (`entityKind`: `agent` \| `developer`) |
| `custom-field-values` | CRM | `contact`, `lead`, `appointment`, `deal` |

- `GET /api/admin/<recurso>?entityType=…&entityKind=…&entityId=…` → `{ definitions, values }` (las definiciones activas, en orden, y el valor de cada clave). Sin `entityId`: sólo `{ definitions }`.
- `POST /api/admin/<recurso>` con `{ entityType, entityKind?, entityId, values: { clave: valor } }` → guarda **sólo** las claves que llegan (vacío = borrar el valor) y devuelve lo mismo que el GET.
- `PUT` y `DELETE` por fila → 405: un valor se guarda o se vacía desde el panel.

Validación por tipo (`validateCustomFieldValue`): texto ≤ 500, texto largo ≤ 5.000, número (admite coma decimal), sí/no (`true/false`, `1/0`, `sí/no`), fecha `AAAA-MM-DD` que exista, lista (una de sus opciones), lista múltiple (sus opciones, sin repetir). Una clave que no es de un campo activo de esa entidad y agencia → 422 que la nombra. El panel envía sólo lo que cambió, así un valor antiguo que ya no es una opción no impide guardar el resto.

`entity_kind` guarda el catálogo en las propiedades y repite el tipo en el resto: con NULL, SQLite no aplicaría el índice único (`definition_id`, `entity_kind`, `entity_id`).

### Aislamiento

Todo se acota por la organización: la entidad (`assertCustomFieldEntity`), cada definición (sólo las de la agencia y esa entidad) y cada valor. Un registro de otra agencia → 404. Pedir una propiedad por el recurso de CRM (o al revés) → 404. Lo cubren `test/unit/customFields.test.ts` y la matriz `test/unit/multitenant.crossTenant.test.ts`.

### Web pública

`GET /api/public/properties/:slug` devuelve `customFields`: sólo los de `isPublic = 1`, activos, no borrados y con valor, ya formateados. La ficha pública (`pages/propiedades/[slug].vue`) los enseña en «Más información». Un campo interno nunca sale, ni vacío ni con valor: el filtro está en la consulta (`publicCustomFieldsFor`). 2ª mano no tiene ficha pública, así que sus campos públicos no salen en ninguna web todavía.

### Búsqueda por campo personalizado

En el listado de propiedades (los dos catálogos), «Filtros → Campo personalizado». Parámetros: `cf_<id>=valor` (texto: contiene; lista, número, sí/no, fecha: igual; lista múltiple: incluye), `cf_<id>_min` / `cf_<id>_max` (número y fecha). Una subconsulta por filtro (máximo 10), correlacionada con la propiedad y su organización: el id de una definición de otra agencia no coincide con nada.

## Etiquetas

El mismo Tag transversal de la acción masiva (`tags` / `tag_links`, `server/utils/tags/service.ts`), ahora con lectura, alta y baja a mano:

| Recurso | Área | Entidades |
|---|---|---|
| `property-tags` | Portal Web | `agent`, `developer` |
| `crm-tags` | CRM | `lead`, `contact` (**nuevo**: los contactos se pueden etiquetar) |

- `GET /api/admin/<recurso>?entityType=…&entityId=…` → las etiquetas del registro (con `linkId`). Sin registro: el catálogo de la agencia, con cuántas veces se usa cada una.
- `POST /api/admin/<recurso>` con `{ entityType, entityId, name }` (se crea si no existe; idempotente) o `{ …, tagId }` (una etiqueta de la agencia; otra → 404).
- `DELETE /api/admin/<recurso>/<linkId>` → quita el enlace (la etiqueta sigue en el catálogo). Un enlace de otra agencia o del área equivocada → 404.

Dónde se ven y se editan: `components/admin/tags/TagsEditor.vue` en la cabecera de la ficha del contacto y del lead y en el panel de la propiedad; `TagChips.vue` en los listados (propiedades en lista y en tarjetas, leads en Pipeline y Tabla, contactos).

Filtros: `tags=<id>[,<id>…]` (debe tener todas) en `GET /api/admin/{properties,developer-properties}`, `GET /api/admin/saas/leads` y `GET /api/admin/saas/contacts`; los listados devuelven `tags` en cada fila. Las etiquetas de una página salen en una sola consulta con los ids como un único parámetro JSON (`json_each`): nunca choca con el límite de 100 parámetros de D1. Borrar definitivamente una propiedad se lleva sus enlaces y sus valores de campos personalizados (tablas polimórficas sin FK).

## Qué no se ha hecho

- Gestionar el catálogo de etiquetas (renombrar, color, borrar una etiqueta en todas partes): no se pedía; hoy una etiqueta sin uso se queda en el catálogo.
- Campos personalizados en el CSV de exportación y en la web pública de 2ª mano (no existe esa web).
- Campos personalizados en el alta (formularios «Nuevo …»): se rellenan en la ficha una vez creada.
