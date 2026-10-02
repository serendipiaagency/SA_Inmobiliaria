# Ficha ampliada de la propiedad, oficinas y equipos

Núcleo inmobiliario, bloque N1 (megaprompt FASES 0-7, ver
[`auditoria-nucleo-megaprompt.md`](./auditoria-nucleo-megaprompt.md)).
Migración `0086_nucleo_inmobiliario.sql`.

## Por qué dos tablas 1:1

D1 admite como máximo **100 columnas por tabla**. `developer_properties`
tenía 93 y `agent_properties` 78, así que los ~90 campos que pedía el encargo
no caben en la fila de la propiedad. Van en dos tablas compartidas por los dos
catálogos, una fila por propiedad, identificada por
`(property_kind, property_id)` con índice único:

| Tabla | Contenido |
|---|---|
| `property_details` | identificación ampliada (código comercial, subtipo, estado comercial, oficina, equipo), ubicación administrativa, superficies y distribución adicionales, edificio, vivienda, instalaciones, zonas comunes, exterior, tour virtual |
| `property_legal_economics` | precio mínimo autorizado y recomendado, alquiler (fianza, depósito, gastos incluidos), gastos (comunidad, IBI, basuras), comisiones, situación legal y certificado energético |

`property_kind` es `agent` (2ª mano, `agent_properties`) o `developer`
(obra nueva / web, `developer_properties`). Las dos tablas llevan
`organization_id` y toda lectura o escritura filtra por él.

Son **columnas tipadas**, no un JSON: se pueden filtrar, buscar y usar en el
matching y en INMO.

## Un catálogo de campos, no tres

`utils/propertySheet.ts` declara cada campo una sola vez (clave, etiqueta en
español, tipo, opciones con sus etiquetas, tabla donde se guarda, límites).
De ahí salen:

- la validación y el guardado (`server/utils/properties/extendedSheet.ts`);
- las secciones del editor (`composables/usePropertyBuilderConfig.ts`);
- la lista común de **tipos y subtipos** de los dos catálogos.

Los tipos se guardan con su clave de siempre (`Apartment`, `Villa`…) para no
romper lo ya publicado, y se enseñan en español (`Piso`, `Chalet`…). Tipos:
piso, casa, chalet, adosado, ático, dúplex, estudio, finca, terreno, local,
oficina, nave, garaje, edificio, promoción. Cada uno tiene sus subtipos
(`PROPERTY_SUBTYPES`).

## API

Sin rutas nuevas: el motor CRUD genérico (`server/api/admin/[resource]/`) ya
sirve `properties` y `developer-properties`.

- `GET /api/admin/<recurso>/:id` devuelve en `row` los campos de la fila
  **más** los de la ficha ampliada (planos, `null` si no se han rellenado).
- `POST` y `PUT` aceptan esos campos en el mismo cuerpo. Sólo se tocan los
  que llegan; un valor vacío (`''`/`null`) borra el dato.
- Validación por tipo: número (con mínimo y máximo), entero, sí/no, valor de
  catálogo, fecha `AAAA-MM-DD`, enlace `https://`, texto de hasta 4000
  caracteres. Cualquier fallo es un 422 que nombra el campo.
- Tipo ↔ subtipo: el subtipo tiene que ser de su tipo (422). Al cambiar el
  tipo, un subtipo que ya no corresponde se vacía solo. El tipo tiene que ser
  de la lista común, pero sólo se exige **al cambiarlo**: una ficha antigua
  con un tipo fuera de la lista se sigue guardando sin tocarlo.
- Oficina y equipo tienen que ser de la misma agencia (404, como cualquier
  referencia ajena).
- `createdBy` de la propiedad lo fija el servidor con el usuario de la sesión.
- Duplicar una obra nueva copia también su ficha ampliada (salvo el código
  comercial, igual que la referencia). Borrar definitivamente una propiedad
  (`DELETE …?hard=1`, desde la Papelera) borra su ficha ampliada; el
  `DELETE` normal sólo la manda a la Papelera (ver más abajo).

## Histórico de precios

`price_history` y `agent_property_price_history` guardan ahora, además del
precio y la fecha, el **precio anterior**, **quién** lo cambió (`changed_by`,
`users.id`) y el **motivo**. El motivo lo escribe quien edita la ficha
(campo «Motivo del cambio de precio») o la acción masiva «Actualizar precio»,
que admite un precio fijo o un **porcentaje** sobre el precio de cada
propiedad (entre −90 % y +500 %). Las filas anteriores a 0086 no tienen esos
datos y se ven como «—».

## Papelera

`deleted_at` (migración 0086) es un campo transversal de las dos tablas de
propiedades. Los recursos `properties` y `developer-properties` llevan
`softDelete: true` (`server/utils/adminResources.ts`), así que usan el mismo
motor genérico que el resto de recursos con papelera — **sin rutas ni
migraciones nuevas**:

| Acción | Llamada | Efecto |
|---|---|---|
| Eliminar | `DELETE /api/admin/<recurso>/:id` | `deleted_at = now()`: la propiedad pasa a la Papelera |
| Ver la Papelera | `GET /api/admin/<recurso>?trashed=1` | sólo las borradas (mismos filtros y búsqueda que el listado; cada fila trae `deletedAt`) |
| Restaurar | `POST /api/admin/<recurso>/:id/restore` | `deleted_at = null`: vuelve tal cual |
| Eliminar definitivamente | `DELETE /api/admin/<recurso>/:id?hard=1` | borra la fila y su ficha ampliada; no se puede deshacer |

Todas filtran por organización antes de mirar el id (`authorizeRecord`): la
Papelera de otra agencia responde 404, igual que un id que no existe. No hay
cambios en autenticación, `requireOrgScope()` ni la matriz RBAC: son las
mismas comprobaciones por área (`web`, escritura) que ya tenía el motor.

Decisiones sobre la ficha de una propiedad borrada:

- `GET /api/admin/<recurso>/:id` **sí** la abre (para revisarla antes de
  restaurarla); `row.deletedAt` dice que está en la Papelera y el editor lo
  avisa con un botón «Restaurar».
- `PUT` **sí** se permite: se puede dejar la ficha lista antes de
  restaurarla. Editar no la saca de la Papelera (`deletedAt` no es un campo
  editable); sólo `restore` lo hace. Un cambio de precio o de estado de una
  propiedad borrada no dispara las automatizaciones de publicación.
- Las tablas hijas (galería, planos, estancias, redes, tipos de unidad,
  traducciones) siguen editables por el mismo motivo.

### La condición «propiedad viva», una sola vez

`server/utils/properties/trash.ts`:

- `livePropertyCond(tabla)` → `deleted_at IS NULL`; `trashedPropertyCond(tabla)` → lo contrario.
- `propertyState(db, orgId, kind, id)` → `live` | `trashed` | `missing` (la de otra agencia es `missing`).
- `assertLiveProperty(db, orgId, kind, id, { action })` → 404 si no es de la
  agencia, **422** «La propiedad está en la papelera: restáurala antes de
  <acción>.» si está borrada.

`buildPropertyFilterConds()` (searchService.ts) **no** incluye la
condición: el listado admin pone `livePropertyCond` o, con `?trashed=1`, la
contraria; cualquier otro llamador añade `livePropertyCond`. En SQL crudo
(binding D1 directo o subconsultas con alias) se escribe `deleted_at IS NULL`
con un comentario que remite al helper.

### Qué consulta hace qué

**Excluyen las borradas** (para ellas, una propiedad en la Papelera no existe):

| Dónde | Ficheros |
|---|---|
| Listado admin y export CSV | `server/api/admin/[resource]/index.get.ts` (genérico `softDelete`; además los contadores de propiedades asignadas del listado de Comerciales) |
| Búsqueda compacta (selector de Calendar y de Comunicaciones) | `server/utils/properties/searchService.ts` (`searchPropertiesCompact`) |
| Acciones masivas: «todos los filtrados» y cada elemento al procesarlo (422 si se borró a mitad de lote) | `server/utils/bulkActions/propertyActions.ts` |
| Matching (candidatos; Inmueble → compradores responde 404; decisiones nuevas sobre el match, 422) | `server/utils/matching/service.ts` |
| INMO / Domain Tools (`search_properties`, `get_property` y toda herramienta que carga una propiedad) | `server/utils/tools/registry.ts` |
| Web pública: listado, portada, comunidad, sugerencias, contador de proyectos por promotora, preguntar al asistente, favorito | `server/api/public/properties.get.ts`, `home.get.ts`, `communities/[id].get.ts`, `suggest.get.ts`, `developers.get.ts`, `ask.post.ts`, `favorite.post.ts` |
| Web pública por slug → **404** | `server/api/public/properties/[slug].get.ts` y `[slug]/analysis`, `engagement`, `lifestyle`, `price-history`, `score`, `similar` (también como candidatas), `view` |
| Reserva pública de visita | `server/api/public/agents/[slug]/book.post.ts` (una borrada se trata como un id desconocido: la cita se reserva sin inmueble) |
| Sitemap y widget | `server/routes/sitemap.xml.ts`, `server/api/widget/properties.get.ts` |
| API v1 (listado, ficha → **404**, programaciones, exportación → 404) | `server/api/v1/properties.get.ts`, `properties/[id].get.ts`, `scheduler/schedules.get.ts`, `asset-export/exports.post.ts` |
| Estadísticas y contadores | `server/api/admin/stats.get.ts`, `saas/overview.get.ts`, `[resource]/[id]/performance.get.ts`, `server/utils/organizations/lifecycle.ts` (resumen de empresa) |
| Comparables (tasador y estadísticas de mercado) | `server/api/admin/saas/valuations.post.ts`, `server/utils/market.ts` |
| Vista previa del Constructor Web | `server/api/admin/site-pages/preview-data.get.ts` |
| Alertas de búsquedas guardadas | `server/tasks/marketing/saved-search-alerts.ts` |
| Enrutado de leads (contexto y comercial responsable de la propiedad) | `server/utils/leads/routing.ts` |
| Exportación de activos (lote y catálogo saltan las borradas; toda pieza nueva pasa por `resolveAssetBindings`) | `asset-export/batches.post.ts`, `catalogs.post.ts`, `batches/[id]/process-next.post.ts`, `server/utils/assetExport/bindings.ts` |
| Publicación multicanal: un trabajo que publica o actualiza queda `blocked` sin llamar al canal; `unpublish` sí se ejecuta | `server/utils/publication/dispatcher.ts` |

**No permiten crear nada nuevo** sobre una borrada (422 con el mensaje de
arriba; 404 si no es de la agencia):

| Qué | Dónde |
|---|---|
| Oferta | `server/utils/offers/service.ts` (`createOffer`), y la oferta desde el resultado de una visita se rechaza antes de anotar nada (`appointments/outcome.ts`) |
| Operación (desde una oferta aceptada) | `server/utils/deals/service.ts` (`createDeal`) |
| Cierre legacy | `server/api/admin/saas/deals.post.ts` |
| Cita y seguimiento | `server/utils/appointments/adminCreate.ts`, `server/utils/comms/admin.ts` (`createFollowUpVisit`) |
| Tour (cada parada; una parada con un inmueble ajeno o inexistente ahora es 404 en vez de guardarse sin nombre) | `server/utils/appointments/tours.ts` |
| Tarea | `server/utils/tasks/service.ts` (salvo el seguimiento heredado de una visita ya hecha: `allowTrashedProperty`) |
| Selección de propiedades | `server/utils/selections/service.ts` |
| Envío por WhatsApp (y su reintento) | `server/utils/comms/admin.ts` (`buildPropertyShare`) |
| Vincular una conversación a la propiedad | `server/api/admin/comms/conversations/[id].patch.ts` |
| Contrato | `server/utils/contracts/bindings.ts` |
| Pieza de exportación | `server/api/admin/asset-export/projects.post.ts` |
| Programación de publicación (y su copia) | `server/api/admin/scheduler/create.post.ts`, `duplicate.post.ts` |
| Duplicar la propiedad | `server/api/admin/[resource]/[id]/duplicate.post.ts` |
| Lead por API v1 | `server/api/v1/leads.post.ts` |

**Leen la historia a propósito** (la fila se sigue leyendo aunque esté en la
Papelera; borrar una propiedad no reescribe lo que ya pasó):

| Qué | Dónde |
|---|---|
| Ficha admin (`GET`/`PUT`) y sus tablas hijas | `server/api/admin/[resource]/[id].get.ts`, `[id].put.ts` |
| Propiedades relacionadas de un cliente (con `deletedAt`) | `server/api/admin/[resource]/[id]/related.get.ts` |
| Propiedad de contexto de una conversación (con `deletedAt`) | `server/api/admin/comms/conversations/[id].get.ts` |
| Nombre y estado al cerrar una operación ya existente; ofertas existentes siguen su ciclo (contraoferta, aceptar, rechazar, retirar) | `server/utils/deals/service.ts`, `server/utils/offers/service.ts` |
| Lotes, catálogos y piezas de exportación ya creados (nombre y precio actual) | `asset-export/batches/[id].get.ts`, `batches/[id]/download-zip.get.ts`, `catalogs/[id].get.ts`, `projects.get.ts`, `projects/[id].get.ts`, `projects/[id].put.ts` |
| Programaciones y trabajos de publicación del panel | `server/api/admin/scheduler/jobs.get.ts`, `schedules.get.ts` |
| Estadística de mejor hora de publicación (ejecuciones reales pasadas) | `server/utils/publication/aiTime.ts` |
| Generar textos con IA desde el editor (edición de la ficha, como el `PUT`) | `server/api/admin/ai/generate.post.ts` |

## Oficinas y equipos

Dos recursos del motor genérico, en CRM:

- `offices` (CRM → Oficinas): nombre (único entre las vivas), código,
  contacto, dirección, zona horaria IANA (se comprueba), estado.
- `teams` (CRM → Equipos): nombre, oficina, responsable, descripción, estado.

Los dos tienen **papelera**: borrar marca `deleted_at`, el listado ofrece
«Papelera» para restaurar o borrar definitivamente.

`team_members` (Comerciales) gana `office_id`, `team_id` y `user_id` — este
último, único, vincula al comercial con su cuenta del panel. Ninguno sale en
la ficha pública del comercial (`server/utils/publicTeam.ts`). El texto
anterior `office_name` se conserva como «Oficina (texto anterior)».

El formulario y el listado genéricos (`pages/admin/[resource]/`) pintan los
campos-relación como desplegables por nombre (`FieldDef.relation`,
`composables/useRelationOptions.ts`) y los valores de un `select` por su
etiqueta (`FieldDef.optionLabels`).

## Privacidad

Lo legal, el precio mínimo autorizado, el recomendado, las comisiones, el
código comercial, la oficina y el equipo son internos (`internalRule` en el
PropertySchemaRegistry) y no forman parte de ninguna respuesta pública: la
web pública lee la fila de la propiedad, no la ficha ampliada. `createdBy` y
`deletedAt` de la propiedad están en la lista de columnas que
`toPublicProperty()` elimina siempre.

## Deriva conocida de producción

La tabla `leads` de producción tiene una columna `converted_contact_id` que
ninguna migración crea (resto del incidente de la 0069). La 0086 **no** la
vuelve a añadir; el código no la usa (el contacto convertido es
`leads.contact_id`). Staging la tiene por la primera versión de la 0086.
