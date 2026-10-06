import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import type { ToolContext } from '../tools/types'
import { getTool } from '../tools/execute'
import { brainToolsFor, resolveBrain } from './brains'
import { secretKindIn } from './memory'
import { runInmoTurn, type InmoCitation, type InmoDeps, type InmoEntityRef, type InmoMessage, type InmoPendingAction, type InmoProvenance, type InmoTurnResult } from './orchestrator'

/**
 * Conversaciones persistentes de INMO (bloque N8b, memoria entre
 * conversaciones). Cada conversación es de UN usuario dentro de SU agencia:
 * se lee, reanuda y borra sólo con esa misma sesión (otra persona u otra
 * agencia → 404). El historial lo guarda el servidor: con `conversationId`
 * se ignora el que mande el cliente.
 *
 * Nada de secretos: un mensaje del usuario que parezca una contraseña, una
 * clave, un token o un dato de pago se guarda sustituido por un aviso.
 */

const MAX_TURNS = 200
const LIST_LIMIT = 50

export interface InmoTurnView {
  role: 'user' | 'assistant'
  text?: string | null
  error?: string | null
  provenance?: InmoProvenance[]
  citations?: InmoCitation[]
  unknownRefs?: string[]
  at: string
}

interface StoredState {
  entities?: InmoEntityRef[]
  pending?: InmoPendingAction | null
}

function parse<T>(raw: unknown, fallback: T): T {
  try {
    const v = JSON.parse(String(raw ?? ''))
    return (v ?? fallback) as T
  } catch {
    return fallback
  }
}

function redact(text: string): string {
  const what = secretKindIn(text)
  return what ? `[Mensaje omitido: parecía contener ${what}. INMO no guarda secretos.]` : text
}

/** El historial que se guarda: los textos del usuario, sin secretos. */
function redactMessages(messages: InmoMessage[]): InmoMessage[] {
  return messages.map((m) => {
    if (m.role !== 'user') return m
    if (typeof m.content === 'string') return { ...m, content: redact(m.content) }
    return { ...m, content: m.content.map((b) => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: redact(b.text) } : b)) }
  })
}

async function loadOwn(db: any, orgId: number, userId: number, id: number) {
  const C = schema.inmoConversations
  const [row] = await db
    .select()
    .from(C)
    .where(and(eq(C.id, id), eq(C.organizationId, orgId), eq(C.userId, userId)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Conversación no encontrada' })
  return row
}

export async function listConversations(db: any, orgId: number, userId: number) {
  const C = schema.inmoConversations
  return db
    .select({ id: C.id, title: C.title, brainKey: C.brainKey, createdAt: C.createdAt, updatedAt: C.updatedAt })
    .from(C)
    .where(and(eq(C.organizationId, orgId), eq(C.userId, userId)))
    .orderBy(desc(C.updatedAt), desc(C.id))
    .limit(LIST_LIMIT)
}

export async function getConversation(db: any, orgId: number, userId: number, id: number) {
  const row = await loadOwn(db, orgId, userId, id)
  const state = parse<StoredState>(row.stateJson, {})
  return {
    id: row.id,
    title: row.title,
    brainKey: row.brainKey,
    turns: parse<InmoTurnView[]>(row.turnsJson, []),
    entities: state.entities ?? [],
    pending: state.pending ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function renameConversation(db: any, orgId: number, userId: number, id: number, title: unknown) {
  await loadOwn(db, orgId, userId, id)
  const t = String(title ?? '').trim().slice(0, 120)
  if (!t) throw createError({ statusCode: 422, statusMessage: 'El título no puede estar vacío' })
  const C = schema.inmoConversations
  await db.update(C).set({ title: t, updatedAt: now() }).where(and(eq(C.id, id), eq(C.organizationId, orgId), eq(C.userId, userId)))
  return { ok: true, id, title: t }
}

/** Borra la conversación de verdad (es historial privado, no un registro del negocio). Las notas que se guardaron desde ella siguen en sus fichas. */
export async function deleteConversation(db: any, orgId: number, userId: number, id: number) {
  await loadOwn(db, orgId, userId, id)
  const C = schema.inmoConversations
  await db.delete(C).where(and(eq(C.id, id), eq(C.organizationId, orgId), eq(C.userId, userId)))
  return { ok: true, id }
}

export interface PersistentTurnInput {
  conversationId?: unknown
  brain?: unknown
  messages?: unknown
  userMessage?: unknown
  resolve?: { toolUseId?: unknown; approve?: unknown } | null
  entities?: unknown
}

export type PersistentTurnResult = InmoTurnResult & { conversationId: number; title: string }

/**
 * Un turno de INMO con memoria: carga la conversación (si llega
 * `conversationId`), resuelve el cerebro, ejecuta el turno y guarda
 * historial, contexto, acción pendiente y la vista de los turnos.
 */
export async function runPersistentInmoTurn(ctx: ToolContext, input: PersistentTurnInput, deps: Omit<InmoDeps, 'brain'>): Promise<PersistentTurnResult> {
  const convId = Number(input.conversationId)
  const existing = Number.isInteger(convId) && convId > 0 ? await loadOwn(ctx.db, ctx.orgId, ctx.user.id, convId) : null
  const state = existing ? parse<StoredState>(existing.stateJson, {}) : {}
  const brainKey = typeof input.brain === 'string' && input.brain ? input.brain : (existing?.brainKey ?? null)
  const brain = await resolveBrain(ctx.db, ctx.orgId, brainKey)

  const result = await runInmoTurn(
    ctx,
    {
      messages: existing ? parse<InmoMessage[]>(existing.messagesJson, []) : input.messages,
      entities: existing ? (state.entities ?? []) : input.entities,
      userMessage: input.userMessage,
      resolve: input.resolve,
    },
    { ...deps, brain: { key: brain.key, label: brain.label, instructions: brain.instructions, tools: brainToolsFor(brain, ctx.user) } },
  )

  const at = now()
  const turns: InmoTurnView[] = existing ? parse<InmoTurnView[]>(existing.turnsJson, []) : []
  if (input.resolve) turns.push({ role: 'user', text: input.resolve.approve === true ? 'Confirmado.' : 'Cancelado.', at })
  else turns.push({ role: 'user', text: redact(String(input.userMessage ?? '').trim()), at })
  if (result.reply || result.provenance.length || !result.pending) {
    turns.push({ role: 'assistant', text: result.reply, provenance: result.provenance, citations: result.citations, unknownRefs: result.unknownRefs, at })
  }
  const pending = result.pending ? { ...result.pending, description: getTool(result.pending.tool)?.description ?? result.pending.description } : null
  const values = {
    brainKey: brain.key,
    messagesJson: JSON.stringify(redactMessages(result.messages)),
    stateJson: JSON.stringify({ entities: result.entities, pending }),
    turnsJson: JSON.stringify(turns.slice(-MAX_TURNS)),
    updatedAt: at,
  }

  const C = schema.inmoConversations
  let id: number
  let title: string
  if (existing) {
    id = existing.id
    title = existing.title
    await ctx.db.update(C).set(values).where(and(eq(C.id, id), eq(C.organizationId, ctx.orgId), eq(C.userId, ctx.user.id)))
  } else {
    const first = turns.find((t) => t.role === 'user')?.text || 'Conversación'
    title = first.length > 80 ? `${first.slice(0, 77)}…` : first
    const [row] = await ctx.db
      .insert(C)
      .values({ organizationId: ctx.orgId, userId: ctx.user.id, title, createdAt: at, ...values })
      .returning({ id: C.id })
    id = row.id
  }
  return { ...result, conversationId: id, title }
}
