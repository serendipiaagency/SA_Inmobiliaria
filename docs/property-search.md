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
