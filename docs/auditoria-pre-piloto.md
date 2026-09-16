# Auditoría pre-piloto — pasada 1

**Fecha**: 2026-09-16 · **Alcance de esta pasada**: reconocimiento completo
(punto 29 del encargo) + auditoría de las áreas que se han podido verificar
contra el código. **No se ha implementado ningún hallazgo.**

Al final hay una lista explícita de lo que **no** se ha auditado todavía, para
que no se confunda "no encontré nada" con "no lo miré".

---

## 1. Arquitectura real (verificada, no supuesta)

| Capa | Qué es |
|---|---|
| Framework | Nuxt 3 + Nitro, preset `cloudflare_module` |
| Ejecución | Cloudflare Workers |
| Base de datos | D1 (SQLite) vía Drizzle ORM — **una sola base compartida por todos los inquilinos** |
| Almacenamiento | R2, con claves `tenants/<organizationId>/<categoría>/…` |
| Autenticación | Sesión propia en cookie `sa_session`, token guardado **sólo como SHA-256** |
| Multi-tenant | Columna `organizationId` en cada tabla con datos de inquilino, exigida en servidor por `requireOrgScope()` |
| CI/CD | `.github/workflows/ci.yml` — validate → preflight → backup D1 → migraciones → deploy → smoke test |

**Tamaño**: ~49.000 líneas propias. 82 páginas (52 de administración, 30
públicas), 111 componentes, 322 ficheros de servidor, 224 endpoints.

### Los tres constructores

| Constructor | Ubicación | Estado |
|---|---|---|
| **Property Builder** | `components/property-builder/` (13 ficheros, 1.606 líneas) | Compartido por los dos módulos de propiedades |
| **Constructor Web** | `components/site-builder/` (36 ficheros) + `pages/admin/site-builder/` | Modular, 9 tipos de bloque |
| **Constructor de Comerciales** | `components/team-builder/` (4 ficheros, 772 líneas) | Cubre casi todo el esquema |

---

## 2. Lo que ya está resuelto

El encargo pide señalar explícitamente lo que ya funciona. Esto no son
suposiciones: cada punto está verificado en el código y, donde se indica,
respaldado por una prueba que se ejecuta en CI.

**R1 — Interacción en modo edición (punto 6 del encargo).**
Resuelto, y de forma global, no con parches por componente.
`SiteBlockRenderer.vue` intercepta el clic **en fase de captura** sobre el
envoltorio del bloque y llama a `preventDefault()` + `stopPropagation()`, de
modo que un `<a>`, botón o card anidado nunca llega a navegar. La única
excepción es la barra de herramientas del bloque (`[data-block-toolbar]`).
El propio código explica por qué captura y no burbujeo. Cubierto por
`tests/e2e/site-builder.spec.ts`: *«en el lienzo, un clic en un bloque
selecciona sin navegar; en Vista previa navega de verdad»*.

**R2 — Fidelidad WYSIWYG (punto 5).**
El lienzo es un `<iframe>` real dimensionado al **ancho exacto del
breakpoint** (`DEVICE_WIDTH[device]`) y escalado con `transform: scale()`
para caber, con zoom manual y modo automático. No es una web estirada por
CSS, y por eso no aparece gigantesca ni obliga a desplazamiento horizontal.

**R3 — Property Editor compartido (punto 2).**
Existe **un solo** `PropertyBuilder.vue`, que recibe
`resource: 'developer-properties' | 'properties'` y se configura con
`PROPERTY_BUILDER_SECTIONS[resource]` (`composables/usePropertyBuilderConfig.ts`).
Alta y edición entran por la misma ruta (`pages/admin/[resource]/[id].vue`).
Las diferencias están en el schema, exactamente como pedía el encargo.

**R4 — Data binding vivo (punto 9).**
Los bloques **no** guardan copias de las propiedades. `PropertiesBlock.vue`
guarda sólo configuración (`source`, `dynamicFilter`, `limit`, `layout`,
`cardFields`) y recibe los datos por `homeData`, que la web pública obtiene
en vivo (`pages/index.vue`). En modo manual guarda `manualIds`, que son
referencias, no copias. Cambiar precio, nombre o fotos de una propiedad se
refleja sin tocar el constructor.

**R5 — Aislamiento entre inmobiliarias (punto 10).**
Auditado endpoint por endpoint: de los **224 handlers** de `server/api/**`,
todos resuelven organización por una de las cuatro vías reconocidas, o están
exentos con un motivo escrito y verificado uno a uno (rutas anteriores a la
sesión, sondas de salud, webhooks firmados, URLs-capacidad con token).
`test/unit/tenantScopeCoverage.test.ts` impide que un endpoint nuevo se
olvide, y protege además la propia lista de exenciones. En R2, las claves van
namespaced por inquilino. **No se ha encontrado ninguna fuga entre inquilinos.**

**R6 — Permisos por área.**
`users.permissions` + matriz de rutas (`server/utils/adminRouteMatrix.ts`) +
middleware que falla cerrado. Comprobado sobre HTTP real en
`tests/e2e/admin-rbac.spec.ts` (10 pruebas), incluido que un admin
*irrestricto de su agencia* no es super_admin.

**R7 — Modelo de publicación (punto 14).**
`draft` → `published` con versión incremental y snapshot en
`site_page_versions`. La lectura pública **nunca** cae al borrador. Publicar
está acotado por organización y queda en auditoría.

**R8 — Superficie XSS del constructor (punto 18).**
No hay **ni un solo `v-html`** en los bloques del constructor ni en el portal
público. El contenido configurable se renderiza por interpolación de Vue, que
escapa. Es la preocupación concreta que planteaba el encargo y está cerrada.

---

## 3. Hallazgos

### RE01 | P0 — Workers Builds sigue publicando por su cuenta

**Estado**: Confirmado
**Área**: Despliegue / Operaciones

**Impacto funcional**: Cualquier push a cualquier rama se publica en
producción sin pasar por CI, sin copia de seguridad de D1, sin aplicar
migraciones y sin smoke test. Es la causa raíz de la incidencia del 15/09: el
código llegó a producción **12 migraciones por delante del esquema**, faltaba
`users.permissions`, y el login falló para todo el mundo con cualquier
contraseña.

**Evidencia**: `/api/health/ready` en producción responde
`"version": {"source": "workers-builds"}` — el campo se añadió justo para
poder demostrarlo (`scripts/build-info.mjs`). Las migraciones pendientes ya se
aplicaron (run 34966421552), pero **la puerta sigue abierta**.

**Resultado que debe conseguirse**: producción sólo se despliega por el
pipeline; `version.source` pasa a ser `github-actions` de forma estable.

**Criterios de aceptación**:
- Desactivado en Cloudflare → Workers & Pages → sa-inmobiliaria → Settings → Builds.
- Tras el siguiente merge, `/api/health/ready` devuelve `source: github-actions`.
- El smoke test del pipeline deja de avisar de publicación fuera de proceso.

**Prompt de ejecución**: *no aplica a código.* Es una acción en el panel de
Cloudflare, no hay nada que implementar.

---

### RE02 | P0 — El pipeline todavía no puede desplegar: falta `PRODUCTION_URL`

**Estado**: Confirmado
**Área**: CI/CD

**Impacto funcional**: `production-preflight` falla, y con él se salta
`deploy-production`. Mientras eso siga así, el único camino a producción es
RE01 — es decir, los dos hallazgos se sostienen mutuamente.

**Evidencia**: run 34958536034, paso *«Verify PRODUCTION_URL is set and
well-formed»* → `failure`. Los secretos de Cloudflare **sí** están (el paso
anterior pasa desde que se corrigió que el job no declaraba `environment:`).
El valor correcto, descubierto automáticamente al acuñar el primer enlace de
acceso, es `https://sa-inmobiliaria.polished-king-f919.workers.dev`.

**Resultado que debe conseguirse**: el pipeline completa backup → migraciones
→ deploy → smoke test.

**Criterios de aceptación**:
- Variable `PRODUCTION_URL` en Settings → Environments → production → Variables.
- `production-preflight` en verde.
- `deploy-production` se ejecuta y el smoke test confirma el commit desplegado.

**Prompt de ejecución**: *no aplica a código.*

---

### RE03 | P1 — Se guardan versiones de página pero no se pueden restaurar

**Estado**: ✅ **Resuelto** (FASE 2, 16/09). Se mantiene el hallazgo escrito
tal cual estaba para que conste qué se arregló y por qué.

Lo entregado: `GET /api/admin/site-pages/[pageKey]/versions` lista las 50
publicaciones más recientes (versión, fecha, quién publicó, cuántas secciones,
título SEO y cuál está en la web) y `POST .../restore` copia un snapshot **al
borrador, nunca a lo publicado**. En el editor, el icono del reloj de la barra
superior abre el historial; restaurar aplica la versión al lienzo y deja el
botón «Publicar cambios» como único camino a la web pública. Queda registrado
en auditoría con `action: 'restore'`.

Cobertura: 6 pruebas unitarias de aislamiento (el caso peligroso es que
**todas las agencias tienen una "versión 1"**, así que una consulta que
olvidara el `pageId` serviría la de otra — verificado rompiendo el filtro a
propósito y comprobando que las pruebas fallan) y 4 e2e sobre HTTP real,
incluida la restauración conducida desde la interfaz.

**Área**: Constructor Web / Publicación

**Impacto funcional**: Si una inmobiliaria publica una web rota, **no hay
vuelta atrás**. Los snapshots existen en `site_page_versions` y no sirven de
nada, que es la peor combinación: coste de almacenamiento y falsa sensación
de red de seguridad.

**Evidencia**: `publishPage()` en `server/utils/sitePages.ts:98` inserta en
`site_page_versions`. Los endpoints bajo `server/api/admin/site-pages/` son
`[pageKey].get.ts`, `[pageKey].put.ts` y `[pageKey]/publish.post.ts`. **No
existe ningún endpoint de restauración** — el CMS sí tiene
`cms/media/[id]/restore.post.ts`, el constructor no.

**Resultado que debe conseguirse**: poder listar versiones publicadas y
restaurar una anterior al borrador, para revisarla antes de republicar.

**Criterios de aceptación**:
- `GET /api/admin/site-pages/[pageKey]/versions` lista versión, fecha y autor.
- `POST /api/admin/site-pages/[pageKey]/restore` copia un snapshot al borrador
  (no publica directamente).
- Acotado por organización y registrado en auditoría, como `publish`.
- Prueba e2e: publicar v1 → cambiar y publicar v2 → restaurar v1 → el borrador
  vuelve a v1 y lo publicado sigue siendo v2 hasta que se publique de nuevo.

---

### RE04 | P1 — El catálogo de secciones cubre 9 de los ~26 tipos pedidos

**Estado**: Confirmado (es una carencia de alcance, no un defecto)
**Área**: Constructor Web

**Impacto funcional**: Una inmobiliaria no puede construir la web que el
producto promete. Faltan piezas centrales del negocio: **no hay bloque de
comerciales**, ni valorador, ni comparador, ni formulario de captación, ni
reserva de visita, ni testimonios, ni FAQ, ni newsletter, ni galería, ni
estadísticas.

**Evidencia**: `composables/useSiteBuilderRegistry.ts` define 11 presets sobre
**9 tipos distintos**: `hero`, `properties`, `map-teaser`, `communities`,
`property-types`, `mortgage-calculator`, `blog-list`, `text`, `cta`. Hay
paridad 9/9 entre `blocks/` e `inspectors/`, así que lo implementado está
completo — simplemente hay menos de lo pedido.

**Resultado que debe conseguirse**: decidir el subconjunto mínimo para el
piloto y cerrarlo, en vez de acumular bloques a medias.

**Criterios de aceptación**: por bloque nuevo — preset en el registro,
componente en `blocks/`, inspector propio en `inspectors/`, datos en vivo si
es dinámico, y cobertura en `site-builder.spec.ts`.

**Prompt de ejecución** (para más adelante, un bloque por ejecución):

> Añade el bloque «comerciales destacados» al Constructor Web de
> SA_Inmobiliaria. Debe seguir exactamente el patrón de `PropertiesBlock`:
> preset en `composables/useSiteBuilderRegistry.ts`, componente en
> `components/site-builder/blocks/`, inspector propio en
> `components/site-builder/inspectors/`, y consumir datos **en vivo** de
> `team_members` filtrando por `showOnWeb`, sin duplicar información en el
> documento de la página. El inspector debe permitir configurar fuente
> (todos / seleccionados), número, columnas por dispositivo y qué campos se
> ven. Añade cobertura en `tests/e2e/site-builder.spec.ts`. No toques los
> bloques existentes.

---

### RE05 | P2 — «Comerciales» convive con «Agentes» y «Equipo»

**Estado**: ✅ **Resuelto** (FASE 1, 16/09). El hallazgo se mantiene escrito
tal cual para que conste qué se arregló.

Lo entregado: un solo módulo **Comerciales** en `/admin/comerciales`, con el
horario como pantalla de la propia ficha
(`/admin/comerciales/:id/horario`). La entrada «Equipo» del menú desaparece:
editaba el horario de las mismas filas de `team_members` desde otra sección,
con otro nombre. Las URLs antiguas (`/admin/agents`, `/admin/agents/:id`,
`/admin/team`, `/admin/team/:id`) redirigen 301 a la nueva, con el mismo
planteamiento que `00.legacy-demo-redirect.ts` usa para las rutas públicas.

La palabra «agente» ya no aparece en ninguna pantalla del panel ni en el
módulo de ayuda: eran 20 cadenas repartidas por Leads, Clientes, Visitas,
Operaciones, Ingresos, Analítica de citas, Referidos, Automatizaciones y el
dashboard. `test/unit/comercialVocabulary.test.ts` falla si vuelve a
aparecer, y comprobado en negativo.

**Cambio de permisos, dicho en voz alta**: los endpoints de disponibilidad
(`/api/admin/saas/agents/*`) pasan del área `content` al área `web`, porque
la pantalla que los usa se ha mudado a Comerciales. Una cuenta con `content`
y sin `web` deja de poder editar horarios; una con `web` empieza a poder. Es
la alineación correcta —si no, la pantalla se abriría y se llenaría de
403—, pero es un cambio real en quién puede hacer qué.

**Lo que NO se ha tocado**: nombres internos en inglés. La tabla sigue siendo
`team_members`, los endpoints siguen siendo `/api/admin/team`, y el endpoint
público `/api/v1/agents` **no** se renombra: es contrato publicado. Sólo se
ha corregido su etiqueta en la pantalla de documentación de la API.

**Bug encontrado al ejecutar esta fase, y corregido**: la pantalla de horario
devolvía **500 en cualquier carga directa**. Leía `window.location.origin`
dentro de un `watch({ immediate: true })`, que también corre al renderizar en
servidor, donde `window` no existe. No se notaba porque a esa pantalla sólo se
llegaba pulsando un enlace desde el listado —navegación de cliente, sin render
en servidor—; abrirla de primeras, **recargarla con F5 o compartir su URL
fallaba siempre**, y lleva así desde que existe. Lo destapó la prueba e2e de
las redirecciones, que es la primera que la carga de cero. Arreglado con
`useRequestURL()`, que funciona en los dos lados. Comprobado que ningún otro
`watch` inmediato del proyecto usa globales del navegador.

**Hallazgo adicional durante la ejecución**: existe una **tercera** cosa
llamada «agents» — la tabla `agents`, distinta de `team_members`, expuesta
por el CRUD genérico `/api/admin/agents` y contada en `/api/admin/stats`.
Ninguna página del panel la usa. No se ha tocado: retirar una tabla con datos
es una decisión del propietario, no una limpieza de paso.

**Área**: Consistencia de producto

**Impacto funcional**: La misma persona es «Comercial» en una pantalla,
«Agente» en otra y «Equipo» en una tercera. Para un cliente que ve el panel
por primera vez, parecen tres módulos distintos.

**Evidencia**:
- El menú dice «Comerciales» pero la ruta es `/admin/agents` (`utils/adminNav.ts:68`).
- `pages/admin/team/[id].vue:100` → `useHead({ title: 'Agente — Horario' })`
  y muestra `agent.name`.
- `pages/admin/api.vue:166` documenta `/api/v1/agents` con la etiqueta «Agentes».
- Coexisten `pages/admin/agents/` (perfil, usa `CommercialBuilder`) y
  `pages/admin/team.vue` + `pages/admin/team/[id].vue` (disponibilidad y
  horario) sobre la misma entidad.

**Resultado que debe conseguirse**: un solo vocabulario de cara al usuario
—«Comercial»— y un solo punto de entrada, con el horario como pestaña dentro
de la ficha en vez de un módulo aparte.

**Criterios de aceptación**:
- Ninguna cadena visible dice «Agente»/«Agents» cuando se refiere a un comercial.
- `/admin/agents` redirige a `/admin/comerciales` (o se renombra la ruta con
  redirección permanente, para no romper enlaces guardados).
- El horario es accesible desde la ficha del comercial.
- Una prueba que recorra las cadenas visibles y falle si reaparece «Agente».

---

### RE06 | P2 — Dos páginas de listado casi idénticas para los dos módulos de propiedades

**Estado**: ✅ **Resuelto** (FASE 1, 16/09).

Lo entregado: un solo `components/property-list/PropertyList.vue` para los dos
catálogos, y las diferencias declaradas en `PROPERTY_LIST_CONFIG`
(`composables/usePropertyListConfig.ts`) — el gemelo de
`PROPERTY_BUILDER_SECTIONS`, con las mismas claves de recurso. Las dos páginas
pasan de 330 y 327 líneas a 13 cada una. En el componente **no hay ni una
condición sobre `resource`**, igual que en `PropertyBuilder.vue`.

Lo que ahora está declarado en vez de duplicado: título, placeholder del
buscador, estados, opciones de orden, si existe el filtro venta/alquiler, qué
pinta cada fila (título, imagen, ubicación, chips de estado), si hay ficha
pública que previsualizar, y la acción principal propia de cada catálogo
(publicar/despublicar frente a marcar vendida/disponible).

`test/unit/propertyListConfig.test.ts` vigila la forma de fallar que sustituye
a la anterior: que un catálogo se añada a medias. Las e2e de los dos listados
siguen pasando **sin tocarlas**, que era el criterio de aceptación.

**Área**: Propiedades / Deuda técnica

**Impacto funcional**: Bajo hoy, real mañana: toda mejora del listado
(filtros, columnas, acciones) hay que hacerla dos veces, y en cuanto una se
olvide, los dos módulos divergen — exactamente lo que el encargo quiere
evitar.

**Evidencia**: `pages/admin/properties/index.vue` (330 líneas) y
`pages/admin/developer-properties/index.vue` (327). Normalizando el nombre del
recurso, quedan **95 líneas de diferencia**: son variantes del mismo listado,
no dos pantallas distintas.

**Resultado que debe conseguirse**: un listado configurado por schema, igual
que ya se hizo con el editor (R3).

**Criterios de aceptación**: una sola página; las diferencias (columnas,
filtros, acciones) declaradas junto a `PROPERTY_BUILDER_SECTIONS`; los dos
módulos siguen pasando `properties-secondhand-admin.spec.ts` y
`developer-properties-admin.spec.ts` sin cambios en las pruebas.

---

### RE07 | P2 — Un bloque con propiedades elegidas a mano no avisa si una desaparece

**Estado**: Riesgo a reproducir
**Área**: Constructor Web / Data binding

**Impacto funcional**: Si se borra o despublica una propiedad referenciada en
`manualIds`, el bloque la omite en silencio. Una web puede quedarse con tres
tarjetas donde había cuatro sin que nadie se entere.

**Evidencia**: `PropertiesBlock.vue:65-68` filtra `all` por `manualIds`; lo
que no esté en `all` simplemente no sale. No hay aviso en el inspector.

**Cómo reproducirlo**: crear un bloque manual con 4 propiedades, borrar una,
recargar el constructor y la web publicada.

**Resultado que debe conseguirse**: el inspector marca las referencias rotas
y el constructor avisa antes de publicar.

---

### RE08 | P1 — El envío de emails no está conectado en producción

**Estado**: Validación operativa
**Área**: Comunicaciones

**Impacto funcional**: Sin `RESEND_API_KEY` no salen: recuperación de
contraseña, alta de usuario, envío de contratos, recordatorios de cita ni
notificaciones internas de leads. Para un piloto con inmobiliarias reales,
esto bloquea el recorrido de captación completo.

**Evidencia**: toda la maquinaria existe y está probada (`server/utils/email/`,
reintentos, `email_log`, webhook de confirmación). Lo único que falta es el
secreto. Comprobable sin entrar a Cloudflare en **Sistema → Estado del
sistema**, que lo muestra explícitamente.

**Criterios de aceptación**: `/admin/estado` muestra «Envío de emails» en
verde y el recorrido de recuperación de contraseña funciona de extremo a
extremo contra un buzón real.

---

## 4. Matriz

Sólo se rellena lo verificado en esta pasada. «Sin auditar» significa
exactamente eso.

| Área | Estado | Prioridad | Bloqueo para piloto |
|---|---|---|---|
| Multitenancy | Auditado — sin fugas encontradas | — | No |
| Permisos y roles | Auditado — correcto | — | No |
| Propiedades (web) | Editor auditado — correcto | — | No |
| Propiedades 2ª mano | Editor auditado — correcto; listado unificado (RE06) | — | No |
| Property Editor | Auditado — arquitectura correcta (R3) | — | No |
| Comerciales | Constructor cubre casi todo el esquema; vocabulario y módulo unificados (RE05) | — | No |
| Constructor Web | Arquitectura correcta (R1, R2); rollback resuelto (RE03); catálogo corto (RE04) | P1 | **Sí** |
| Publicación | Modelo correcto (R7); restauración entregada (RE03) | — | No |
| Data binding | Auditado — en vivo, sin duplicación (R4) | — | No |
| Multimedia / Archivos | Propiedad y namespacing por inquilino verificados; huérfanos sin auditar | Sin auditar | Desconocido |
| SEO | Existe schema.org, sitemap, robots y SEO por página; cobertura sin auditar | Sin auditar | Desconocido |
| Seguridad | XSS del constructor cerrado (R8); resto parcial | P2 | No |
| Despliegue | Roto: RE01 + RE02 | **P0** | **Sí** |
| Comunicaciones | Sin conectar (RE08) | P1 | **Sí** |
| Rendimiento | **Sin medir** | Sin auditar | Desconocido |
| Responsive | **Sin auditar** | Sin auditar | Desconocido |
| Borrado / huérfanos | **Sin auditar** | Sin auditar | Desconocido |
| Brand Kit, Export, Catálogos | **Sin auditar** | Sin auditar | Desconocido |

---

## 5. Orden de trabajo propuesto

**FASE 0 — Bloqueos críticos.** RE01 y RE02. Son dos acciones en paneles
externos, cuestan minutos y sin ellas no hay despliegue fiable de nada de lo
que venga después. Nada de esto es código.

**FASE 1 — Arquitectura y consistencia.** RE06 (unificar listados) ✅ y RE05
(vocabulario Comerciales) ✅. Hechas.

**FASE 2 — Funcionalidades core.** RE03 (restauración de versiones) ✅ hecha.
RE08 (conectar email) sigue pendiente y **no es código**: falta el secreto
`RESEND_API_KEY` en Cloudflare.

**FASE 3 — UX y Constructor Web.** RE04, un bloque por ejecución, empezando
por los que el negocio inmobiliario necesita de verdad: comerciales
destacados, formulario de captación, reserva de visita.

**FASE 4 — Preparación de piloto.** Completar la auditoría de lo que queda
(sección 6) y ejecutar el recorrido E2E de abajo con una inmobiliaria de
prueba.

**FASE 5 — Optimización.** Rendimiento y RE07.

---

## 6. Lo que NO se ha auditado todavía

Para que no se lea como ausencia de problemas:

- **Rendimiento.** No se ha medido nada. No se darán cifras sin medir.
- **Responsive** del backoffice, del constructor y de la web generada. Requiere
  ejecución en navegador a tres anchos, no lectura de código.
- **SEO** en detalle: cobertura de `title`/`description`/canonical/OG por
  página y por propiedad, `alt` de imágenes, redirects.
- **Archivos huérfanos** y cascadas de borrado: hay 43 `onDelete` en el schema
  y limpieza de R2 en varios sitios, pero no se ha trazado qué pasa con cada
  relación al borrar propiedad, comercial, página u organización.
- **Guardado concurrente** (punto 13): doble clic, peticiones simultáneas,
  navegación con cambios sin guardar.
- **Inspectores bloque a bloque** (punto 8): hay paridad 9/9, pero no se ha
  revisado si cada inspector expone realmente todas las opciones que su bloque
  necesita.
- **Brand Kit, Plantillas de Export, Piezas generadas, Exportación masiva,
  Catálogos combinados**: mencionados en el encargo, no auditados.
- **Rendimiento del comercial** (leads, visitas, operaciones, conversiones):
  el encargo lo condiciona a que exista soporte real; no se ha comprobado.

---

## 7. Recorrido E2E mínimo de piloto

Propuesto para FASE 4. Hoy se cortaría en el paso de email (RE08) y no sería
fiable de publicar (RE01/RE02).

```
Crear inmobiliaria → configurar negocio → crear comercial → crear propiedad
→ subir imágenes → configurar ubicación → publicar propiedad
→ abrir Constructor Web → insertar bloque dinámico de propiedades
→ personalizar → publicar web → abrir web pública → buscar → abrir ficha
→ enviar contacto / solicitar visita
```

Y los dos recorridos de verificación que pide el encargo:

```
Editar propiedad → cambiar precio y foto → guardar → comprobar en la web
Crear propiedad 2ª mano → editar → publicar → comprobar integración
```

**Nota sobre el primero**: dado R4 (data binding en vivo), el paso «comprobar
actualización en web» debería pasar sin tocar el constructor. Es la hipótesis
más valiosa que puede confirmar el piloto.
