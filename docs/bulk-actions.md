# Bulk Actions (FASE 28)

## El encargo

"Construir un framework de Bulk Actions. NO implementar cada acción como
hack independiente." (§84-106). Antes de esta fase no existía nada así en
el repo: el único precedente de selección múltiple era
`pages/admin/cms/articles/index.vue`, con selección de sólo la página
visible y ejecución vía `Promise.all` de N peticiones — exactamente el
"hack por acción" que el encargo pide evitar (sin progreso, sin resultado
individual por fila, y con riesgo real de timeout sobre una selección
grande).

## El diseño: un motor, dos tablas

`server/utils/bulkActions/service.ts` es el motor genérico —
`bulk_action_jobs` + `bulk_action_job_items` (migración 0081), mismo
patrón job+items ya probado en este repo por
`asset_export_catalogs`/`_items` y `export_batches`/`_items`: no hay
Cloudflare Queues ni Durable Objects en este proyecto, así que "no
bloquear el request durante minutos" (§102) se resuelve con un job
pendiente y un endpoint que procesa **una fila por llamada**, sondeado por
el cliente hasta que termina.

- **`createBulkActionJob()`** — crea el job y una fila `pending` por
  elemento. No procesa nada todavía.
- **`processNextBulkActionItem()`** — reclama exactamente un elemento
  `pending` (con el mismo compara-y-cambia que ya usa
  `leads/routing.ts` para su reparto round-robin, así que dos llamadas
  concurrentes sobre el mismo job nunca reclaman la misma fila dos
  veces), ejecuta el handler de la acción, y anota el resultado
  individual — nunca un "Error" a secas (§104).
- Los **handlers no viven en un registro global mutable**. Cada dominio
  (`server/utils/bulkActions/propertyActions.ts`, y `leadActions.ts` en
  un incremento futuro) expone su propio mapa `acción → handler`, que la
  ruta pasa explícitamente a `processNextBulkActionItem()`. Un registro
  poblado por el efecto secundario de importar un módulo sería frágil
  bajo el empaquetado de Nitro/Workers (no hay garantía de que ese
  import se ejecute si nada usa un export con nombre de ese módulo) — el
  mapa explícito no depende de eso.
- **Estados del job**: `pending → processing → completed | failed |
  partial` — vocabulario exacto del encargo (§103). `partial` es
  cualquier mezcla de aciertos y fallos; `failed` es que todos los
  elementos fallaron; nunca se para en el primer fallo (§104).

## Sin ruta nueva

Crear un job y procesar su siguiente elemento son branches
(`key === 'property-bulk-jobs'`) dentro de las rutas genéricas ya
existentes (`[resource]/index.post.ts` para crear, `[resource]/[id].put.ts`
para `process-next`, interceptando con un cuerpo `{}`/vacío antes de que
la lógica genérica de `buildPayload()` intente tratarlo como una edición
de campos) — mismo criterio de coste-cero-de-ruta que ya usa
`property-saved-views` (FASE 27), documentado en
`docs/property-schema-registry.md`: el margen de Nitro frente al TS2589
sigue en cero, así que ningún archivo de ruta nuevo es seguro sin volver
a medirlo.

## Selección: manual, página, o todos los filtrados

`components/property-list/PropertyList.vue` (vista de lista únicamente —
la cuadrícula no tiene checkbox de fila) ofrece los tres modelos del
encargo (§84):

- **Manual** — casilla por fila.
- **Página** — casilla de cabecera, selecciona/deselecciona todas las
  filas cargadas.
- **Todos los filtrados** — cuando la página entera está seleccionada y
  hay más resultados, aparece "Seleccionar las N que cumplen el filtro".
  El servidor resuelve esa selección con **el mismo filtro que ya usa el
  listado** (`buildPropertyFilterConds`/`searchService.ts`, FASE 27) vía
  `resolveFilteredPropertyIds()` — nunca una segunda interpretación de
  los mismos parámetros, y nunca hace falta mandar miles de ids desde el
  navegador.

Cambiar de filtro (no de página) vacía la selección — arrastrarla entre
criterios de búsqueda distintos sería fácil de confundir con "estos son
los resultados actuales".

## Confirmación, progreso, fallo parcial

Antes de aplicar, `useConfirm()` (el mismo componente ya usado por
Eliminar/duplicar en el resto del panel) pide confirmación indicando
cuántas propiedades afecta la acción (§85) — nunca deshacible. Mientras
corre, el botón muestra `X/N` en vivo; al terminar, el aviso distingue
"aplicada a N" (completed), "N aplicadas, M fallaron" (partial) o "falló
en todos" (failed) — nunca un mensaje genérico.

## Acciones de Properties en este incremento

- **Cambiar comercial** (§87) — reutiliza la relación real (`agentId`),
  valida que el comercial exista en la organización antes de asignarlo.
- **Cambiar estado** (§88) — mismos valores que ya usa el CRUD normal por
  catálogo (`available`/`sold` en 2ª mano; `new`/`under_construction`/
  `ready` en obra nueva); nunca un valor inventado.
- **Añadir etiqueta** (§89) — el primer Tag transversal del repo
  (`server/utils/tags/service.ts`, tablas `tags`/`tag_links`,
  polimórfica sin FK real — mismo criterio ya documentado para
  `activities.propertyId/propertyKind`). Antes de esto no existía ningún
  Tag fuera del Blog (`cmsTags`/`cmsArticleTags`). "Get or create by
  nombre", idempotente: aplicar la misma etiqueta dos veces no la
  duplica.

Cada handler primero confirma que la propiedad sigue existiendo y sigue
siendo de la organización — una fila pudo borrarse entre seleccionarla y
que le llegue el turno; ese caso se reporta como un fallo individual de
esa fila, no interrumpe el resto del job.

## Incremento 2 — publicar/retirar, precio, exportar, catálogo

Añade las cuatro acciones de Properties que quedaban pendientes (§90-95)
y "Exportar seleccionadas" (§92):

- **`assertSchemaValid()`** (`server/utils/properties/publication.ts`) —
  la validación de `PropertySchemaRegistry` que antes sólo vivía inline
  en `[id].put.ts` (modo `'save'`/`'publish'`) se extrajo a una función
  compartida, y `[id].put.ts` ahora la llama en vez de repetir la
  comparación. El handler masivo `publish` llama exactamente a la misma
  función — nunca una tercera interpretación de `requiredForPublish`.
- **Publicar** (§90) — sólo existe en `developer-properties`:
  `agent-properties` no tiene consumidor público (mismo hallazgo de la
  auditoría FASE 26/28), así que el handler rechaza con 422 si se invoca
  sobre 2ª mano. Idempotente: publicar una ya publicada es un éxito
  silencioso.
- **Retirar** (§91) — concepto nuevo: limpia `publishedAt` sin tocar el
  resto de la fila, nunca `delete`. También sólo aplica a obra nueva, e
  idempotente sobre una ya retirada.
- **Actualizar precio** (§94-95) — genera SIEMPRE un
  `PropertyPriceHistory` por fila: `price_history` en obra nueva (mismo
  camino que ya usaba `[id].put.ts` en una edición manual, incluido
  disparar `price_drop` en Automatizaciones si el precio baja) y
  `agent_property_price_history` en 2ª mano — su primer escritor real
  desde que la tabla existe (migración 0081).
- **Exportar seleccionadas** (§92) — sin acción masiva nueva del lado
  servidor: `[resource]/index.get.ts` gana un filtro `ids` (sólo para
  `properties`/`developer-properties`, opt-in, nunca cambia el
  comportamiento existente) y el botón nuevo llama al mismo
  `?format=csv` que ya usa "Exportar CSV" — con `ids` en selección
  manual/de página, o con el propio filtro activo en modo "todos los
  filtrados" (ese modo ya exporta exactamente lo mismo que el botón de
  arriba).
- **Crear catálogo** (§93) — no es un `bulk_action_job`: es una única
  llamada síncrona a `POST /api/admin/asset-export/catalogs` (igual que
  "Exportar seleccionadas"), con la plantilla que se elige en el propio
  desplegable de la barra de acciones. Limitado a `developer-properties`
  y al tope ya existente de ese endpoint (`MAX_CATALOG_ASSETS = 30`);
  "todos los filtrados" queda deshabilitado para esta acción porque
  necesita los ids reales, no una resolución tardía del lado servidor.
  Al terminar, lleva directamente a la ficha del catálogo creado.

## Qué queda para el siguiente incremento

Del megaprompt original de FASE 28, quedan sólo las acciones de Leads
(§96-101), mismo criterio de incrementos revisables que FASE 25/27:

- **Bulk Leads** — asignar Comercial (reutiliza
  `leads/routing.ts#reassignLead`), cambiar etapa (reutiliza
  `leads/pipeline.ts#transitionLeadStage`, que ya es el único escritor
  legal de `leads.stage` y ya genera `lead_stage_history`), etiqueta
  (mismo Tag transversal de este incremento), crear Task (reutiliza
  `tasks/service.ts#createTask`, una fila real por Lead — nunca una Task
  para 500 Leads), exportar.

Requiere además construir selección múltiple en `pages/admin/leads.vue`
(hoy sin paginación ni bulk-select — Kanban + Tabla, estructura distinta
de `PropertyList.vue`).
