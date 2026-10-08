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
  comercial, igual que la referencia, y —desde el cierre D1p— el estado
  comercial: la copia nace sin publicar ni reservar). Borrar definitivamente una propiedad
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

## Moneda (FASE 5, cierre D3b)

Antes cada pantalla decidía su moneda: «AED» fijo en `useDash().money` (y con
él presupuestos de leads, operaciones, facturas…), en el mapa, los filtros y
la ficha pública, en la IA y en el SEO; «€» fijo en el listado y las tarjetas
del panel, en el alta de lead, en emails, WhatsApp, contratos y PDF; y la
moneda que se elegía en Configuración no la leía nadie. La regla única vive
en `utils/currency.ts` (compartido por cliente y servidor):

1. **La fuente de verdad es el ajuste `currency` de la agencia**
   (Sistema → Configuración → Moneda; clave `org:<id>:currency` de
   `settings`, y la anterior al espacio de nombres para la agencia 1, igual
   que la zona horaria). Sólo se aceptan los códigos que la plataforma sabe
   pintar y convertir (AED, EUR, USD, GBP, CNY): otro valor es 422.
2. **Los importes se guardan en esa moneda**: nunca se convierten al guardar
   ni al leer. El panel (`useAgencyCurrency()`, `useDash().money`) y el
   servidor (`organizationCurrency()` en `server/utils/currency.ts`: IA,
   INMO —se le dice en qué moneda están los importes—, matching, resumen de la necesidad, WhatsApp, contratos, alertas de
   búsquedas guardadas, Asset Export) formatean con ella en castellano
   (`formatMoney`: «1.250.000 €», «1.250.000 AED»).
3. **Web pública**: la moneda base es la de la agencia, que expone
   `/api/public/tenant` (`currency`). El selector del visitante (cookie
   `display_currency`; la antigua `currency` se escribía siempre con «AED» y
   se deja de leer) sólo cambia cómo se enseña: convierte desde la base con
   tasas orientativas **relativas** (`perUsd`, `convertAmount`), no «desde
   AED». Los filtros de precio siguen en la moneda base, que es en la que
   filtra el API; el presupuesto que escribe un visitante en «Reservar cita»
   se convierte a la base antes de guardarse. SEO y schema.org van siempre en
   la base. El widget incrustable convierte igual desde la base
   (`data-currency` opcional).
4. **Registros con moneda propia** (ofertas, operaciones del pipeline,
   depósitos de Stripe) se enseñan con la suya (`formatAmount`). Una oferta
   nueva sin moneda toma la de la agencia si la eligió; si nunca la eligió,
   `eur` como antes (`defaultRecordCurrency`). Los depósitos de Stripe no
   cambian: cobran en `eur` salvo que se indique otra (es dinero real; el
   formulario lo dice).
5. **Agencia sin ajuste: AED** (`DEFAULT_AGENCY_CURRENCY`), lo que ya
   enseñaban Configuración, la web pública y `useDash` por defecto — igual
   que `DEFAULT_AGENCY_TIMEZONE` es Asia/Dubái. No se ha migrado ni
   convertido ningún dato: una agencia que trabaja en euros elige EUR y desde
   ese momento todo sale en euros.

Quedan con «€» a propósito: la landing de la plataforma (`pages/index.vue`,
maquetas de marketing, no datos de ninguna agencia), los ejemplos de texto
de INMO y de la Ayuda, y el formulario de depósitos (punto 4).

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
PropertySchemaRegistry) y no forman parte de ninguna respuesta pública.
`createdBy` y `deletedAt` de la propiedad están en la lista de columnas que
`toPublicProperty()` elimina siempre.

Desde el bloque N7a la proyección pública la decide el registro
(`publicFields` del esquema que resuelve la propiedad): la ficha pública de
obra nueva incluye `details` con **sólo** los campos públicos de la ficha
ampliada que tienen valor (`toPublicSheet`), y lo que se entrega a un portal
sólo lleva `portalFields` (`buildPortalListing`). Ver
[`documentos-y-multimedia.md`](./documentos-y-multimedia.md).

## Documentos, multimedia, resumen y portales (bloque N7a)

El gestor documental con permisos por rol (FASE 6), la multimedia completa
con metadatos por recurso (FASE 7), el resumen de la ficha, el paso
«Portales», los defaults inteligentes y la validación inmediata por campo
(FASE 25), y el uso de `publicFields` / `portalFields` del registro en los
dos catálogos (FASE 26) están documentados en
[`documentos-y-multimedia.md`](./documentos-y-multimedia.md).

Sobre la Papelera: crear un documento, dar acceso a uno o añadir un recurso
multimedia son «algo nuevo» sobre la propiedad (422 si está en la papelera,
mismo mensaje que el resto); editar los que ya existían, no. Las fotos de
galería, los planos y el resto de tablas hijas siguen editables como hasta
ahora. Borrar definitivamente una propiedad libera además los ficheros de
sus fotos, planos y multimedia (si nadie más de la agencia los usa) y se
lleva sus documentos con sus ficheros.

## Cierre D1p — estado comercial, fechas, renta, comunidad y autor

Sin migración ni rutas nuevas: todo va por el motor genérico
(`[resource]/index.get.ts`, `index.post.ts`, `[id].put.ts`) y las acciones
masivas.

### Estado comercial común frente al `status` de cada catálogo

Había tres datos que se llamaban «estado». Ahora cada uno tiene su nombre y su
sitio, y ninguno se reescribe en bloque:

| Dato | Dónde | Rótulo | Valores |
|---|---|---|---|
| Estado comercial (común) | `property_details.commercial_status` | «Estado comercial» | disponible, reservada, vendida, alquilada, retirada, borrador |
| `status` de obra nueva | `developer_properties.status` | «Estado de la obra» | obra nueva, en construcción, lista |
| `status` de 2ª mano | `agent_properties.status` | «Disponibilidad» | disponible, vendida (la que lee el matching) |
| `is_reserved` (los dos) | fila | «Reservada» (lo que enseña la web) | sí / no |

El estado comercial se filtra (`commercialStatus=reserved,none`), se ve como
columna y chip en el listado, se edita desde la fila (mismo `PUT` del editor) y
en bloque («Cambiar estado comercial», ver [`bulk-actions.md`](./bulk-actions.md)).
El resumen de la ficha lo enseña arriba y, debajo, «Estado de la obra: …» o
«Disponibilidad: …».

Reglas de convivencia (`utils/propertyCommercialStatus.ts`, las mismas en el
servidor —`server/utils/properties/commercialStatus.ts`— y en el editor y el
listado). Sólo se aplican **al cambiar** uno de estos datos:

1. Cambiar el estado comercial ajusta «Reservada»: la marca con «Reservada» y
   la quita con cualquier otro.
2. En 2ª mano, el estado comercial «Vendida» o «Disponible» pone igual la
   disponibilidad (los dos únicos valores comunes). Con reservada, alquilada,
   retirada o borrador, la disponibilidad no cambia.
3. En 2ª mano, pasar la disponibilidad a «Vendida» (a mano, desde la fila, en
   bloque o al cerrar una operación de venta) pasa a «Vendida» un estado
   comercial ya indicado; uno vacío se queda vacío (no se inventa). Volver a
   «Disponible» devuelve a «Disponible» un estado comercial «Vendida».

El estado de la obra nunca se toca desde el estado comercial: es la fase de la
construcción, no si se puede vender. Las fichas existentes con datos que no
cuadran (p. ej. «Reservada» marcada y estado comercial vacío) se quedan como
están hasta que alguien cambie el estado comercial.

Pendiente (no se pidió en este cierre): el matching sigue filtrando 2ª mano por
la disponibilidad, no por el estado comercial; una propiedad «Retirada» o
«Alquilada» con disponibilidad «Disponible» se sigue ofreciendo.

### Fechas de captación y de exclusiva

Columnas de texto (0068) que el editor pedía como texto libre. Ahora:

- El editor usa un selector de fecha. Si la ficha tenía «15/03/2025», el
  selector enseña esa fecha y un aviso de cómo se lee; no se reescribe hasta
  que alguien elige la fecha.
- El servidor exige `AAAA-MM-DD` de calendario **sólo al cambiar** la fecha
  (`assertPropertyDatesOnSave`); al crear, todo es un cambio. El vencimiento
  de la exclusiva no puede quedar antes del inicio.
- Los formatos antiguos habituales se leen igual en todas partes:
  `parsePropertyDate` (`utils/propertyDates.ts`: ISO con o sin hora,
  `dd/mm/aaaa`, `d/m/aaaa`, con `/`, `-` o `.`, y `aaaa/mm/dd`) y su gemela
  en SQL, `normalizedDateSql` (searchService.ts, sólo `trim`/`replace`/
  `substr`/`GLOB`, sin parámetros). Las usan `exclusivityState` (aviso de
  exclusiva caducada o que caduca en 30 días), el filtro «Vencimiento de la
  exclusiva» (`exclusivity=expired|expiring`) y «Captada desde/hasta», que ya
  comparan fechas y no texto. Una fecha imposible en SQL (31/02) no se
  valida: compara como texto normalizado; en JS es «no es una fecha».

### Dormitorios

`bedrooms` se rotula «Dormitorios» en todo el panel (editor, listado, filtro
«Dormitorios (mín.)», tarjetas, resumen del editor y el editor de
necesidades). «Habitaciones (total de estancias)» (`rooms_total`) es otro
dato. La web pública sigue diciendo «Habitaciones» (es lo habitual en los
portales y allí no aparece el total de estancias, así que no confunde).

### Renta mensual

Con `transactionType = rent`, `price` es la renta de cada mes (sin columna
nueva). El editor rotula el campo «Renta mensual» (`FieldSpec.labelFor`); el
listado, las tarjetas, la cabecera y el resumen añaden «/mes»; el precio por
m² pasa a «€/m²·mes» (`priceSuffixFor`, `pricePerM2SuffixFor`).

### Comunidad: un solo campo

`service_charge_annual` («Gastos de comunidad anuales», en la fila desde
antes de la ficha ampliada) y `community_fee_monthly` («Comunidad (mensual)»,
ficha ampliada) decían lo mismo. Decisión: la comunidad se escribe en
«Comunidad (mensual)» (Precio → Gastos del inmueble). El campo anual no se
borra ni se convierte (convertir anual → mensual sería inventar un redondeo):
sólo aparece, como «Gastos de comunidad anuales (dato anterior)» y con su
explicación, en las fichas que **ya lo tenían relleno al abrirlas**
(`FieldSpec.legacyOnly`). Vaciarlo lo hace desaparecer la próxima vez. La
casilla antigua «Reservada» sigue el mismo criterio: sólo se ve en las fichas
que la tenían marcada, porque ahora la marca el estado comercial.

### Quién y cuándo

El resumen de la ficha (`?view=summary`) devuelve `createdBy`, `createdAt` y
`createdByName`, y la cabecera dice «Creada por X el Y». El nombre sólo se
resuelve si el usuario es de la agencia o super_admin (como el histórico de
precios); las fichas anteriores a N1 no tienen autor y lo dicen.

### Estado del inmueble y edificio en la ficha pública (#110)

La migración 0091 añade a `property_details` cinco campos, con sus reglas en
`PropertySchemaRegistry`: `kitchen_equipment` (equipada / semiequipada / sin
equipar), `bathrooms_condition` y `installations_condition` (nuevos,
reformados, buen estado, para actualizar), `building_condition` (obra nueva,
excelente, buen estado, necesita reformas) y `units_per_floor`. Son públicos.

La ficha pública los pinta en dos tarjetas separadas, «Estado del inmueble» y
«El edificio» (`utils/propertyFacts.ts`: `conditionRows` y `buildingRows`),
con estas reglas:

- Sólo lo que consta. Nada se deduce de las fotos ni se inventa; sin filas,
  no hay tarjeta ni pestaña en la barra de secciones.
- Desconocido no es «No». Un sí/no de la ficha ampliada vale 1, 0 o NULL: el
  0 es un «No» marcado y se enseña. Las casillas de la propiedad (ascensor,
  accesible) valen 0 por defecto, así que ahí sólo sale el «Sí»; «Amueblado»
  (yes / no / partially) enseña también su «No».
- Una fuente por concepto: la calefacción va en el inmueble; el año de
  construcción, en el edificio. Si no hay estado físico guardado y la
  promoción es obra nueva o está en construcción, el estado general es «Obra
  nueva» (es un dato de la ficha, no una suposición).

## Deriva conocida de producción

La tabla `leads` de producción tiene una columna `converted_contact_id` que
ninguna migración crea (resto del incidente de la 0069). La 0086 **no** la
vuelve a añadir; el código no la usa (el contacto convertido es
`leads.contact_id`). Staging la tiene por la primera versión de la 0086.
