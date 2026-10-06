import * as schema from '../../db/schema'
import { now } from '../db'
import { KNOWLEDGE_SOURCES, searchKnowledge, type KnowledgeSource } from '../knowledge/search'
import { createEntityNote, listEntityNotes, MEMORY_MAX_FACT, secretKindIn, type EntityRef } from '../inmo/memory'
import { NOTE_ENTITY_TYPES } from '../../../utils/crmCatalog'
import { ToolError, type DomainTool, type ToolJsonSchema } from './types'

/**
 * Herramientas de INMO Intelligence (bloque N8b), con el mismo contrato y el
 * mismo ejecutor que las de dominio (execute.ts): RBAC, validación,
 * confirmación, idempotencia y traza.
 *
 *   search_knowledge  RAG léxico con fuentes citables (ayuda, documentos, notas, fichas)
 *   recall_memory     lo que la agencia tiene anotado sobre una entidad
 *   remember_fact     anotar un hecho confirmado por la persona (nota con origen «inmo»)
 *   create_note       nota sin confirmación (automatizaciones y API; ningún cerebro de INMO la usa)
 *   notify_team       aviso interno en la campana del panel (nunca sale de la agencia)
 */

function fail(message: string): never {
  throw new ToolError('VALIDATION_ERROR', message)
}
const schemaOf = (properties: Record<string, any>, required: string[] = []): ToolJsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

function str(o: Record<string, unknown>, k: string, opts: { required?: boolean; max: number }): string | undefined {
  const raw = o[k]
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) fail(`Falta «${k}».`)
    return undefined
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') fail(`«${k}» debe ser texto.`)
  const s = String(raw).trim()
  if (opts.required && !s) fail(`Falta «${k}».`)
  if (s.length > opts.max) fail(`«${k}» admite como máximo ${opts.max} caracteres.`)
  return s || undefined
}
function posInt(o: Record<string, unknown>, k: string, required = false): number | undefined {
  const raw = o[k]
  if (raw === undefined || raw === null || raw === '') {
    if (required) fail(`Falta «${k}».`)
    return undefined
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) fail(`«${k}» debe ser un entero positivo.`)
  return n
}

const ENTITY_SCHEMA = {
  entityType: { type: 'string', enum: [...NOTE_ENTITY_TYPES], description: 'contact, lead, property, appointment (cita) o deal (operación).' },
  entityId: { type: 'integer' },
  propertyKind: { type: 'string', enum: ['agent', 'developer'], description: 'Sólo si entityType es property: «agent» = 2ª mano, «developer» = web.' },
}

function parseEntity(o: Record<string, unknown>): EntityRef {
  const entityType = str(o, 'entityType', { required: true, max: 20 }) as EntityRef['entityType']
  if (!(NOTE_ENTITY_TYPES as readonly string[]).includes(entityType)) fail(`«entityType» debe ser uno de: ${NOTE_ENTITY_TYPES.join(', ')}.`)
  const entityId = posInt(o, 'entityId', true)!
  const kind = str(o, 'propertyKind', { max: 20 })
  if (entityType === 'property' && kind !== 'agent' && kind !== 'developer') fail('Una propiedad necesita «propertyKind» (agent o developer).')
  return { entityType, entityId, propertyKind: entityType === 'property' ? (kind as 'agent' | 'developer') : null }
}

/** Tipo de entidad en la traza y en el contexto de INMO (el mismo vocabulario que las herramientas de dominio). */
function targetOf(ref: EntityRef): { type: string; id: number } {
  if (ref.entityType === 'property') return { type: ref.propertyKind === 'developer' ? 'developer_property' : 'agent_property', id: ref.entityId }
  return { type: ref.entityType, id: ref.entityId }
}

function factText(o: Record<string, unknown>, key: string): string {
  const text = str(o, key, { required: true, max: MEMORY_MAX_FACT })!
  const secret = secretKindIn(text)
  if (secret) fail(`No se guarda ${secret}: INMO nunca memoriza contraseñas, claves, tokens ni datos de pago. Quítalo y vuelve a intentarlo.`)
  return text
}

/** Errores h3 del servicio de notas (404/422) → error tipado. */
function rethrow(e: any): never {
  const status = Number(e?.statusCode ?? e?.status)
  if (status === 404) throw new ToolError('NOT_FOUND', String(e?.statusMessage || 'No encontrado.'))
  if (status === 422 || status === 400) throw new ToolError('VALIDATION_ERROR', String(e?.statusMessage || 'Datos no válidos.'))
  throw e
}

const searchKnowledgeTool: DomainTool = {
  name: 'search_knowledge',
  description:
    'Busca en el conocimiento de la agencia y devuelve FUENTES citables (F1, F2…): la ayuda del panel, los documentos de su base de conocimiento, las notas de contactos/leads/propiedades/citas/operaciones y las descripciones de las fichas. Úsala para procedimientos, políticas, «cómo se hace» y lo anotado sobre alguien. Cita cada dato con su referencia [F1]; si no devuelve nada, di que no hay fuente.',
  kind: 'read',
  // La ayuda es para cualquier admin; cada fuente con datos de la agencia
  // exige además su propia área (knowledgeSourcesFor), así que el área de la
  // herramienta es la mínima común.
  area: 'general',
  action: 'read',
  inputSchema: schemaOf(
    {
      query: { type: 'string', description: 'La pregunta o los términos a buscar.' },
      sources: { type: 'array', items: { type: 'string', enum: [...KNOWLEDGE_SOURCES] }, description: 'Por defecto todas: help, knowledge, notes, properties.' },
      limit: { type: 'integer', minimum: 1, maximum: 8 },
    },
    ['query'],
  ),
  parse: (o) => {
    const query = str(o, 'query', { required: true, max: 300 })!
    let sources: KnowledgeSource[] | undefined
    if (o.sources !== undefined && o.sources !== null) {
      if (!Array.isArray(o.sources)) fail('«sources» debe ser una lista.')
      const list = (o.sources as unknown[]).map(String)
      for (const s of list) if (!(KNOWLEDGE_SOURCES as readonly string[]).includes(s)) fail(`«sources»: «${s}» no es válida (${KNOWLEDGE_SOURCES.join(', ')}).`)
      sources = list as KnowledgeSource[]
    }
    const limit = o.limit === undefined ? undefined : posInt(o, 'limit')
    if (limit !== undefined && limit > 8) fail('«limit» debe ser ≤ 8.')
    return { query, sources, limit }
  },
  async run(ctx, input) {
    return { output: await searchKnowledge(ctx.db, ctx.orgId, ctx.user, input) }
  },
}

const recallMemory: DomainTool = {
  name: 'recall_memory',
  description:
    'Lo que la agencia tiene anotado sobre un contacto, lead, propiedad, cita u operación concretos (notas del panel y hechos que una persona confirmó en INMO), más recientes primero. Consúltala antes de actuar sobre alguien ya resuelto. Lo que no esté aquí, no lo sabes.',
  kind: 'read',
  area: 'crm',
  action: 'read',
  inputSchema: schemaOf(ENTITY_SCHEMA, ['entityType', 'entityId']),
  parse: (o) => parseEntity(o),
  async run(ctx, input: EntityRef) {
    let facts: Awaited<ReturnType<typeof listEntityNotes>>
    try {
      facts = await listEntityNotes(ctx.db, ctx.orgId, input)
    } catch (e) {
      rethrow(e)
    }
    return { output: { entityType: input.entityType, entityId: input.entityId, total: facts.length, facts }, target: targetOf(input) }
  },
}

const rememberFact: DomainTool = {
  name: 'remember_fact',
  description:
    'Anota un hecho relevante y duradero sobre un contacto, lead, propiedad, cita u operación («prefiere que le llamen por la tarde», «el propietario acepta mascotas»). Queda como nota de la ficha, visible y borrable en el panel. Sólo cuando la persona lo pida o lo confirme; nunca contraseñas, claves ni datos de pago.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  // «Hechos que el usuario confirma»: nunca se escribe sin el botón «Confirmar».
  requiresConfirmation: true,
  idempotent: true,
  inputSchema: schemaOf({ ...ENTITY_SCHEMA, fact: { type: 'string', description: 'El hecho, en una o dos frases.' } }, ['entityType', 'entityId', 'fact']),
  parse: (o) => ({ ...parseEntity(o), fact: factText(o, 'fact') }),
  async run(ctx, input: EntityRef & { fact: string }) {
    let note: any
    try {
      note = await createEntityNote(ctx.db, ctx.orgId, { ...input, body: input.fact }, { createdBy: ctx.user.id, source: 'inmo' })
    } catch (e) {
      rethrow(e)
    }
    return { output: { noteId: note.id, entityType: input.entityType, entityId: input.entityId, fact: note.body }, target: { type: 'note', id: note.id } }
  },
}

const createNoteTool: DomainTool = {
  name: 'create_note',
  description: 'Crea una nota en la ficha de un contacto, lead, propiedad, cita u operación de la agencia.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf({ ...ENTITY_SCHEMA, body: { type: 'string' } }, ['entityType', 'entityId', 'body']),
  parse: (o) => ({ ...parseEntity(o), body: factText(o, 'body') }),
  async run(ctx, input: EntityRef & { body: string }) {
    let note: any
    try {
      note = await createEntityNote(ctx.db, ctx.orgId, input, { createdBy: ctx.user.id, source: ctx.source === 'automation' ? 'automation' : null })
    } catch (e) {
      rethrow(e)
    }
    return { output: { noteId: note.id, entityType: input.entityType, entityId: input.entityId }, target: { type: 'note', id: note.id } }
  },
}

const notifyTeam: DomainTool = {
  name: 'notify_team',
  description: 'Aviso interno para el equipo de la agencia: aparece en la campana de notificaciones del panel. Nunca se envía a clientes ni sale de la agencia.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf({ message: { type: 'string', description: 'Máximo 300 caracteres.' } }, ['message']),
  parse: (o) => ({ message: str(o, 'message', { required: true, max: 300 })! }),
  async run(ctx, input: { message: string }) {
    // La campana del panel (components/AdminNotificationBell.vue) lee esta
    // tabla: es el único canal interno que existe. Tipo propio para distinguirlo.
    const [row] = await ctx.db
      .insert(schema.publicationNotifications)
      .values({ organizationId: ctx.orgId, userId: null, type: 'automation', channel: 'internal', delivered: 1, message: input.message, createdAt: now() })
      .returning({ id: schema.publicationNotifications.id })
    return { output: { notificationId: row.id, message: input.message }, target: { type: 'notification', id: row.id } }
  },
}

export const INTELLIGENCE_TOOLS: DomainTool[] = [searchKnowledgeTool, recallMemory, rememberFact, createNoteTool, notifyTeam]
