# Property Search Service (FASE 27)

## El problema que había

Antes de esto, "buscar inmuebles" eran tres implementaciones que no se
hablaban entre sí:

1. `server/api/admin/[resource]/index.get.ts` — el listado admin
   (`developer-properties`/`properties`), con dos bloques de filtro
   casi idénticos (uno por catálogo) escritos a mano con Drizzle.
2. `server/utils/properties/search.ts` (retirado en esta fase) —
   `searchPropertiesAcrossKinds()`, SQL crudo contra D1 directamente
   (sin pasar por Drizzle), usado por el selector de inmueble de
   Calendar (`server/api/admin/saas/properties/search.get.ts`).
3. `server/utils/matching/service.ts` — su propio prefiltro Drizzle
   (`candidatesInCatalog`), con su propia forma de resolver
   `kind → tabla`.

Tres motores de query paralelos para las mismas dos tablas
(`developer_properties`/`agent_properties`) significa tres sitios donde
un filtro nuevo (o un bug en uno existente) hay que arreglar por
separado — y, de hecho, ni exclusividad ni estado de publicación ni
fecha de captación/actualización tenían filtro en ninguno de los tres.

## El diseño

`server/utils/properties/searchService.ts` es ahora el único lugar
donde "precio mínimo" se traduce a `gte(t.price, ...)`:

- **`propertyTableFor(kind)`** reexporta `tablesFor()` de
  `matching/service.ts` en vez de resolver `kind → tabla` una tercera
  vez — una sola función en todo el repo para ese mapeo.
- **`buildPropertyFilterConds(kind, filters)`** construye las
  condiciones WHERE del filtro profesional (precio, ubicación, tipo,
  operación, estado, dormitorios/baños, superficie, exclusividad,
  publicación, fecha de captación/actualización) para el catálogo que
  se le pida. Es la función que consume el listado admin.
- **`parsePropertyFilters(query)`** traduce una query string HTTP a
  `PropertySearchFilters` — mismos nombres de parámetro en los dos
  catálogos.
- **`searchPropertiesCompact(event, orgId, q, limit)`** — la búsqueda
  ligera por texto cross-catálogo que usa el selector de inmueble de
  Calendar; antes vivía como SQL crudo, ahora usa el mismo
  `useDb(event)` Drizzle que el resto de `server/utils`.
- **`DEVELOPER_PROPERTY_SORTS`/`PROPERTIES_SORTS`** — los mapas de
  orden del listado admin, movidos aquí desde `index.get.ts`.

`matching/service.ts` mantiene su propio prefiltro
(`candidatesInCatalog`): sus condiciones son de holgura (`priceMax *
1.1`, `propertyType IS NULL OR …`) para no descartar candidatos que el
motor de matching pueda puntuar como "casi elegible" — forzarlas a la
forma exacta de `PropertySearchFilters` habría sido una unificación
falsa (mismo aspecto, semántica distinta). Lo que sí comparte con el
resto es `tablesFor()`, que es lo que realmente estaba duplicado.

## Filtros nuevos en esta fase

Ninguno de los tres motores anteriores los tenía:

- **Exclusividad** (`isExclusive`) — antes solo se podía marcar en la
  ficha, no filtrar en el listado.
- **Estado de publicación** (`published`: `published`/`unpublished`).
- **Fecha de captación** (`capturedFrom`/`capturedTo`).
- **Fecha de última actualización** (`updatedFrom`/`updatedTo`).
- **Venta/alquiler también en Propiedades (web)** — antes
  `transactionType` solo se filtraba en 2ª mano porque obra nueva se
  asumía venta implícita; la columna existe en las dos tablas desde la
  migración 0068 (con default `'sale'` en `developer_properties`), así
  que ahora se expone en las dos.

Los rangos "hasta" (`capturedTo`/`updatedTo`) normalizan una fecha
suelta (`"2026-03-10"`) al final de ese día (`"…T23:59:59"`) antes de
compararla — si no, un `lte` contra una columna con hora dejaría fuera
cualquier fila actualizada ese mismo día después de medianoche, que es
el caso más común viniendo de un `<input type="date">`.

## Estado en la URL (§72)

`components/property-list/PropertyList.vue` ahora lee su estado
inicial de `route.query` y lo vuelve a escribir (con `router.replace`,
nunca `push`) en cada cambio de filtro, orden o página. Un enlace
compartido, recargar la página o volver atrás reproducen exactamente
el mismo listado filtrado — antes se perdía en cuanto se salía de la
página.

## Incremento 1 — motor unificado, filtros, URL

Cubre la unificación del motor de búsqueda (§51, §83), el filtro
ampliado (§52) y el estado en la URL (§72), descritos arriba.

## Incremento 2 — Saved Filter / Saved View / Shared View, columnas, export

`property_saved_views` (migración 0080) es **una sola tabla para las
tres entidades** del encargo, no tres paralelas — el mismo criterio
"UNA SOLA BÚSQUEDA" del incremento 1, aplicado esta vez a cómo se
guarda un filtro en vez de a cómo se ejecuta:

- Un **Saved Filter** (§73) es una fila con `kind='filter'` —
  `columnsJson`/`density` en NULL.
- Una **Saved View** (§74) es `kind='view'` con esos dos rellenos —
  filtros + columnas (el orden y la densidad se heredan del listado;
  ver "qué se dejó fuera" más abajo).
- Una **Shared View** (§75-76, §153) no es una entidad ni una tabla de
  permisos aparte: es `visibility='shared'` sobre la misma fila. La
  fila sólo guarda la CONFIGURACIÓN (`queryJson`/`columnsJson`), nunca
  un resultado — aplicarla vuelve a pedir `/api/admin/<resource>` con
  la sesión de quien la aplica, así que los permisos se evalúan en ese
  momento, no se heredan de quien la creó. No hace falta ningún
  mecanismo adicional para eso: es una consecuencia directa de qué se
  guarda.

`server/utils/properties/savedViews.ts` tiene las dos reglas de
autorización, cada una probada contra una D1 real
(`test/unit/propertySavedViews.test.ts`):

- **`savedViewVisibilityCond(userId)`** — quién LEE: el propio creador,
  o cualquiera de la organización si es compartida. Es una condición
  SQL (no un post-filtro en memoria) para que la paginación del listado
  genérico siga siendo correcta con este recurso igual que con
  cualquier otro.
- **`assertOwnsSavedView(row, userId)`** — quién EDITA o BORRA: sólo el
  creador, sin excepción. Compartir amplía quién lee, nunca quién
  posee.

Como con cualquier otro recurso del motor CRUD genérico
(`server/utils/adminResources.ts`), esto vive como branches
(`isPropertySavedViews`) en las rutas ya existentes de
`[resource]/index.get.ts`/`index.post.ts`/`[id].put.ts`/`[id].delete.ts`
— coste cero de ruta nueva (ver `docs/property-schema-registry.md`
para el porqué de ese patrón). `userId` no está en `fields` de
`adminResources.ts`: nunca es client-editable, el servidor lo fija a
partir de la sesión igual que `organizationId`.

**Columnas configurables** (§77-78): una preferencia de presentación
pura sobre la vista de lista (`PropertyList.vue`) — qué de las columnas
ya devueltas por la consulta se pinta, nunca amplía qué campos
devuelve. Por eso no hay validación de permisos sobre `columnsJson` en
el servidor: no hay nada que una columna pueda "filtrar" que el usuario
no viera ya paginando.

**Export CSV** (§79): `format=csv` en el propio
`GET /api/admin/[resource]` (coste cero de ruta), mismas condiciones y
mismas columnas ya autorizadas que el listado JSON — nunca puede
exponer un dato que el usuario no pudiera ya ver. Sin paginar, con tope
`PROPERTY_EXPORT_MAX_ROWS` (2.000). Ninguna de las dos tablas tiene hoy
precio mínimo, comisión ni dato de propietario — el encargo pide no
filtrarlos en el export; como el campo no existe, no hay nada que
excluir a propósito.

## Qué se dejó fuera de este incremento

- **Densidad** (`density`, parte de §74): la columna existe en la
  tabla, pero no hay control en la UI para fijarla — se guarda siempre
  `null`. Menor valor que columnas configurables y export, y ya es un
  incremento grande; se retoma si se pide.
- El **orden** (`sort`) sí se guarda como parte de `queryJson` (ya
  vivía en el filtro del incremento 1), así que una vista guardada
  recuerda cómo estaba ordenada — sólo la densidad de fila queda fuera.

## Bloque N7b — búsqueda geográfica y los filtros que faltaban (FASES 2 y 27)

Todo sigue pasando por el mismo motor (`buildPropertyFilterConds` /
`parsePropertyFilters`): el listado, la exportación CSV, «seleccionar todos
los filtrados» de las acciones masivas y los filtros y vistas guardadas ven
exactamente lo mismo. Mismos nombres de parámetro en los dos catálogos.

### Filtros nuevos

| Parámetro | Qué filtra | Dónde está el dato |
|---|---|---|
| `subtype` | Subtipo | `property_details.subtype` |
| `agentId` (`none` = sin comercial) | Comercial asignado | `agent_id` de cada catálogo |
| `officeId` | Oficina | `property_details.office_id` |
| `owner` / `ownerId` | Propietario o copropietario vivo, por nombre/email/teléfono o por contacto | `property_contacts` + `contacts` |
| `portal` | Tiene un trabajo de publicación en ese canal (programado, en cola, publicándose, publicado o reintentando) | `publication_jobs` + `publication_schedules` — **sólo obra nueva**: la publicación multicanal no programa 2ª mano, y ahí el filtro devuelve cero (el panel ni lo ofrece) |
| `features=pool,terrace,…` | Características que debe tener todas (las 5 de las Domain Tools, ya en el panel) | columnas `has_*` |
| `neighborhood` | Barrio o urbanización | `property_details.neighborhood` o la columna antigua `community` |
| `municipality` | Municipio o localidad | `property_details.municipality` o `city` |
| `tags` | Etiquetas (todas) | `tag_links` — ver `docs/campos-personalizados-y-etiquetas.md` |
| `cf_<id>`, `cf_<id>_min`, `cf_<id>_max` | Campos personalizados | `custom_field_values` |
| `transactionType` | Venta / alquiler — ahora también en el panel de Propiedades (web) | `transaction_type` |

Cada subconsulta se correlaciona con el id, el catálogo **y la organización**
de la propiedad: el id de una oficina, contacto, etiqueta o definición de otra
agencia no coincide con nada. Las opciones de los desplegables llegan en una
sola llamada, `GET /api/admin/<catálogo>?view=filterOptions` (oficinas,
comerciales, etiquetas, campos personalizados y portales), con el área del
propio listado (Portal Web): quien sólo tiene Portal Web también puede filtrar
por oficina.

### Búsqueda geográfica

- **Zona visible del mapa (bounding box):** `north`, `south`, `east`, `west`.
  Si `west > east`, la caja cruza el antimeridiano y son dos franjas.
- **Radio / coordenadas:** `lat`, `lng`, `radiusKm` (0 < r ≤ 500). Se escribe a
  mano («Cerca de unas coordenadas») o se pulsa en el mapa.
- `sort=distance` ordena por cercanía al centro del radio y cada fila trae
  `distanceKm` (haversine).
- Mal formada (falta un lado, fuera de rango, sur al norte del norte) → 422.
  Nunca se ignora: ignorarla devolvería todas las propiedades.

El cálculo vive en `utils/maps/geo.ts` (compartido con el cliente) y su
traducción a SQL en `server/utils/properties/geoSearch.ts`. El radio usa la
aproximación equirectangular (Δlat·111,32 km; Δlng·111,32·cos lat₀ km): sólo
sumas y productos, porque D1 no garantiza funciones trigonométricas en SQL;
el error es < 1 % para radios de cientos de km, y la caja que envuelve el
círculo hace de prefiltro. Una propiedad sin coordenadas o con el (0,0) de
«sin asignar» (`docs/maps.md`) nunca entra en una búsqueda geográfica.

### Mapa del listado (panel)

Botón «Mapa» del listado de los dos catálogos
(`components/property-list/PropertyListMap.client.vue`, sobre la base
compartida `useLeafletMap`). Pinta TODO el resultado filtrado con ubicación
(`?view=map`, tope 1.000 puntos — con más, avisa de acercar o filtrar), y ofrece
«Buscar en esta zona» (bounding box) y «Buscar alrededor de un punto» (radio).
No filtra por su cuenta: emite el filtro y el listado lo aplica, así que va a
la URL, al CSV, a las vistas guardadas y a las acciones masivas igual que
cualquier otro.

### Web pública (`GET /api/public/properties`)

Sin romper lo que ya había (todo es opcional):

- `city`, `municipality` y `neighborhood` (este último también en
  `property_details`);
- la misma caja y el mismo radio, **sobre las coordenadas que se publican**:
  si la ubicación es aproximada, las redondeadas de `toPublicProperty` —
  buscar por zona nunca afina más que el pin que ya se enseña;
- `view=map` admite hasta 300 resultados por página (el resto sigue en 48).
  `/mapa` lo usa, y su botón «Buscar en esta zona» filtra por la zona visible.

Sigue pendiente: la web pública sólo tiene obra nueva (2ª mano no tiene
consumidor público), y el buscador público (`FiltersModal.vue`) no expone
municipio ni barrio todavía — el API ya los acepta.
