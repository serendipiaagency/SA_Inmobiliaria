# Mapas

Arquitectura compartida de todo lo que pinta un mapa en la plataforma: el
editor de ubicación de Propiedades (web) y 2ª mano, el explorador público
`/mapa`, el mini-mapa de `/embed`, el pin de "Dónde está" en la ficha pública
de una propiedad, y el bloque "Mapa (teaser)" del Constructor Web.

## Proveedor

**Leaflet** (`leaflet` + `leaflet.markercluster`), con tiles de **CartoDB**
(plano/oscuro) y **Esri/ArcGIS Online** (satélite). Es el único proveedor de
mapas del proyecto — no hay Google Maps ni Mapbox en ningún sitio. Cambiar de
proveedor es una decisión de negocio (coste, licencia, cobertura), nunca un
detalle de implementación: no lo cambies sin un motivo documentado aquí.

## La base compartida

`composables/useLeafletMap.ts` centraliza lo que antes vivía duplicado (con
el mismo comentario) en cada componente de mapa:

- **`useLeafletMap(container, options)`** crea el `L.Map` en `onMounted` y lo
  destruye en `onBeforeUnmount`. La pieza que de verdad importa es el
  `ResizeObserver` sobre `container`: `L.map()` calcula su tamaño una sola
  vez, al crearse — si en ese instante el contenedor mide 0×0 (una pestaña
  `v-show`, un acordeón, un modal aún cerrado), tiles y marcadores quedan mal
  encajados para siempre, y ningún cambio de CSS posterior lo arregla sin
  `invalidateSize()`. El `ResizeObserver` no dispara mientras el elemento
  sigue en `display:none` (no tiene caja) y dispara exactamente una vez
  cuando pasa a tener una caja real — justo cuando hace falta. Es la causa
  raíz nº1 de la auditoría de mapas (2026-09): la práctica totalidad de
  "el mapa sale gris/mal encajado" reportados venía de aquí.
- **`TILE_URLS` / `createTileLayer(key)`** — las tres capas base (`light`,
  `dark`, `satellite`) en un único sitio, con sus atribuciones correctas.

`utils/maps/coords.ts` es la segunda pieza — validación de coordenadas, con
importación explícita porque cruza la frontera servidor/cliente (Nitro no
comparte auto-import de `utils/` con el cliente):

- **`isFiniteCoord(v)`** — `typeof v === 'number' && Number.isFinite(v)`.
  Nunca un `if (lat && lng)`: eso descarta en silencio una propiedad real en
  el ecuador o el meridiano de Greenwich (`0` es falsy), y no detecta
  coordenadas guardadas como string (`"40.4168"`), que pasan un truthy check
  pero rompen `L.marker()`. Causa raíz nº3 de la auditoría.
- **`hasValidCoords(item)` / `withValidCoords(items)`** — además exigen que
  el par no sea exactamente `(0,0)`: es el valor placeholder/sin-asignar en
  todo el proyecto (portal centrado en España/Dubái), nunca una ubicación
  real. Es una regla de negocio deliberada, no un caso límite accidental —
  **nunca** uses `(0,0)` como fallback de "no hay ubicación": usa `null`/
  ausencia real y deja que estas funciones lo filtren.

Ninguno de los dos módulos sabe nada de builder, edición ni presentación —
son puro cálculo/DOM, reutilizables desde cualquier modo.

## Los consumidores

| Componente | Dónde | Modo |
|---|---|---|
| `components/property-builder/LocationPicker.client.vue` | Editor de Propiedades (web) y 2ª mano | Editor — arrastra el marcador, clic para reubicar |
| `components/MapExplorer.client.vue` | `/mapa` (explorador público) | Presentación — cluster, capas, POIs, multi-propiedad |
| `components/EmbedMiniMap.client.vue` | `/embed` (widget externo) | Presentación — mini-mapa de solo lectura |
| `components/PropertyLocationMap.client.vue` | Ficha pública de una propiedad | Presentación — un único marcador, solo lectura |
| `components/MapTeaserMap.client.vue` | Bloque "Mapa (teaser)" del Constructor Web | Presentación + **builder-edit** (ver abajo) |

Todos son `.client.vue`: el código de Leaflet toca globals del navegador en
cuanto se evalúa, así que no puede vivir en el bundle SSR de Nitro/Workers.

**Nota sobre `.client.vue` y auto-import.** Nuxt solo excluye un `.client.vue`
del bundle de servidor cuando lo resuelve por su propio registro de
auto-import (usarlo por su nombre en la plantilla, sin `import` local). Un
`import Foo from '~/components/Foo.client.vue'` explícito se trata como un
módulo cualquiera y viaja tal cual al servidor — con Leaflet dentro, eso
tira el renderizado SSR de cualquier página que use ese bloque. Fue un bug
real de esta misma refactorización (`MapTeaserBlock.vue` importaba
`MapTeaserMap.client.vue` a mano): el síntoma en el navegador era el
placeholder de `#fallback` quedándose para siempre, porque el request SSR
completo devolvía 500 antes de llegar a hidratar nada. La regla: un
`.client.vue` se usa por su tag, nunca con `import` explícito.

## Modo builder-edit (Constructor Web)

El lienzo del Constructor Web intercepta clic/doble-clic en fase de captura
(`SiteBlockFrame.vue`) para que un clic sobre cualquier nodo seleccione el
bloque en vez de ejecutar su comportamiento real — pero eso no basta para
Leaflet: su propio arrastre (`mousedown`) y zoom con rueda (`wheel`) nunca
pasan por ese interceptor.

La primera versión de este bloqueo ponía `pointer-events: none` con una
clase reactiva directamente sobre el `<div>` que `L.map()` toma como
contenedor. Se veía bien al montar, pero en cuanto `mode` cambiaba (editor →
Vista previa) Vue recalculaba esa clase y **reescribía por completo** el
`className` del elemento — Leaflet añade `leaflet-container` y el resto de
sus clases de forma imperativa (`container.className += ...`), fuera de la
reactividad de Vue, así que cualquier repintado del binding las borraba sin
que Leaflet se enterase. El mapa seguía "vivo" (paneles, marcador y
controles seguían ahí, con sus listeners intactos) pero sin su clase raíz —
y con ella se iba el `position:relative` del que depende el posicionamiento
de las teselas. El síntoma era un rectángulo en blanco, indistinguible a
simple vista de "el mapa no se inicializó".

La solución — y la que debe seguir cualquier mapa embebido en el
Constructor Web en el futuro — es un **`<div>` de bloqueo aparte**, hermano
del contenedor de Leaflet, con `v-if="mode === 'builder'"` en vez de una
clase reactiva sobre el propio mapa:

```html
<div class="relative h-full w-full">
  <div ref="el" class="h-full w-full" />
  <div v-if="locked" class="absolute inset-0 z-[1200]" aria-hidden="true" />
</div>
```

Sin listeners propios, así que un clic la atraviesa hacia el `SbBox`
ancestro (la selecciona la fase de captura antes de llegar aquí) — pero al
ser hermano de `el`, no descendiente, un `mousedown`/`wheel` nunca burbujea
a través del contenedor de Leaflet, así que ni arrastra ni hace zoom
mientras se edita. El mapa se sigue inicializando y pintando normalmente
debajo; sólo deja de recibir eventos de puntero. Se complementa deshabilitando
el manejador de teclado de Leaflet (`map.keyboard.disable()`) mientras
`mode === 'builder'`, para que Tab + flechas tampoco lo desplace.

## Vinculación dinámica a propiedades reales

El bloque "Mapa (teaser)" sigue la misma filosofía que el resto del
Constructor Web (`docs/site-builder.md`): **el contenido guarda criterio,
nunca datos**. `utils/siteBuilder/pickItems.ts` duplica a propósito (no
importa) el vocabulario de selección de `PropertiesBlock.vue` —
`latest`/`featured`/`premium`/`affordable`/`recommended`/`community`/`type`/
`manual` — para que el mapa elija propiedades reales con las mismas reglas,
sin arriesgar una regresión en el bloque de Propiedades ya probado en
producción. Las coordenadas siempre salen en vivo de `developer_properties`
vía `home.get.ts`/`preview-data.get.ts` — nunca se guardan en el bloque, así
que geolocalizar una propiedad ya publicada aparece en el mapa sin
republicar.

## Qué NO hacer

- No hardcodear una API key de mapas en ningún componente — CartoDB/Esri no
  la requieren para este volumen de tráfico; si algún día hace falta una,
  vive en variables de entorno del Worker, nunca en el bundle del cliente.
- No usar `(0,0)` como centro por defecto para "sin ubicación" — usa el
  centro de fallback del mercado correspondiente (Madrid en el editor de
  admin, Dubái en `/mapa` — son valores de negocio distintos a propósito,
  no una inconsistencia a unificar) y dejar que `withValidCoords` filtre.
- No modificar destructivamente una ubicación ya guardada al corregir un bug
  de renderizado — estos cambios son de presentación/cálculo, nunca tocan
  `developer_properties.lat`/`lng` en la base de datos.
