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
suelta (`"2026-03-10"`) al final de ese día (`"…T23:59:59"|antes de
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

## Qué queda para el siguiente incremento

Del megaprompt original de FASE 27, esto cubre la unificación del
motor de búsqueda (§51, §83), el filtro ampliado (§52) y el estado en
la URL (§72). **Saved Filter (§73), Saved View (§74), Shared View
(§75-76), columnas configurables (§77-78) y export (§79)** son
entidades nuevas — requieren su propia tabla, RBAC y UI — y se dejan
para un segundo incremento, mismo criterio que FASE 25 (incremento 1 /
incremento 2): cada PR se queda en un tamaño revisable en vez de una
sola entrega gigante.
