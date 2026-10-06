import { AI_MODEL_DEFAULT } from '../ai'
import { loopbackOrigin } from '../loopback'
import { executeTool, getTool, toolCatalogFor } from '../tools/execute'
import type { ToolContext } from '../tools/types'
import { DEFAULT_BRAIN, getBrainDefinition } from './brainCatalog'

/**
 * INMO sobre datos estructurados (FASE 30). INMO no tiene acceso propio a
 * la base de datos: es un cliente más de la Domain Tools API (FASE 31), con
 * el MISMO usuario, el MISMO RBAC y la MISMA organización que la sesión. El
 * modelo sólo decide qué herramienta llamar y con qué criterios; las
 * propiedades, puntuaciones y disponibilidad salen siempre de los servicios
 * de dominio (§6, §11, §12).
 *
 * El servidor no guarda la conversación: el cliente envía el historial en
 * formato Messages API y recibe el historial ampliado. Eso no abre ningún
 * permiso — cada herramienta vuelve a autorizar con la sesión real, y lo
 * peor que puede hacer un historial manipulado es lo mismo que una llamada
 * directa a la API con ese usuario.
 *
 * Confirmación (§20): una herramienta con efectos externos nunca se ejecuta
 * en el turno en que el modelo la pide. Se devuelve como `pending`; sólo
 * cuando la persona pulsa «Confirmar» se ejecuta, con `confirmed` y la clave
 * de idempotencia `inmo:<tool_use_id>` — un doble clic no agenda dos visitas.
 *
 * Bloque N8b (INMO Intelligence):
 *  - Cerebro (`deps.brain`): perfil por tarea con sus instrucciones y su
 *    subconjunto de herramientas. El modelo sólo recibe esas (∩ RBAC) y el
 *    ejecutor deniega cualquier otra (`allowedTools`).
 *  - Fuentes (`citations`): lo que devolvió search_knowledge en este turno,
 *    con referencias F1, F2… únicas en el turno. Una referencia citada en la
 *    respuesta que no corresponde a ninguna fuente se devuelve en
 *    `unknownRefs` para que el panel lo avise.
 *  - Memoria entre conversaciones: la persistencia vive en conversations.ts;
 *    este módulo sigue recibiendo el historial ya cargado.
 */

export const INMO_MAX_STEPS = 6
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_BYTES = 200_000
const MAX_USER_TEXT = 4000
const MAX_ENTITIES = 20

type ContentBlock = { type: string; [k: string]: any }
export interface InmoMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Referencia estructurada a una entidad ya resuelta (§16) — nunca sólo texto del historial. */
export interface InmoEntityRef {
  type: string
  id: number
  label?: string | null
}

/** De dónde sale cada dato de la respuesta (§13): qué herramienta, sobre qué entidad, con qué resultado. */
export interface InmoProvenance {
  tool: string
  ok: boolean
  target: { type: string; id: number } | null
  errorCode?: string
  results?: number
}

/** Una fuente citable de esta respuesta (search_knowledge). */
export interface InmoCitation {
  ref: string
  sourceType: string
  sourceId: string | number
  title: string
  url: string | null
}

/** El cerebro con el que trabaja el turno, ya resuelto (perfil ∩ ajustes de la agencia ∩ RBAC). */
export interface InmoBrainContext {
  key: string
  label: string
  instructions: string
  tools: readonly string[]
}

export interface InmoPendingAction {
  toolUseId: string
  tool: string
  description: string
  input: Record<string, unknown>
}

export interface InmoTurnInput {
  messages?: unknown
  userMessage?: unknown
  resolve?: { toolUseId?: unknown; approve?: unknown } | null
  entities?: unknown
}

export interface InmoTurnResult {
  ok: true
  messages: InmoMessage[]
  reply: string | null
  pending: InmoPendingAction | null
  provenance: InmoProvenance[]
  entities: InmoEntityRef[]
  citations: InmoCitation[]
  /** Referencias [Fn] de la respuesta que no salen de ninguna fuente de este turno. */
  unknownRefs: string[]
  brain: string | null
}

export class InmoError extends Error {
  constructor(
    public code: 'AI_NOT_CONFIGURED' | 'INVALID_REQUEST' | 'PROVIDER_ERROR',
    message: string,
  ) {
    super(message)
  }
}

export interface InmoDeps {
  /** Envuelto, nunca `fetch` a secas: en workerd, llamarlo como método de otro objeto lanza «Illegal invocation». */
  fetch: typeof fetch
  now?: () => Date
  orgName?: string | null
  /** Moneda de la agencia (utils/currency.ts): la de todos sus importes. Sin ella, no se le dice nada al modelo. */
  currency?: string | null
  /** Sin cerebro: las herramientas del perfil General (∩ RBAC). Nunca create_note ni notify_team: INMO no escribe sin confirmación fuera de su perfil. */
  brain?: InmoBrainContext | null
}

// --- saneado del historial que manda el cliente ----------------------------------

function sanitizeBlocks(content: unknown, role: 'user' | 'assistant'): string | ContentBlock[] | null {
  if (typeof content === 'string') return content.slice(0, MAX_USER_TEXT * 4)
  if (!Array.isArray(content)) return null
  const out: ContentBlock[] = []
  for (const b of content) {
    if (!b || typeof b !== 'object') continue
    if (b.type === 'text' && typeof b.text === 'string') out.push({ type: 'text', text: b.text })
    else if (role === 'assistant' && b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string')
      out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input && typeof b.input === 'object' ? b.input : {} })
    else if (role === 'user' && b.type === 'tool_result' && typeof b.tool_use_id === 'string')
      out.push({ type: 'tool_result', tool_use_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? ''), ...(b.is_error ? { is_error: true } : {}) })
  }
  return out.length ? out : null
}

export function sanitizeHistory(raw: unknown): InmoMessage[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new InmoError('INVALID_REQUEST', 'El historial debe ser una lista de mensajes.')
  if (JSON.stringify(raw).length > MAX_HISTORY_BYTES) throw new InmoError('INVALID_REQUEST', 'La conversación es demasiado larga: empieza una nueva.')
  const out: InmoMessage[] = []
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue
    const content = sanitizeBlocks(m.content, m.role)
    if (content) out.push({ role: m.role, content })
  }
  // La API exige empezar por un turno de usuario que no sea un tool_result huérfano.
  while (out.length && (out[0].role !== 'user' || (Array.isArray(out[0].content) && out[0].content.some((b) => b.type === 'tool_result')))) out.shift()
  return out
}

function sanitizeEntities(raw: unknown): InmoEntityRef[] {
  if (!Array.isArray(raw)) return []
  const out: InmoEntityRef[] = []
  for (const e of raw) {
    const id = Number(e?.id)
    if (!e || typeof e.type !== 'string' || !/^[a-z_:]{1,40}$/.test(e.type) || !Number.isInteger(id) || id <= 0) continue
    out.push({ type: e.type, id, label: typeof e.label === 'string' ? e.label.slice(0, 120) : null })
  }
  return out.slice(-MAX_ENTITIES)
}

function rememberEntity(list: InmoEntityRef[], ref: InmoEntityRef) {
  const i = list.findIndex((e) => e.type === ref.type && e.id === ref.id)
  if (i >= 0) list.splice(i, 1)
  list.push(ref)
  if (list.length > MAX_ENTITIES) list.splice(0, list.length - MAX_ENTITIES)
}

/** Etiqueta legible de la entidad afectada, sacada del DTO compacto — nunca de la fila. */
function labelFor(output: any): string | null {
  if (!output || typeof output !== 'object') return null
  return output.title || output.name || output.reference || null
}

// --- prompt ---------------------------------------------------------------------

export function inmoSystemPrompt(opts: { orgName?: string | null; nowIso: string; entities: InmoEntityRef[]; brain?: InmoBrainContext | null; currency?: string | null }) {
  const ctx = opts.entities.length ? opts.entities.map((e) => `- ${e.type} #${e.id}${e.label ? ` (${e.label})` : ''}`).join('\n') : '- (ninguna todavía)'
  const profile = opts.brain && opts.brain.instructions ? ['', `PERFIL «${opts.brain.label}»: ${opts.brain.instructions}`] : []
  return [
    `Eres INMO, el asistente operativo de ${opts.orgName || 'la agencia'} dentro de su panel inmobiliario. Respondes siempre en español, breve y concreto.`,
    '',
    'DATOS: las propiedades, contactos, leads, necesidades de compra, compatibilidades, citas, tareas y ofertas SÓLO existen si te los devuelve una herramienta en esta conversación. Nunca menciones una propiedad, precio, disponibilidad o porcentaje que no venga de una herramienta. Si una búsqueda no devuelve nada, dilo; no rellenes con ejemplos.',
    '',
    'CRITERIOS: convierte el lenguaje en criterios estructurados de search_properties (una propiedad por su nombre o referencia → text; "menos de 650.000" → priceMax 650000; "mínimo tres habitaciones" → bedroomsMin 3; "Chamberí o Salamanca" → zones; "con terraza" → features ["terrace"]; "parcela de más de 2.000 m²" → plotAreaMin 2000). Lo que el usuario NO dijo no se envía: no pongas un garaje a false porque no lo mencionó. Un refinamiento ("solo con terraza") modifica la búsqueda anterior: vuelve a llamar con los criterios anteriores más el nuevo.',
    '',
    'BUSCAR ≠ GUARDAR: una búsqueda exploratoria no crea nada. Sólo usa update_buyer_requirements si el usuario pide guardar la necesidad de una persona concreta.',
    '',
    'COMPATIBILIDAD: la compatibilidad entre una necesidad y una propiedad la calcula el motor de Matching (find_matches). Nunca calcules ni estimes tú un porcentaje. Para una búsqueda exploratoria sin necesidad guardada, llama a find_matches con criteria (los criterios que el usuario dijo): no guarda nada; después ofrece guardarla como necesidad de una persona con update_buyer_requirements, sin hacerlo hasta que lo pida.',
    '',
    'PERSONAS: para actuar sobre alguien, resuelve antes su id con find_contacts. Si hay varias coincidencias, pregunta cuál es; nunca elijas tú.',
    '',
    'ACCIONES: enviar una propiedad, agendar, mover o cancelar una visita y crear una oferta necesitan que el usuario las confirme: el panel le enseñará un botón. No digas que algo está hecho hasta recibir el resultado de la herramienta. Si el resultado es un error, explícalo con sus palabras.',
    '',
    'CONOCIMIENTO: para procedimientos, políticas, «cómo se hace en el panel» o lo anotado sobre alguien, usa search_knowledge (ayuda del panel, documentos de la agencia, notas y fichas). Cita cada dato con su referencia entre corchetes, p. ej. [F1]; no cites referencias que no te haya devuelto. Si no devuelve fuentes, dilo claramente («no tengo ninguna fuente sobre esto»); si das orientación general, márcala como conocimiento general y sepárala de los datos de la agencia.',
    '',
    'MEMORIA: lo que la agencia sabe de un contacto, lead, propiedad, cita u operación está en sus notas (recall_memory). Si la persona te pide recordar algo o confirma un dato relevante y duradero, propón guardarlo con remember_fact (se le pedirá confirmación). Nunca guardes contraseñas, claves, tokens ni datos de pago.',
    '',
    ...(opts.currency ? [`MONEDA: los importes de la agencia (precios, presupuestos, ofertas sin otra moneda) están en ${opts.currency}. Cítalos en esa moneda y sin convertir; nunca supongas otra.`, ''] : []),
    `Fecha y hora actuales (UTC): ${opts.nowIso}. Las horas de citas y tareas son la hora local de la agencia tal como se ve en su calendario, con el formato «AAAA-MM-DD HH:MM»: «mañana a las 17:00» es el día de mañana a las 17:00, sin convertir de zona.`,
    '',
    'Entidades ya resueltas en esta conversación (úsalas por id en vez de volver a buscarlas):',
    ctx,
    ...profile,
  ].join('\n')
}

// --- llamada al modelo ------------------------------------------------------------

function anthropicBase(env: Record<string, any>): string {
  return loopbackOrigin(env.AI_BASE_URL) ?? 'https://api.anthropic.com'
}

/** Las herramientas que puede usar este turno: las del cerebro, o las del perfil General si no llega ninguno. */
function brainTools(deps: InmoDeps): readonly string[] {
  return deps.brain?.tools ?? getBrainDefinition(DEFAULT_BRAIN)!.tools
}

async function callModel(ctx: ToolContext, deps: InmoDeps, system: string, messages: InmoMessage[]) {
  const allowed = brainTools(deps)
  const offered = toolCatalogFor(ctx.user).filter((t) => allowed.includes(t.name))
  const tools = offered.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
  let res: Response
  try {
    res = await deps.fetch(`${anthropicBase(ctx.env)}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': String(ctx.env.AI_API_KEY), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ctx.env.AI_MODEL || AI_MODEL_DEFAULT,
        max_tokens: 1500,
        system,
        messages,
        tools,
        // Una herramienta por paso: así una escritura que necesita confirmación
        // nunca queda mezclada con otras llamadas ya ejecutadas en el mismo turno.
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      }),
    })
  } catch {
    throw new InmoError('PROVIDER_ERROR', 'No se pudo contactar con el servicio de IA.')
  }
  if (!res.ok) throw new InmoError('PROVIDER_ERROR', `El servicio de IA respondió ${res.status}.`)
  const data: any = await res.json().catch(() => null)
  if (!data || !Array.isArray(data.content)) throw new InmoError('PROVIDER_ERROR', 'Respuesta del servicio de IA no válida.')
  return { content: data.content as ContentBlock[], stopReason: String(data.stop_reason || '') }
}

function textOf(blocks: ContentBlock[]): string | null {
  const t = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
  return t || null
}

function toolResultBlock(toolUseId: string, payload: unknown, isError: boolean): ContentBlock {
  return { type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(payload), ...(isError ? { is_error: true } : {}) }
}

// --- turno ------------------------------------------------------------------------

export async function runInmoTurn(ctx: ToolContext, input: InmoTurnInput, deps: InmoDeps): Promise<InmoTurnResult> {
  if (!ctx.env.AI_API_KEY) throw new InmoError('AI_NOT_CONFIGURED', 'INMO necesita la clave del servicio de IA (AI_API_KEY) configurada en el Worker.')
  const inmoCtx: ToolContext = { ...ctx, source: 'inmo' }
  const messages = sanitizeHistory(input.messages)
  const entities = sanitizeEntities(input.entities)
  const provenance: InmoProvenance[] = []
  const citations: InmoCitation[] = []

  const execute = async (toolUseId: string, name: string, toolInput: unknown, confirmed: boolean) => {
    const r = await executeTool(inmoCtx, name, toolInput, { confirmed, idempotencyKey: `inmo:${toolUseId}`, allowedTools: brainTools(deps) })
    if (r.ok && name === 'search_knowledge') {
      // Referencias únicas en todo el turno (F1…Fn aunque haya varias búsquedas):
      // lo que ve el modelo y lo que enseña el panel son las mismas.
      const out: any = r.output
      if (Array.isArray(out?.results)) {
        out.results = out.results.map((x: any) => {
          const ref = `F${citations.length + 1}`
          citations.push({ ref, sourceType: x.sourceType, sourceId: x.sourceId, title: x.title, url: x.url ?? null })
          return { ...x, ref }
        })
      }
    }
    if (r.ok) {
      const out: any = r.output
      provenance.push({ tool: name, ok: true, target: r.target, ...(Array.isArray(out?.results) ? { results: out.results.length } : {}) })
      if (r.target) rememberEntity(entities, { type: r.target.type, id: r.target.id, label: labelFor(out) })
    } else if (r.error.code !== 'CONFIRMATION_REQUIRED') {
      provenance.push({ tool: name, ok: false, target: null, errorCode: r.error.code })
    }
    return r
  }

  if (input.resolve) {
    // Respuesta a una confirmación pendiente: tiene que ser la herramienta que
    // pidió el modelo en el último mensaje, no una cualquiera.
    const toolUseId = String(input.resolve.toolUseId || '')
    const last = messages[messages.length - 1]
    const block = last?.role === 'assistant' && Array.isArray(last.content) ? last.content.find((b) => b.type === 'tool_use' && b.id === toolUseId) : undefined
    if (!block) throw new InmoError('INVALID_REQUEST', 'No hay ninguna acción pendiente de confirmar con ese id.')
    if (input.resolve.approve === true) {
      const r = await execute(block.id, block.name, block.input, true)
      messages.push({ role: 'user', content: [toolResultBlock(block.id, r.ok ? r.output : { error: r.error }, !r.ok)] })
    } else {
      messages.push({ role: 'user', content: [toolResultBlock(block.id, { error: { code: 'CANCELLED_BY_USER', message: 'El usuario NO ha confirmado la acción: no se ha ejecutado nada.' } }, true)] })
    }
  } else {
    const text = typeof input.userMessage === 'string' ? input.userMessage.trim().slice(0, MAX_USER_TEXT) : ''
    if (!text) throw new InmoError('INVALID_REQUEST', 'Escribe una pregunta.')
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) {
      throw new InmoError('INVALID_REQUEST', 'Hay una acción pendiente de confirmar: confírmala o cancélala antes de seguir.')
    }
    messages.push({ role: 'user', content: text })
  }

  const system = inmoSystemPrompt({ orgName: deps.orgName, nowIso: (deps.now?.() ?? new Date()).toISOString().slice(0, 16).replace('T', ' '), entities, brain: deps.brain, currency: deps.currency })
  let reply: string | null = null
  let pending: InmoPendingAction | null = null

  for (let step = 0; step < INMO_MAX_STEPS; step++) {
    const { content, stopReason } = await callModel(inmoCtx, deps, system, messages)
    messages.push({ role: 'assistant', content })
    const toolUse = content.find((b) => b.type === 'tool_use')
    if (!toolUse || stopReason !== 'tool_use') {
      reply = textOf(content)
      break
    }
    const tool = getTool(toolUse.name)
    if (tool?.requiresConfirmation) {
      // Se valida YA (un input mal formado no llega a pedir confirmación), pero no se ejecuta.
      const r = await execute(toolUse.id, toolUse.name, toolUse.input, false)
      if (!r.ok && r.error.code === 'CONFIRMATION_REQUIRED') {
        pending = { toolUseId: toolUse.id, tool: toolUse.name, description: tool.description, input: (r.error.details?.input as Record<string, unknown>) ?? toolUse.input }
        reply = textOf(content)
        break
      }
      messages.push({ role: 'user', content: [toolResultBlock(toolUse.id, r.ok ? r.output : { error: r.error }, !r.ok)] })
      continue
    }
    const r = await execute(toolUse.id, toolUse.name, toolUse.input, false)
    messages.push({ role: 'user', content: [toolResultBlock(toolUse.id, r.ok ? r.output : { error: r.error }, !r.ok)] })
    if (step === INMO_MAX_STEPS - 1) reply = 'He llegado al límite de pasos de esta respuesta. Concreta un poco más la petición y sigo.'
  }

  const known = new Set(citations.map((c) => c.ref))
  const unknownRefs = [...new Set([...(reply ?? '').matchAll(/\[(F\d+)\]/g)].map((m) => m[1]))].filter((ref) => !known.has(ref))
  return { ok: true, messages, reply, pending, provenance, entities, citations, unknownRefs, brain: deps.brain?.key ?? null }
}
