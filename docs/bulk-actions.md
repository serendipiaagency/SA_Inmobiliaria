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

## Qué queda para el siguiente incremento

Del megaprompt original de FASE 28, este incremento cubre el framework
completo (§84-85, §102-106) y tres acciones de Properties (§87-89).
Quedan, mismo criterio de incrementos revisables que FASE 25/27:

- **Publicar / Retirar** (§90-91) — publicar debe validar
  `PropertySchemaRegistry.requiredForPublish` (ya existe la validación
  en modo `'publish'`, hoy sólo se dispara inline en `[id].put.ts` para
  `developer-properties`; se necesita extraerla a una función reutilizable
  antes de que el handler masivo la llame, en vez de duplicarla una
  tercera vez). Retirar no existe como concepto hoy (nada limpia
  `publishedAt`) — se añade en ese incremento.
- **Actualizar precio + `PropertyPriceHistory`** (§94-95) —
  `price_history` (developer-properties) ya existe y tiene consumidor
  público; `agent_property_price_history` (migración 0081) ya existe
  como tabla pero todavía sin escritor — el handler de precio masivo es
  quien la usará por primera vez, igual que hace `[id].put.ts` con
  `price_history` en una edición manual.
- **Exportar** (§92) — ya existe `format=csv` en el listado (FASE 27);
  la acción masiva de exportar una selección concreta reutiliza ese
  mismo endpoint con un filtro por ids, no un mecanismo nuevo.
- **Crear catálogo** (§93) — reutiliza el módulo de Asset Export Studio
  ya existente (`POST /api/admin/asset-export/catalogs`), hoy limitado a
  `developer_properties` — la acción masiva será un envoltorio fino
  sobre esa API ya construida, no una reimplementación.
- **Bulk Leads** (§96-101) — asignar Comercial (reutiliza
  `leads/routing.ts#reassignLead`), cambiar etapa (reutiliza
  `leads/pipeline.ts#transitionLeadStage`, que ya es el único escritor
  legal de `leads.stage` y ya genera `lead_stage_history`), etiqueta
  (mismo Tag transversal de este incremento), crear Task (reutiliza
  `tasks/service.ts#createTask`, una fila real por Lead — nunca una Task
  para 500 Leads), exportar.

Todas las piezas que estas acciones necesitan reutilizar ya existen y ya
están identificadas — este incremento las deja localizadas a propósito
para que el siguiente no vuelva a auditar el repo desde cero.
