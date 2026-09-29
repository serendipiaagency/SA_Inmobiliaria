# PropertySchemaRegistry (FASE 26)

`server/utils/propertySchema/registry.ts` declara, por esquema de propiedad
(Residential/Land/Commercial/Industrial/Garage/Building/NewDevelopment), qué
campos aplican, cómo se agrupan en secciones, cuáles son obligatorios (para
guardar / publicar / portal) y cuáles son candidatos a exposición pública o a
un feed de portal. **No almacena Properties** ni sustituye a
`agent_properties`/`developer_properties` — Property Core sigue siendo la
fuente de verdad; el registro sólo describe comportamiento.

## Por qué es un módulo TS y no una tabla

Ni el megaprompt ni ningún caso de uso real de este proyecto pide que un
tenant redefina sus propios esquemas de propiedad — son 7 categorías fijas
del negocio, no configuración de cliente. Una tabla D1 habría añadido
indirección (lecturas, caché, migraciones) sin ningún beneficio real, y
`server/utils/adminResources.ts` ya demuestra que "configuración de dominio
como código TS" es un patrón establecido y que funciona en este proyecto.
El registro está tipado fuerte (§45 del encargo: "evitar configuraciones
arbitrarias imposibles de validar").

## Por qué vive en `server/` y cómo lo consume el cliente

`server/` no es importable desde `composables/` en este proyecto (Nitro no
bundlea `server/` para el cliente) — confirmado antes de diseñar esto, no
asumido. Dos alternativas reales:

1. Un endpoint dedicado (`GET /api/admin/property-schema`).
2. Añadir el registro a la respuesta de un endpoint que el panel ya pide
   siempre.

Se descartó la (1): el margen de `npm run typecheck` frente al TS2589 de
Nitro (ver `nitro-fetch-warmup.ts`, P1-14 en `docs/production-hardening-audit.md`,
y `docs/deals.md` para el mismo problema en FASE 24) estaba en **0** rutas
nuevas en el momento de construir esto — comprobado empíricamente: añadir
ese único fichero de ruta hizo fallar `npm run typecheck` con TS2589 en
`components/AIAnalysis.vue`, un componente sin relación, exactamente el
mismo síntoma que en FASE 24. Por eso el registro se expone como
`__propertySchemas` dentro de `GET /api/admin/resources`
(`server/api/admin/resources.get.ts`), que el panel ya pide una vez por
sesión — coste de ruta: cero. El prefijo `__` lo distingue visualmente de
las claves de recurso (`Record<resourceKey, ResourceMeta>`), que nunca
empiezan por `__`.

**Consecuencia importante para el resto del bloque FASE 25-29**: el margen
de rutas nuevas de Nitro es ahora 0, no +1 como al cerrar FASE 24. Cualquier
capacidad nueva de FASE 27 (Saved Views, export) o FASE 28 (Bulk Actions)
que necesite servirse por HTTP debe, por este orden de preferencia:

1. Añadir una entrada nueva a `adminResources.ts` y dejar que el motor CRUD
   genérico (`server/api/admin/[resource]/**`, ya una ruta dinámica) la
   sirva — coste de ruta: cero, es el mismo patrón que ya usa este proyecto
   para añadir un recurso nuevo (ver comentario en
   `composables/usePropertyListConfig.ts`).
2. Extender un fichero de ruta ya existente con una rama nueva por
   query/body (patrón `deal-operations.get.ts`/`.post.ts` de FASE 24).
3. Sólo si ninguna de las dos anteriores encaja, crear un fichero de ruta
   nuevo — y entonces volver a medir el margen en un worktree limpio antes
   de asumir que cabe, exactamente como documenta P1-14.

## `publicExposable`/`portalRelevant` no son autorización

Un campo candidato a público (§42 del encargo) sigue sujeto a permissions,
`locationPrivacy`, estado de publicación y config de tenant. La reescritura
de `server/utils/propertyPrivacy.ts` (hoy un denylist,
`INTERNAL_ONLY_KEYS`) a una proyección explícita basada en este registro es
trabajo de **FASE 27** (Property Search) — ese propio fichero ya lo decía
antes de que este registro existiera; FASE 26 no se adelanta a eso, sólo
declara los datos que FASE 27 va a consumir.

## Integración de FASE 26 en este PR: validación server-side real

Antes de este registro, `buildPayload()` (`adminResources.ts`) sólo
comprobaba `required: true` **al crear** (`isCreate`) — un `PUT` que vaciara
un campo obligatorio se guardaba sin más (auditoría FASE 26, confirmado
leyendo el handler, no asumido). `server/api/admin/[resource]/index.post.ts`
y `[id].put.ts` ahora llaman a `validateAgainstSchema()`:

- **Crear** (`index.post.ts`): modo `'save'` siempre — una Property
  incompleta debe poder crearse como borrador (§21).
- **Actualizar** (`[id].put.ts`): valida el estado **resultante**
  (existente + cambios fusionados, no sólo los campos tocados). Modo
  `'publish'` únicamente cuando `publishedAt` pasa de vacío a un valor (el
  único "publicar" real que existe hoy, y sólo en `developer-properties` —
  `agent-properties.publishedAt` no tiene consumidor público, ver
  auditoría). Cualquier otro `PUT` sigue en modo `'save'`.

**Deliberadamente no se movió ningún campo existente de "no exigido" a
"exigido para guardar"**: `properties` (2ª mano) no tenía ningún campo
`required: true` antes de este PR, y así sigue en modo `'save'` — el
registro sólo formaliza esa realidad (§21: guardar un borrador incompleto
debe seguir funcionando). Lo nuevo de verdad es el modo `'publish'`, que no
existía en absoluto antes: hoy protege el único publish-toggle real
(`developer-properties.publishedAt`) para que no se pueda publicar sin
precio, superficie, ciudad, etc. — sin tocar ningún flujo que ya
funcionaba.

## Mapping PropertyType → PropertySchema (§35)

`agent_properties.propertyType` (5 valores residenciales existentes:
Apartment/Villa/Townhouse/Penthouse/Studio) se amplía aquí sólo a nivel de
*mapeo* con 6 valores nuevos (Land/Office/Retail/Warehouse/Garage/Building)
para que los 6 esquemas no-residenciales tengan cómo activarse — la columna
ya era texto libre sin `CHECK` (confirmado en `schema.ts`), así que esto no
necesita migración. **`developer_properties` no participa de este mapeo**:
todo ese catálogo resuelve siempre a `newDevelopment`, porque lo que
distingue un esquema ahí (`handoverDate`, `constructionPercentage`...) es
del proyecto/promoción, no del tipo de unidad dentro de él.

Exponer estos 6 tipos nuevos en el selector del editor (`PROPERTY_TYPE_OPTIONS`
en `composables/usePropertyBuilderConfig.ts`) y las secciones/campos
condicionales que los consuman es trabajo de **FASE 25**, no de este PR —
FASE 26 entrega el registro y su primera integración server-side real
(validación), FASE 25 lo consume en el editor.

## Lo que este PR no hace (a propósito)

- **No construye Owner/Documentos como tabs de la ficha.** El propio
  megaprompt (preámbulo de FASE 25-29) da por hecho que `PROPERTY CONTACT`
  y `PROPERTY DOCUMENTS` ya existen de una fase anterior — verificado
  directamente sobre `schema.ts`: **no existen en absoluto**, ni con ese
  nombre ni con otro (ninguna tabla con `contactId`/`ownerId` en
  `agent_properties`/`developer_properties`, ninguna tabla de documentos de
  propiedad). La fase que los habría creado (`PROPERTY CONTACT`/`PROPERTY
  LEGAL`/`PROPERTY DOCUMENTS`, el bloque "FASE 5-9" de este mismo encargo)
  fue propuesta y retractada explícitamente por el propietario tres veces
  distintas ("olvida este ultimo prompt") y nunca se construyó. Tratar esa
  ausencia como si fuera un simple hueco a rellenar dentro de FASE 25/26
  habría significado reconstruir en silencio un bloque completo que el
  propietario retiró — así que queda documentado aquí como una
  discrepancia real del encargo frente al estado del repo, no resuelto por
  este PR. `docs/deals.md` ya documentó el mismo hueco (sin Document/Note
  transversal) para FASE 24 con el mismo criterio: no inventar
  infraestructura para una fase que no se pidió.
- **No reescribe `propertyPrivacy.ts`** a una proyección explícita — es
  trabajo de FASE 27, ver arriba.
- **No modifica el editor** (`PropertyBuilder.vue`) para consumir el
  registro (campos condicionales, secciones dinámicas) — es FASE 25.
