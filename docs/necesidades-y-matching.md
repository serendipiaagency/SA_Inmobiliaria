# Necesidades del comprador y matching con acciones (núcleo N4, FASES 10 y 11)

Complementa `docs/matching-and-lead-pipeline.md` (diseño del motor, dos
catálogos, estados del match). Aquí está lo que añadió el bloque N4: el editor
completo de la necesidad, la importancia por criterio, el estado del inmueble
en el motor, «Compradores compatibles» en la ficha de propiedad y las acciones
sobre una compatibilidad desde cualquier vista. Sin migraciones: todo usa
columnas que ya existían (`buyer_requirements`, `buyer_requirement_criteria`,
`agent_properties.condition`, `developer_properties.condition`,
`property_details`, `property_selections`, `visits.contact_id`).

## Catálogo único (`utils/buyerRequirementCatalog.ts`)

Vocabularios y etiquetas en castellano, compartidos por el servidor (validación
y líneas del desglose) y el panel: estados, operaciones, importancias,
urgencias, `buildPref`, `conditionPref`, estados de hipoteca, criterios con
importancia, características y de qué columna del inmueble sale cada una
(`FEATURE_SOURCES`), importancia por defecto, filtros duros, estados del match
y tipos de zona. `server/utils/buyerRequirements/service.ts` reexporta los
nombres que ya exportaba (`STATUSES`, `OPERATIONS`, `MORTGAGE_STATUSES`…).

El estado físico del inmueble (`new | excellent | good | to_renovate |
to_reform`, «A estrenar … A reformar») está en `utils/propertySheet.ts`
(`PROPERTY_CONDITIONS`, `PROPERTY_CONDITION_LABELS`), el mismo que usa el
editor de propiedad.

## La necesidad completa

- **Tipos de inmueble**: los 15 del catálogo común (`utils/propertySheet.ts#PROPERTY_TYPES`).
  Los cinco que se aceptaban antes son un subconjunto, así que lo guardado no cambia.
- **Validación nueva** (`validateBuyerRequirement`): zonas estructuradas
  (lista de `ZoneRef`, ninguna vacía, máximo 30, la misma zona no puede ser
  deseada y excluida — se compara por su referencia principal), fecha deseada
  `AAAA-MM-DD`, centro del radio con latitud/longitud válidas, `needsMortgage`
  0/1/null, números que son números, criterios de importancia y
  características sólo del catálogo, y el precio nunca «indiferente».
- **Errores**: `BuyerRequirementValidationError.statusCode` — 422 para un dato
  inválido; 404 para un contacto o un comercial asignado que no son de la
  agencia (el POST y el PATCH lo propagan tal cual).
- **Editar** (`updateBuyerRequirement`): lo guardado se sanea antes de
  combinarlo con lo que llega (`storedAsInput`), así que una fila antigua con
  un dato mal formado se puede seguir pausando o editando. Quitar el radio
  (`radiusKm: null`) deja también el centro a NULL. Si llegan `importances` o
  `features`, los criterios se reemplazan en bloque.
- **Presupuesto validado**: sigue siendo su propio endpoint
  (`POST /buyer-requirements/:id/validate-budget`). El listado devuelve además
  `budgetValidatedByName` (el nombre del usuario de la agencia que lo validó).
- **Resumen** (`summarizeRequirement`): tipos con su etiqueta («Piso/Ático»),
  zonas excluidas («sin Lavapiés»), radio y las ocho características.

## Importancia por criterio

| Criterio | Importancias | Por defecto | Dónde vive |
|---|---|---|---|
| Tipo de inmueble | imprescindible / preferible / indiferente | **imprescindible** | fila `propertyType` |
| Precio | imprescindible / preferible | preferible | fila `price` |
| Superficie, dormitorios, baños | las tres | preferible | filas `area`, `bedrooms`, `bathrooms` |
| Zona (deseadas + radio) | las tres | preferible | fila `zone` |
| Estado (`conditionPref`) | las tres | preferible | fila `condition` |
| Obra (`buildPref`) | las tres | preferible | fila `build` |
| Terraza, garaje, ascensor, piscina, jardín, accesible, admite mascotas, aire acondicionado | las tres | — (sin declarar) | fila con `valueBool` 1 (la quiere) o 0 (la quiere sin) |

- Para los criterios con valor propio, **«indiferente» sí se guarda** como
  fila: el tipo es imprescindible por defecto y hay que poder distinguir «no
  le importa» de «no lo ha dicho». Para las características, «indiferente» es
  no guardar la fila (es lo mismo que no haberla mencionado).
- El editor sólo envía la importancia de los criterios que tienen valor.

### Siempre filtro duro (`HARD_FILTER_NOTES`)

- **Operación**: comprar no es alquilar (motor y prefiltro SQL).
- **Precio**: el prefiltro SQL corta lo que se pasa más de un 10 % del máximo
  (o se queda más de un 10 % por debajo del mínimo), en las dos direcciones.
  Dentro del margen decide la importancia.
- **Zonas excluidas**: un inmueble en una zona excluida queda descartado
  aunque la zona sea «preferible» o «indiferente» (`forceRequired` en el motor).
- **Tipo de inmueble**: imprescindible por defecto. El prefiltro SQL de
  Necesidad → inmuebles sólo recorta por tipo cuando es imprescindible; así,
  bajarlo a preferible hace que los otros tipos lleguen al motor y puntúen, y
  las dos direcciones dicen lo mismo.

## El motor (`server/utils/matching/engine.ts`, `RULES_VERSION = 2`)

- **Estado** (`conditionPref` frente a `condition` del inmueble):
  - «En buen estado»: a estrenar / excelente / buen estado ✓, a renovar △, a reformar ✕.
  - «Para reformar»: a reformar / a renovar ✓, en buen estado △ (no es lo que busca, pero no lo descarta).
  - «Cualquier estado» o sin preferencia: sin criterio.
  - Sin dato en la ficha: «no consta el estado del inmueble» (?), nunca se da por bueno.
- **Obra** (`buildPref`): obra nueva / segunda mano por el año de construcción
  (≥ año actual − 2 es obra nueva); «reformado» por `property_details.is_renovated`
  o `renovation_year`. Sin el dato: «no consta». Nunca se deduce del catálogo
  en el que se dio de alta la ficha.
- **Zona**: zonas deseadas y radio se **suman** (basta con una de las dos);
  antes el radio pisaba a las zonas sin avisar. Gana el mejor resultado; si
  una vía descarta con datos y la otra no se puede medir, la línea dice «no se sabe».
- **Características nuevas**: accesible y admite mascotas siguen la regla de
  las columnas `NOT NULL DEFAULT 0` (un 0 sólo es «no» si la ficha está
  repasada); aire acondicionado sale de `property_details`, donde NULL es «no
  consta» y 0 es un «no» escrito.
- El servicio añade a cada candidato los datos de la ficha ampliada que el
  motor lee (`withPropertyDetails`), por trozos (`server/utils/sqlChunks.ts`:
  D1 no admite más de 100 parámetros por consulta). Los `IN` de criterios y
  contactos de Inmueble → compradores también van por trozos.

## Acciones sobre una compatibilidad

Componente `components/admin/matching/MatchActions.vue`, el mismo en las tres
vistas: la ficha de propiedad (paso «Compradores compatibles»),
Compatibilidades y la pestaña «Necesidades» del contacto.

| Acción | Cómo | Estado del match |
|---|---|---|
| Seleccionar / quitar selección | `POST /api/admin/saas/matching/matches` `{ status: 'selected' \| 'new' }` | seleccionado / nuevo |
| Enviar propiedad | `POST /api/admin/comms/conversations` + `…/:id/share-property` con `buyerRequirementId` | «Enviado» sólo si el proveedor acepta (`markMatchSent`, ahora sólo hacia delante: no retrocede un visitado/ofertado ni resucita un descarte) |
| Crear selección | `POST …/matching/matches` `{ action: 'selection', buyerRequirementId, items[] \| propertyId+propertyKind, title?, notes?, selectionId? }` | nuevo/sin decidir → seleccionado |
| Crear visita | `POST …/matching/matches` `{ action: 'visit', buyerRequirementId, propertyId, propertyKind, agentId, scheduledAt, channel? }` | nuevo/sin decidir → seleccionado |
| Descartar (con motivo) / recuperar | `POST …/matching/matches` `{ status: 'discarded', discardedReason }` / `{ status: 'new' }` | descartado / nuevo |

- Sin teléfono ni WhatsApp en la ficha del contacto, «Enviar propiedad» está
  deshabilitado y lo dice («Sin teléfono: no se le puede enviar»). Sin número
  de WhatsApp conectado en la agencia, el modal lo explica y ofrece abrir
  WhatsApp con el número: la propiedad **no** queda marcada como enviada.
- `server/utils/matching/actions.ts`: `createSelectionFromMatch()` reutiliza
  `createPropertySelection()` (el de la tool `create_property_selection` de
  INMO) o `addItemsToPropertySelection()` (nuevo: añade sin duplicar, máximo 30)
  y deja `PROPERTY_SELECTION_CREATED` en Activity; `createVisitFromMatch()`
  reutiliza `createAdminAppointment()` (solape real, comercial e inmueble de la
  agencia) con nombre, email y teléfono sacados de la ficha del contacto en el
  servidor, y `contactId` (nuevo parámetro de `createAdminAppointment`, validado
  contra la organización), que es lo que lee la pestaña «Visitas» del contacto.
- **Aislamiento**: necesidad, su contacto, cada propiedad, el comercial y la
  selección existente (que además tiene que ser de la misma persona) se
  comprueban contra la organización de la sesión; lo ajeno responde **404**.
  `MatchStatusError.statusCode` distingue 404 (no existe en esta agencia) de
  422 (decisión no válida).
- La ficha del contacto (`GET /api/admin/saas/contacts/:id`) devuelve ahora
  `selections`, con el nombre en vivo de cada propiedad.

## Interfaz

- `components/admin/requirements/RequirementEditor.vue`: crear y editar, con
  todos los campos e importancia por criterio (`ImportanceSelect.vue`), zonas
  estructuradas (`ZoneListEditor.vue`) y radio con mapa y geocodificador.
- `components/admin/requirements/RequirementCard.vue`: resumen, detalles,
  estado, presupuesto validado (autor y fecha), «Editar», «Buscar propiedades»
  con acciones y selección múltiple («Crear selección con N propiedades»).
- `components/property-builder/PropertyBuyerMatches.vue`: paso «Compradores
  compatibles» de los dos editores de propiedad (sección `buyer-matches` de
  `PROPERTY_BUILDER_SECTIONS`). Se calcula al abrir el paso, con lo último guardado.

## Pruebas

- `test/unit/matchingEngine.test.ts`: estado, obra/reformado, zonas + radio,
  exclusión como filtro duro, tipo por defecto, características nuevas y el
  ejemplo del encargo (✓ ✓ ✓ ✓ ✓ △ ✕).
- `test/unit/necesidadesMatchingN4.test.ts` (base real): validación, edición,
  fila antigua, presupuesto con autor, motor con `condition` y
  `property_details`, prefiltro por tipo, crear selección/visita, descartar y
  recuperar, enviar sólo hacia delante y aislamiento entre agencias.
- `tests/e2e/nucleo-n4.spec.ts`: API y panel (editor, ficha de propiedad).
