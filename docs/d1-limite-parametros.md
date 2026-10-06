# D1: como mucho 100 parámetros por consulta

D1 rechaza cualquier consulta con más de 100 parámetros enlazados («too many
SQL variables»). El SQLite de las pruebas unitarias no tiene ese límite: un
`IN (…)` con una lista larga pasa los tests y falla en producción. Sólo la D1
local del e2e (`npm run test:e2e`) lo reproduce.

## Regla

Un `inArray(col, lista)` cuya lista viene de los datos o del usuario (ids de
una página, una selección, los favoritos) no puede ir tal cual. Dos
herramientas en `server/utils/sqlChunks.ts`:

| Caso | Herramienta |
| --- | --- |
| Leer filas por una lista de ids (decorar una página, cargar nombres) | `selectInChunks(lista, (trozo) => db.select()…inArray(col, trozo))`: trozos de 80, resultados juntos y en orden |
| Una condición dentro de una consulta que no se puede trocear (un filtro de listado, un `UPDATE` de varias filas, un `OR`) | `inJsonList(col, lista)`: `col IN (SELECT value FROM json_each(?))`, **un** parámetro sea cual sea el tamaño |

Las listas cerradas del código (estados, roles, tipos de evento) no cuentan:
su tamaño no depende de los datos. Una subconsulta (`inArray(col,
db.select()…)`) tampoco: no lleva parámetros por elemento.

## Dónde se aplica `inJsonList`

- Web pública: favoritos y comparar por ids (`GET /api/public/properties?ids=`).
- Panel: «Exportar seleccionados» de propiedades (`?ids=` en el listado
  genérico) y de leads.
- Exportación de activos: lotes de hasta 200 y los precios de Proyectos.
- Publicación: pausar, reanudar o borrar una programación con muchos trabajos.
- Comunicaciones: la búsqueda por contacto y los hilos web (mensajes
  entregados, contactos, leads y estados de email de un hilo).
- Etiquetas de una página (`server/utils/tags/service.ts`).

Pruebas: `test/unit/sqlChunks.test.ts` (troceo y un solo parámetro con 251
ids) y `tests/e2e/d1-param-limit.spec.ts` (contra la D1 local, que sí aplica
el límite).
