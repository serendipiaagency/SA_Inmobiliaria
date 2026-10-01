# INMO sobre datos estructurados (FASE 30)

INMO es el asistente del panel (`/admin/inmo`, grupo CRM). No tiene acceso
propio a la base de datos: es **un cliente más de la Domain Tools API**
(`docs/domain-tools.md`), con el usuario, el RBAC y la organización de la
sesión. El modelo sólo decide qué herramienta llamar y con qué criterios;
propiedades, puntuaciones y disponibilidad salen siempre de los servicios de
dominio.

## Estado de partida (auditoría)

| Pieza | Estado |
| --- | --- |
| Llamada a Claude | PARTIAL — `server/utils/ai.ts` (texto, sin herramientas) |
| Tool calling | MISSING → este módulo |
| RAG / base documental / embeddings | **MISSING** — no hay bindings de Vectorize ni documentos indexados |
| Memoria de conversación | MISSING → historial en el cliente + contexto de entidades |

No se ha construido RAG en esta fase: INMO lo dice explícitamente cuando le
preguntan por manuales o procedimientos, y separa la orientación general de
los datos de la agencia (§14). Si en el futuro se añade, irá como otra
herramienta de lectura (fuente distinta, procedencia distinta), nunca como
sustituto de `search_properties` (§6).

## Flujo de un turno (`server/utils/inmo/orchestrator.ts`)

```
usuario ──► POST /api/admin/domain-tools { mode: 'inmo', messages, message, entities }
             │
             ├─ sanea el historial (sólo text / tool_use / tool_result, ≤ 40 mensajes, ≤ 200 KB)
             ├─ system prompt: reglas (§7-§18) + fecha actual + entidades ya resueltas (§16)
             └─ bucle (≤ 6 pasos, 1 herramienta por paso):
                   modelo → tool_use ─► executeTool(source: 'inmo')  ─► tool_result ─► modelo
                                  └─ requiresConfirmation ─► se valida, NO se ejecuta ─► `pending`
usuario pulsa «Confirmar» ──► { resolve: { toolUseId, approve: true } }
             └─ executeTool(confirmed, idempotencyKey: `inmo:<toolUseId>`) ─► el modelo resume
```

La respuesta es `{ messages, reply, pending, provenance, entities }`:

- **`provenance`** (§13): qué herramienta produjo cada dato, sobre qué
  entidad, con cuántos resultados o con qué error. La página la enseña bajo
  cada respuesta; la traza `domain_tool_calls` guarda lo mismo con
  `source = 'inmo'`.
- **`entities`** (§16): referencias estructuradas (`contact #12`,
  `developer_property #4`, `appointment #31`…) a lo ya resuelto. Viajan de
  vuelta en cada turno y el system prompt se las da al modelo por id, así que
  «agéndale una visita» no depende de releer el texto del historial.
- **`pending`** (§19-§20): la acción con efectos externos que espera
  confirmación, con su input ya validado. Mientras hay una pendiente no se
  puede seguir escribiendo. «Cancelar» devuelve al modelo un
  `CANCELLED_BY_USER` y no ejecuta nada. Un doble clic en «Confirmar» repite
  la misma clave de idempotencia y no duplica la visita.

El servidor no guarda la conversación. Eso no abre permisos: cada
herramienta vuelve a autorizar con la sesión real; un historial manipulado
sólo puede hacer lo mismo que una llamada directa a la API con ese usuario.

## Reglas que el prompt impone (y lo que las garantiza de verdad)

| Regla del encargo | Prompt | Garantía en código |
| --- | --- | --- |
| §6/§10 búsqueda por dominio, no por RAG | usa `search_properties` | no existe otra fuente de propiedades |
| §8 no inventar criterios | lo no dicho no se envía | el validador sólo filtra lo que llega |
| §9 superficie según schema | «parcela» → `plotAreaMin` | `search_properties` aplica el PropertySchemaRegistry |
| §11 sin «91 %» intuitivo | usa `find_matches` | el % sólo existe en la salida del motor de Matching |
| §12 sólo propiedades reales | nunca menciones nada no devuelto | el modelo no recibe otras propiedades |
| §17 desambiguación | pregunta si hay varias | `find_contacts` marca `ambiguous` |
| §18 buscar ≠ guardar | sólo guarda si se pide | ninguna herramienta de lectura escribe |
| §20 confirmación | — | `executeTool` exige `confirmed` |
| §21 seguridad | — | RBAC por herramienta + tenant de la sesión |

Las instrucciones del prompt **no** son seguridad (§21): lo que importa está
en la columna de la derecha.

## Horas

Las citas y tareas se guardan con la hora local de la agencia tal como se
ve en el calendario (sin zona). INMO recibe la fecha actual y la instrucción
de escribir «mañana a las 17:00» como `AAAA-MM-DD 17:00`, sin convertir.

## Configuración

- `AI_API_KEY` (secreto del Worker). Sin ella la página avisa
  (`AI_NOT_CONFIGURED`, 503) y no se llama a nadie.
- `AI_MODEL`: el mismo que usa el resto de la IA de la plataforma
  (`AI_MODEL_DEFAULT` en `server/utils/ai.ts` si no se define). INMO necesita
  un modelo con tool use.
- `AI_BASE_URL`: sólo para el simulador e2e; se ignora salvo `http://` a
  loopback (`server/utils/loopback.ts`).

## Pruebas

- `test/unit/inmoOrchestrator.test.ts` (modelo = `fetch` guionizado):
  búsqueda de §5 con criterios estructurados y sin datos de otra agencia,
  refinamiento con contexto, RBAC (herramientas no ofrecidas y denegadas),
  confirmación (pendiente → confirmar una vez aunque se pulse dos; cancelar),
  desambiguación y contexto de entidades, sin clave, proveedor caído,
  `AI_BASE_URL` sólo loopback y saneado del historial.
- `tests/e2e/inmo.spec.ts`: en el panel real, con la Messages API guionizada
  de `scripts/e2e-provider-mock.mjs`: buscar → refinar → agendar con
  «Confirmar», procedencia, contexto y traza.
