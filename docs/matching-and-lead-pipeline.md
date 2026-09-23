# Necesidades, matching y pipeline de leads (FASES 10-14, migración 0069)

Documentación técnica de cuatro piezas que se diseñaron juntas porque se
alimentan unas a otras: una necesidad estructurada (`BuyerRequirement`) se
cruza contra los dos catálogos de propiedades mediante un motor de matching
determinista; el resultado alimenta el trabajo comercial sobre `Lead`, que
avanza por un pipeline con fase e historial propios; y todo lo anterior
depende de que `Contact` (la persona) no esté duplicado, así que existe un
mecanismo de fusión seguro y revisable. Nada de esto usa un LLM ni hace
llamadas de red: es SQL y una función pura.

## BuyerRequirement: la necesidad como entidad, no como JSON

`buyer_requirements` guarda los campos con columna propia (operación, tipo,
presupuesto, superficie, dormitorios, zonas, radio…). Las características
booleanas (terraza, garaje, ascensor, piscina, jardín) y la importancia de
**cualquier** criterio viven en una tabla aparte, `buyer_requirement_criteria`
(`criterionType`, `importance`, `operator`, `valueBool` opcional), en vez de
cincuenta columnas `wants_pool_required` / `wants_pool_preferred`. Tres
niveles de importancia:

- `required` — imprescindible: si no se cumple, el inmueble queda descartado.
- `preferred` — puntúa, pero no descarta.
- `indifferent` — no se guarda como fila (`criteriaRowsFor()` en
  `server/utils/buyerRequirements/service.ts` lo omite): "no le importa" no
  es lo mismo que "lo tiene marcado como preferido a favor".

`status` (`active | paused | fulfilled | archived`) es el ciclo de vida de la
búsqueda en sí — independiente de si algún match concreto se marcó
`selected`/`discarded`.

## El motor de matching (`server/utils/matching/engine.ts`)

`evaluateMatch(property, requirement)` es una función pura: sin `event`, sin
`db`, sin aleatoriedad. Las dos direcciones (necesidad → inmuebles,
inmueble → compradores) llaman exactamente a esta función, así que no pueden
divergir — está prohibido por diseño tener un motor paralelo por catálogo.

Tres reglas gobiernan el archivo entero (están también como comentario en la
cabecera del fichero):

1. **La explicación la produce el motor.** Cada criterio evaluado devuelve
   qué se comparó, con qué valores, y cuánto pesó — nunca un porcentaje suelto
   que haya que justificar después en otro sitio.
2. **UNKNOWN no es FALSE.** Las columnas `has_terrace`/`has_pool`/… son
   `NOT NULL DEFAULT 0`, así que un 0 es ambiguo: "no lo tiene" o "nadie lo ha
   revisado todavía". `featureValue()` resuelve la ambigüedad con
   `featuresReviewedAt`:

   ```
   has_x = 1                   → SÍ
   has_x = 0 y hay revisión    → NO
   has_x = 0 y no hay revisión → DESCONOCIDO
   ```

   `markFeaturesReviewed()` (`server/utils/matching/service.ts`) es lo único
   que pone esa marca — sólo una persona mirando la ficha puede convertir un
   hueco en un "no" real.
3. **Los imprescindibles no se diluyen en la fórmula.** Un `required`
   incumplido pone `eligibility: 'ineligible'` y no resta puntos (su `weight`
   es 0). Uno que no se puede comprobar (`outcome: 'unknown'`) tampoco se da
   por bueno ni por malo: `eligibility: 'needs_review'`.

El score (0-100) sale sólo de los criterios `preferred` que se pudieron
evaluar (`scorable`); los `unknown` quedan fuera del denominador y se reflejan
aparte en `confidence` (qué fracción de los criterios puntuables se pudo
comprobar), para no castigar una ficha incompleta ni fingir certeza que no
hay.

## Dos catálogos, un solo motor (`server/utils/matching/service.ts`)

`developer_properties` (obra nueva / web) y `agent_properties` (2ª mano)
comparten las columnas que el motor necesita (Property Core, migración
0068), pero son tablas Drizzle distintas — no hay una tabla ni un tipo
polimórfico. `tablesFor(kind: 'developer' | 'agent')` es el único punto que
sabe qué tabla de propiedades consultar y en qué tabla persistir matches
(`developer_property_matches` para obra nueva, espejo exacto de
`property_matches`, que sigue siendo la de 2ª mano). El `as any` dentro de
ese archivo es deliberado y está documentado en el propio código: es la capa
de acceso a datos la que se relaja, nunca el motor.

`findPropertiesForRequirement()` recorre **los dos catálogos** en cada
consulta y combina los resultados con su `propertyKind`; `sortByScore()` deja
primero los elegibles, luego por score, con desempate estable por id para que
dos peticiones idénticas den siempre el mismo orden.

Antes de puntuar en detalle, un prefiltro SQL (`candidatesInCatalog()`) recorta
por tenant, operación y un margen de precio (`PREFILTER_SLACK`, alineado con
`PARTIAL_TOLERANCE` del motor) — nunca compara todo contra todo en memoria.

`setMatchStatus()` recalcula el resultado con el motor en el propio servidor
y lo persiste junto al `breakdownJson` — el cliente nunca puede mandar un
score y que el histórico se lo crea. Sólo `new | selected | discarded` se
pueden fijar a mano (`MANUAL_STATUSES`); `sent`/`viewing`/`offered` están
reservados para cuando exista el envío real (Comunicaciones), la visita
(Appointment) o la oferta (Offer) — no se simulan con un estado suelto.

## Lead: entidad real, resuelta contra Contact

`upsertLead()` (`server/utils/leads.ts`) sigue matcheando por email dentro
del tenant para no duplicar un lead repetido, pero ahora además resuelve
quién es la persona detrás llamando a `resolveContact()`
(`server/utils/contacts/service.ts`) — la misma función que ya usa el CRM
manual, no una nueva ruta de dedup. Si hay una coincidencia exacta única
(email/teléfono/WhatsApp normalizados) se reutiliza ese `Contact`; si no,
se crea uno nuevo. La resolución está envuelta en un `try/catch` que nunca
deja que un fallo ahí tumbe la creación del lead — un `contactId` NULL es
recuperable a mano; un lead perdido, no.

`contactId` se fija tanto al crear el lead como al actualizar uno existente
por el mismo email — antes de esta fase sólo se fijaba en la creación, así
que todo lead que llegaba por segunda vez se quedaba sin persona enlazada.

### Atribución (UTM / first-touch)

`plugins/utm-capture.client.ts` lee `utm_source/medium/campaign/content/term`
de la URL, el `document.referrer` (sólo si es externo) y la ruta de
aterrizaje la primera vez que alguien entra, y lo guarda en una cookie
`sa_ft` (30 días) — sólo si hay algo real que guardar y sólo si la cookie no
existe ya, para no pisar el primer toque con el último. `readFirstTouch()`
(`server/utils/firstTouch.ts`) la lee en servidor y no lanza si falta o está
corrupta: devuelve `{}`, nunca datos inventados. Los cuatro formularios
públicos que crean leads (contacto, visitante, referidos, reserva con un
agente) la incorporan.

Es deliberadamente mínimo: una cookie de primer toque, no un motor de
atribución multi-touch con sesiones — no había necesidad real de más para
esta fase.

## Pipeline de leads: fase y estado no son lo mismo

`leads.status` ya tenía significado propio en 20+ archivos antes de esta
fase (`new | contacted | qualified | proposal | won | lost`) y no se ha
redefinido. En su lugar se añadió `leads.stage`, la posición real en el
pipeline (`new | contacted | qualifying | qualified | viewing | offer |
negotiation | won`), con una tabla de derivación fija,
`STATUS_FOR_STAGE`, en `server/utils/leads/pipeline.ts`, que mantiene
`status` sincronizado en cada cambio de fase sin que nadie tenga que
recordarlo.

`transitionLeadStage()` es el **único** sitio del código que debe escribir
`leads.stage` — ningún componente hace `lead.stage = ...` directamente.
Cada llamada además inserta una fila en `lead_stage_history`
(`fromStage`, `toStage`, `reason`, `userId`, `createdAt`); esa tabla es
sólo-inserción, nunca se actualiza ni se borra una fila suya, así que el
historial de un lead es siempre reconstruible tal como ocurrió.

"Perdido" es una dimensión de **resultado**, no de fase:
`setLeadOutcome({ lost, lostReason })` pone `status: 'lost'` +
`lostReason`, pero **no toca `stage`** ni escribe en el historial — la fase
se queda congelada donde estaba cuando se perdió, evitando la inconsistencia
que la fase explícitamente prohíbe (`stage='won'` + `status='lost'` sin que
quede constancia de qué pasó). Reactivar (`lost: false`) vuelve al `status`
que le corresponde a la fase actual — nunca a `'new'` a secas, que borraría
en qué punto del proceso estaba.

## Deduplicación de Contact: nunca automática, nunca destructiva

`findDuplicateContacts()`/`resolveContact()` (`server/utils/contacts/
service.ts`, ya existentes desde antes de esta fase) siguen siendo la única
puerta de entrada para dedup — `upsertLead()` los reutiliza, no reimplementa
nada. Lo nuevo es la fusión explícita cuando una persona decide unir dos
fichas:

- `previewMerge()` (`server/utils/contacts/merge.ts`) enseña los dos
  registros completos, en qué campos (`name`/`email`/`phone`/`whatsapp`)
  difieren, y cuántas filas de `buyer_requirements`/`leads`/`clients`
  cuelgan del duplicado — nada se toca todavía.
- `mergeContacts()` reasigna esas tres relaciones al `masterId` (nunca las
  borra ni las copia: `UPDATE ... SET contact_id = master`), y **archiva**
  el duplicado (`status: 'archived'`, `deletedAt`) — nunca un `DELETE`. Un
  merge erróneo se puede auditar después porque la fila del duplicado sigue
  existiendo.
- `fields` resuelve los conflictos campo a campo. Un campo ausente de
  `fields` conserva el valor del superviviente si ya tenía uno, o toma el
  del duplicado sólo si el superviviente lo tenía vacío — nunca se pierde un
  dato real por no elegir explícitamente. La identidad normalizada
  (`normalizedEmail`/`normalizedPhone`/`normalizedWhatsapp`) se recalcula
  sobre el conjunto de campos **final**, no sobre el patch parcial: hacerlo
  sobre el patch habría dejado a NULL la normalización de cualquier campo no
  tocado explícitamente (bug real, encontrado y corregido durante el
  desarrollo de esta fase, nunca llegó a desplegarse).
- Matches ya persistidos (`property_matches`/`developer_property_matches`)
  guardan el `contactId` que tenían en el momento en que se crearon — son
  histórico de una decisión comercial tomada entonces y no se reescriben al
  fusionar; los matches nuevos que se generen después ya salen con el
  `contactId` correcto porque `buyer_requirements.contactId` sí se reasignó.

## Qué queda fuera a propósito (para más adelante)

Explícitamente fuera del alcance de esta fase — no son bugs, son la frontera
que marcó el propio encargo: enrutado de leads, SLA completo, Appointment
completo, VisitOutcome, timeline de actividad completo, sistema de tareas,
Offer, Deal, Lead Score (fase posterior dedicada) y las herramientas INMO
finales. No se ha construido ninguna versión provisional de ellas para no
tener que deshacerla después.
