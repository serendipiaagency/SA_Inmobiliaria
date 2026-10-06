# Domain Tools API (FASE 31)

Una capa estable de **herramientas inmobiliarias** sobre los servicios de
dominio que ya usa el panel. La usan dos clientes con exactamente las mismas
reglas: la API (`POST /api/admin/domain-tools`) e INMO (`docs/inmo.md`).

```
PRODUCT UI ───────┐
                  ▼
            DOMAIN SERVICES   (upsertLead, resolveContact, Matching, createAdminAppointment,
                  ▲            updateAppointment, createTask, sharePropertyInConversation,
                  │            createOffer, createPropertySelection…)
DOMAIN TOOLS API ─┘   ← INMO es un cliente más
```

Ninguna herramienta reimplementa una regla de negocio ni acepta SQL, nombres
de tabla o de columna (§25). Cada una autoriza, valida y delega.

## Código

| Archivo | Qué hace |
| --- | --- |
| `server/utils/tools/types.ts` | Contrato (`DomainTool`), contexto (`ToolContext`) y errores tipados (`ToolError`) |
| `server/utils/tools/registry.ts` | Las herramientas: validación, esquema JSON de entrada, delegación y DTO compacto |
| `server/utils/tools/execute.ts` | Ejecutor común: autorización → validación → confirmación → idempotencia → servicio → traza |
| `server/utils/selections/service.ts` | `PropertySelection` (nuevo, migración 0084) |
| `server/utils/appointments/update.ts` | `updateAppointment()` extraído de `saas/visits/[id].patch.ts` (la ruta y las herramientas comparten la misma lógica) |
| `server/utils/comms/open.ts` | `openConversation()` extraído de `comms/conversations/index.post.ts` |

## Herramientas

| Herramienta | Tipo | Permiso | Confirmación | Idempotente | Servicio |
| --- | --- | --- | --- | --- | --- |
| `search_properties` | lectura | web:read | — | — | `buildPropertyFilterConds` (PropertySearchService) + PropertySchemaRegistry |
| `get_property` | lectura | web:read | — | — | `toPublicProperty` (vista `public`) / ficha interna compacta (`internal`) |
| `find_contacts` | lectura | crm:read | — | — | `searchContacts` (la búsqueda de Contactos) |
| `find_matches` | lectura | crm:read | — | — | Motor de Matching: `findPropertiesForRequirement` (necesidad guardada) o `findPropertiesForCriteria` (exploratoria, sin persistir) |
| `create_lead` | escritura | crm:write | — | sí | `upsertLead` (Contact + dedup + routing + SLA + Activity). Con `propertyKind` (por defecto `developer`) y `language` normalizado (cierre D2L) |
| `update_lead` | escritura | crm:write | — | — | `transitionLeadStage`, `reassignLead`, `setLeadOutcome`; cambia la propiedad de interés con `propertyId` + `propertyKind` (juntos; `null` la quita). Sin `reason`, el historial dice de dónde vino («Cambio hecho con INMO», «Automatización», «Domain Tools API») |
| `create_contact` | escritura | crm:write | — | sí | `resolveContact` (nunca fusiona dudosos: los devuelve) |
| `update_buyer_requirements` | escritura | crm:write | — | — | `createBuyerRequirement` / `updateBuyerRequirement` |
| `book_viewing` | escritura | crm:write | **sí** | sí | `createAdminAppointment` (conflictos reales del comercial) |
| `reschedule_viewing` | escritura | crm:write | **sí** | — | `updateAppointment` (misma cita, con historial) |
| `cancel_viewing` | escritura | crm:write | **sí** | — | `updateAppointment` → `cancelled` (nunca DELETE) |
| `create_task` | escritura | crm:write | — | sí | `createTask` (+ próxima acción del lead) |
| `send_property` | escritura | crm:write | **sí** | sí | `openConversation` + `sharePropertyInConversation` (Centro de Comunicaciones) |
| `create_property_selection` | escritura | crm:write | — | sí | `createPropertySelection` |
| `create_offer` | escritura | crm:write | **sí** | sí | `createOffer` (oferta + revisión inicial + Activity) |

`find_matches` admite, desde el núcleo N8a (FASE 30), **una necesidad no
guardada**: `{ criteria: { operation, propertyTypes, desiredZones, priceMin,
priceMax, areaMin, bedroomsMin, bathroomsMin } }` en lugar de
`buyerRequirementId` (uno u otro, nunca los dos; tipos del catálogo común,
operación sale/rent, al menos un criterio). Se evalúa con el MISMO prefiltro y
el MISMO motor que una necesidad guardada (importancias por defecto del
catálogo) y no escribe nada: ni necesidad, ni matches, ni actividad. La salida
lleva `exploratory: true`, `saved: false`, los criterios usados y
`suggestion` — ofrecer guardarla con `update_buyer_requirements` para una
persona concreta —, y `target: null` (no hay entidad).

`find_contacts` no estaba en la lista inicial del encargo (§23): se añadió
para la desambiguación de §17 («hay 3 María García»). Es de lectura, devuelve
como mucho 8 coincidencias con sus leads y necesidades y marca `ambiguous`.

### Notas por herramienta

- **Horas.** `scheduledAt`/`dueAt` son la hora local de la agencia tal como
  se ve en el calendario (el panel guarda el `datetime-local` del navegador
  sin zona), formato «AAAA-MM-DD HH:MM». No hay zona horaria por agencia en
  el esquema, así que nada se convierte.
- **search_properties.** `text` resuelve una propiedad concreta por nombre o
  referencia (obra nueva: nombre, referencia; 2ª mano: referencia, calle,
  ubicación). Criterios estructurados: operación, tipos, zonas
  (ciudad o distrito, cualquiera de ellas), precio, superficie, parcela,
  dormitorios, baños, características (`terrace`, `pool`, `garage`,
  `elevator`, `garden`, las columnas `has_*` de los dos catálogos), comercial,
  orden y límite (≤ 20). Lo que no se envía no filtra (§8). **§9**: si todos
  los tipos pedidos son de un schema sin `area` y con `plotArea` (Suelo), el
  `areaMin/areaMax` se aplica a la parcela. 2ª mano sólo `available`.
  Filtrar por comercial busca en los dos catálogos: obra nueva también tiene
  comercial asignado (`developer_properties.agent_id`). Hasta el bloque N7b
  el filtro descartaba obra nueva entera (fallo de la FASE 31 en
  `docs/auditoria-nucleo-megaprompt.md`); lo cubre
  `test/unit/domainTools.test.ts`.
- **get_property.** `public` aplica `toPublicProperty` (sin referencias
  internas ni número de portal según `locationPrivacy`); `internal` añade
  mandato, referencia de agencia y dirección. Nunca la fila entera.
  **No existe** un campo «precio mínimo autorizado» ni permisos por campo
  (auditoría FASES 30-34): el ejemplo §22 queda cubierto por no exponer
  ningún dato fuera de esas dos vistas.
- **send_property.** `PROPERTY_NOT_PUBLISHABLE` si una obra nueva no está
  publicada o una 2ª mano no está `available`. El contenido es el de
  `buildPropertyShare` (sólo datos publicables, §42). El PropertyMatch pasa a
  `sent` únicamente si el proveedor aceptó el envío (§43).
- **create_task.** `createTask()` ahora comprueba que **todas** sus
  referencias (lead, contacto, responsable, propiedad, cita, operación) son
  de la organización — antes sólo guardaba el número, también desde la ruta
  `POST /api/admin/saas/tasks`.

## Contrato HTTP

`POST /api/admin/domain-tools`

```json
{ "tool": "search_properties", "input": { "zones": ["Chamberí"], "features": ["terrace"], "priceMax": 650000 },
  "idempotencyKey": "opcional", "confirmed": false }
```

Respuesta correcta: `{ ok: true, tool, output, target }` (`replayed: true` si
se devolvió un resultado guardado por idempotencia).
Error: `{ ok: false, tool, error: { code, message, details? } }` con estado HTTP:

| Código | HTTP |
| --- | --- |
| `NOT_FOUND`, `UNKNOWN_TOOL` | 404 |
| `CONFLICT`, `DUPLICATE`, `AMBIGUOUS_ENTITY`, `CONFIRMATION_REQUIRED` | 409 |
| `VALIDATION_ERROR`, `PROPERTY_NOT_PUBLISHABLE` | 422 |
| `PERMISSION_DENIED` | 403 |
| `PROVIDER_ERROR` | 502 |
| `INTERNAL_ERROR` | 500 |

`GET /api/admin/domain-tools?view=catalog` → `{ tools: [...] }`: sólo las
herramientas que el RBAC del usuario permite, con su `inputSchema`.

`GET /api/admin/domain-tools` → la **traza** (motor de recursos, área
`system`, sólo lectura; `DELETE` responde 405).

## Seguridad

- **Autorización.** El área y la acción de cada herramienta se comprueban en
  `executeTool()` con `hasAreaAccess(user, …)` antes de validar nada. En la
  matriz RBAC (`server/utils/adminRouteMatrix.ts`) la colección
  `domain-tools` es `per-tool`: la ruta no puede ver qué herramienta va en el
  cuerpo, así que el middleware sólo exige sesión admin y el ejecutor decide.
  `domain-tools/:id` sigue la regla del motor de recursos (área `system`).
- **Tenant.** `orgId` sale siempre de `requireOrgScope()`, nunca del input.
  Cada id que llega se resuelve dentro de la organización (404 si no).
- **Confirmación (§20).** Las herramientas marcadas devuelven
  `CONFIRMATION_REQUIRED` (con el input ya validado) hasta que llega
  `confirmed: true`.
- **Idempotencia (§48).** Con `idempotencyKey`, la primera ejecución correcta
  guarda su resultado; la repetición lo devuelve sin ejecutar
  (`replayed: true`). Índice único parcial `(organization_id, tool,
  idempotency_key) WHERE status = 'ok'` — la clave de una agencia no afecta a
  otra.

## Traza (`domain_tool_calls`, migración 0084)

Cada llamada deja una fila: herramienta, tipo, origen (`api` | `inmo`),
usuario, `ok`/`error`, código de error, entidad afectada, latencia. **Nunca**
el prompt ni el input. `result_json` sólo en escrituras con clave de
idempotencia (es lo que se devuelve en la repetición).

## Pruebas

- `test/unit/domainTools.test.ts`: RBAC y catálogo, validación tipada, sin
  SQL arbitrario, aislamiento entre agencias, vista pública/interna,
  búsqueda estructurada, confirmación, conflictos de agenda, cancelación sin
  borrado, `PROPERTY_NOT_PUBLISHABLE`, idempotencia y traza.
- `tests/e2e/inmo.spec.ts`: la API directa sobre HTTP real (catálogo,
  404/409/422 tipados, DTO público, traza imborrable) e INMO de punta a punta.
