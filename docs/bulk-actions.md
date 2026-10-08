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
`docs/property-schema-registry.md`: entonces el margen de Nitro frente al
TS2589 estaba en cero, así que ningún archivo de ruta nuevo era seguro sin
volver a medirlo (ya no es así desde 2026-10-08, ver P1-14 en
`docs/production-hardening-audit.md`).

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

## Cierre D1p — «Cambiar estado comercial»

Acción `change_commercial_status` en los dos catálogos
(`propertyActions.ts`), con `params.commercialStatus` del vocabulario común
(disponible, reservada, vendida, alquilada, retirada, borrador). Un valor
fuera de él se rechaza al crear el job (422), antes de procesar nada. Cada
elemento guarda la ficha ampliada con `updated_by` = quien lanzó la acción y
aplica las mismas reglas que el `PUT` (`setPropertyCommercialStatus`: casilla
«Reservada» y, en 2ª mano, la disponibilidad con «Vendida»/«Disponible»).
Auditoría como el resto: el alta del job queda en el registro
(`create property-bulk-jobs`, «change_commercial_status × N») y cada elemento
en `bulk_action_job_items` con su resultado.

«Cambiar estado» sigue siendo el `status` propio del catálogo y en el panel se
llama «Cambiar estado de la obra» (obra nueva) o «Cambiar disponibilidad» (2ª
mano). En 2ª mano, una disponibilidad nueva ajusta el estado comercial que la
contradiga (`syncCommercialStatusAfterAvailability`), igual que el `PUT` y el
cierre de una operación de venta.

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
- **Publicar** (§90) — en los dos catálogos (desde el bloque N1): marca
  `publishedAt` con la validación de publicación del schema de cada catálogo
  y tipo. Idempotente: publicar una ya publicada es un éxito silencioso.
- **Retirar** (§91) — concepto nuevo: limpia `publishedAt` sin tocar el
  resto de la fila, nunca `delete`. En los dos catálogos, e idempotente sobre
  una ya retirada.

  *Verificado en el bloque N7b:* los dos handlers aceptan `agent` y
  `developer` (`propertyActions.ts`, probado en
  `test/unit/bulkActions.test.ts` «2ª mano también se publica y se retira»),
  y el desplegable del listado los ofrece en los dos. El precio por
  porcentaje (N1) también: «por porcentaje» en el mismo test.
  **Crear catálogo** también, desde el cierre D3b (ver más abajo).
  Antes era sólo de obra nueva porque Asset Export Studio sólo sabía
  componer fichas de `developer_properties`.
- **Actualizar precio** (§94-95) — genera SIEMPRE un
  `PropertyPriceHistory` por fila: `price_history` en obra nueva (mismo
  camino que ya usaba `[id].put.ts` en una edición manual, incluido
  disparar `price_drop` en Automatizaciones si el precio baja) y
  `agent_property_price_history` en 2ª mano — su primer escritor real
  desde que la tabla existe (migración 0081).

  **Cierre de FASES 25-29** (auditado con el E2E principal):
  - La edición manual de una ficha de 2ª mano no escribía
    `agent_property_price_history` — sólo la acción en bloque. Ahora
    `[resource]/[id].put.ts` lo hace también, con cambio real de precio.
  - En `[id].put.ts` el histórico y las automatizaciones (`price_drop`,
    `status_change`) se ejecutaban **antes** de validar el esquema: un PUT
    que acababa en 422 (p. ej. publicar sin campos obligatorios llevando un
    precio nuevo) dejaba una fila con un precio que nunca se guardó, y podía
    disparar una republicación. La validación va ahora primero.
  - Las dos vías escriben `recorded_at` con `now()` (`YYYY-MM-DD HH:MM:SS`);
    la manual usaba ISO con «T», y dos filas del mismo día se ordenaban mal
    al comparar el texto.
  - Nadie leía el histórico desde el panel. `GET /api/admin/{properties,
    developer-properties}/:id` devuelve ya `priceHistory` (las 50 más
    recientes; la fila ya está autorizada por organización) y el editor lo
    enseña en el panel «Histórico de precios» — sin ruta nueva (entonces el
    margen de claves de ruta era 0).
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
  desplegable de la barra de acciones. Limitado al tope ya existente de
  ese endpoint (`MAX_CATALOG_ASSETS = 30`); "todos los filtrados" queda
  deshabilitado para esta acción porque necesita los ids reales, no una
  resolución tardía del lado servidor. Al terminar, lleva directamente a
  la ficha del catálogo creado.

  **En los dos catálogos (cierre D3b, FASE 28).** El listado de 2ª mano
  manda `propertyKind: 'agent'` y el endpoint busca los ids en
  `agent_properties` (de la agencia y fuera de la papelera; los ajenos se
  saltan y, si no queda ninguno, 404). Es el MISMO motor: plantillas,
  `process-next` de una sección por petición, ensamblado con portada e
  índice, validación y R2. Lo único nuevo es
  `resolveAgentAssetBindings()` (`server/utils/assetExport/bindings.ts`),
  que rellena las mismas claves `{{asset.*}}` desde una ficha de 2ª mano:
  - **sólo lo publicable**: la fila pasa por `toPublicProperty()` (fuera
    lo interno, ubicación redactada según su privacidad); la zona
    («Chamberí, Madrid») nunca lleva la dirección, y el título («Piso en
    Chamberí») sólo usa la calle si la ubicación es exacta y no hay zona;
  - **la foto** es la portada (`main_image`) salvo que esa misma foto
    esté marcada en la galería como no publicable, privada u oculta;
    entonces, la primera publicable de la galería (`listPublicGallery`);
  - **la referencia** es el número de ficha, como en obra nueva (la
    `reference` interna nunca sale en una respuesta pública);
  - **sin QR ni enlace**: la 2ª mano no tiene página pública, y un QR a
    ninguna parte es peor que ninguno (la plantilla deja ese hueco en blanco).

  Sin migración: `asset_export_catalogs` no tiene columna para el
  catálogo de propiedades, así que va en su `validation_json`
  (`{"propertyKind":"agent"}`, `server/utils/assetExport/catalogKind.ts`) y
  el ensamblado final lo conserva al escribir su validación. Sin marca =
  obra nueva, que es lo que son todos los catálogos anteriores. El detalle
  del catálogo busca el nombre de cada sección en SU tabla y dentro de la
  agencia (antes un `JOIN` sólo por id).

## Incremento 3 — Bulk Leads (cierre de FASE 28)

Añade las acciones de Leads (§96-101), reutilizando en cada caso el mismo
servicio de dominio que ya escribe esa tabla desde fuera de Bulk Actions —
nunca una segunda interpretación:

- **Cambiar comercial** (§97) — llama a `leads/routing.ts#reassignLead`,
  el mismo servicio que ya usa el desplegable de comercial del Kanban/
  Tabla. Queda constancia en `lead_assignment_history` igual que una
  reasignación manual, atribuida al usuario que lanzó la acción masiva
  (`job.requestedBy`, no un actor "system" genérico).
- **Cambiar fase** (§98) — llama a `leads/pipeline.ts#transitionLeadStage`,
  el único escritor legal de `leads.stage`; genera `lead_stage_history`
  igual que arrastrar la tarjeta en el Kanban.
- **Añadir etiqueta** (§99) — el mismo Tag transversal del incremento 1
  (`tags/service.ts`), con `'lead'` como `entityType`. Idempotente.
- **Crear tarea** (§100) — llama a `tasks/service.ts#createTask` una vez
  por lead seleccionado: una fila de Task real por cada uno, nunca una
  sola Task compartida por los N leads del lote.
- **Exportar seleccionados** — `server/api/admin/saas/leads.get.ts` gana
  un filtro `ids` y `format=csv` opt-in, mismo criterio que
  `[resource]/index.get.ts` para Properties.

`server/utils/bulkActions/service.ts#BulkActionItemHandler` gana un
quinto parámetro, `requestedBy` (`job.requestedBy`, ya guardado desde
`createBulkActionJob()`): lo necesita `changeCommercial` para atribuir la
reasignación a quien de verdad lanzó la acción masiva, en vez de perder
esa atribución. Los handlers de Properties lo ignoran sin cambios — una
función declarada con menos parámetros de los que el tipo exige sigue
siendo válida en TypeScript.

### Paginación, exportación completa y "todos los filtrados" (bloque N7b)

Hasta el bloque N7b, `pages/admin/leads/index.vue` no paginaba: la Tabla
cargaba un único listado con tope de 200 filas, y por tanto «Exportar
seleccionados» nunca podía sacar más de 200 leads (hallazgo de la FASE 28 en
`docs/auditoria-nucleo-megaprompt.md`). Ahora:

- El filtro del listado se escribe una sola vez en
  `server/utils/leads/list.ts#buildLeadListWhere` (búsqueda, origen, oficina,
  prioridad, puntuación, el detalle de un KPI del dashboard, `ids` y la
  etiqueta nueva `tags`).
- La **Tabla pagina** (`page`, `perPage` ≤ 200; la pantalla pide 100) y
  `total` es el total real del filtro. Sin `page`/`perPage`, el endpoint
  devuelve las 200 primeras como siempre (lo usan INMO y otras pantallas). El
  orden lleva `id` de desempate para que ninguna fila se repita o se salte
  entre páginas. El **Pipeline** sigue cargando los 200 más recientes del
  filtro (un tablero no se pagina) y avisa cuando hay más.
- **«Exportar CSV (N)»** descarga TODO el filtro, por lotes de 500
  (`exportLeadRows`), sin tope; cada lote es una consulta pequeña y del mismo
  tamaño, y las etiquetas de cada lote salen en una consulta con los ids como
  un único parámetro JSON — ninguna consulta pasa del límite de 100
  parámetros de D1. El CSV añade la columna `tags`.
- **«Seleccionar los N que cumplen el filtro»**: igual que en Propiedades, el
  servidor resuelve la selección con el MISMO filtro
  (`resolveFilteredLeadIds`, tope de 2.000 por acción masiva) cuando
  `lead-bulk-jobs` recibe `selectAllFiltered: true` + `filters`. «Exportar
  seleccionados» en ese modo exporta el filtro entero.

Lo cubre `test/unit/leadListExport.test.ts` (más de 1.200 leads en varios
lotes, cada uno una sola vez, sólo de la agencia, con el filtro y las
etiquetas).

### Sin migración nueva

`bulk_action_jobs`/`bulk_action_job_items` (migración 0081) ya admitían
`entityType: 'lead'` desde el incremento 1, y `tags`/`tag_links` ya
admitían `'lead'` como `entityType` — sólo les faltaba un consumidor real.
`lead-bulk-jobs` es una fila más en `adminResources.ts` sobre la misma
tabla `bulk_action_jobs` que ya usa `property-bulk-jobs` (área `crm`, no
`web` — es donde vive el resto de RBAC de Leads), y los branches
`key === 'lead-bulk-jobs'` en `index.post.ts`/`[id].put.ts` reutilizan las
mismas rutas genéricas, mismo criterio de coste-cero-de-ruta que
Properties.
