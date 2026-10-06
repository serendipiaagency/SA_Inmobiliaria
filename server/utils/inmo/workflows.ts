import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { executeTool, getTool } from '../tools/execute'
import type { ToolContext } from '../tools/types'

/**
 * Workflows guiados de INMO (bloque N8b): secuencias de pasos sobre una
 * entidad real («lead nuevo → cualificar → buscar compatibles → proponer
 * visita»). Cada paso es UNA llamada a una Domain Tool — el mismo motor que
 * usan INMO, la API y las automatizaciones (executeTool: RBAC del usuario,
 * organización de la sesión, validación, traza) — y NINGUNO se ejecuta sin
 * que la persona pulse «Ejecutar paso» (o lo salte). El estado vive en
 * `workflow_runs` (kind = inmo_workflow), de ese usuario en esa agencia.
 *
 * Un paso que no se puede preparar con datos reales no se inventa: queda
 * «bloqueado» con el motivo (p. ej. el contacto no tiene necesidad guardada)
 * y la persona decide si lo resuelve en el panel y reintenta, o lo salta.
 */

type State = Record<string, any>
type Params = Record<string, unknown>

export interface WorkflowParamDef {
  key: string
  label: string
  type: 'datetime' | 'match' | 'text'
  required?: boolean
}

interface Preparation {
  input?: Record<string, unknown>
  blocked?: string
  /** Falta un dato que pone la persona (no es un bloqueo: se rellena y se ejecuta). */
  missing?: string[]
  options?: { matches?: { value: string; label: string }[] }
}

interface StepDef {
  key: string
  label: string
  tool: string
  params?: WorkflowParamDef[]
  prepare: (ctx: ToolContext, state: State, params: Params) => Promise<Preparation>
  absorb?: (state: State, output: any) => void
}

interface WorkflowDef {
  key: string
  label: string
  description: string
  entity: 'lead' | 'offer' | 'appointment'
  start: (ctx: ToolContext, entityId: number) => Promise<State>
  steps: StepDef[]
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/
const dt = (v: unknown) => (typeof v === 'string' && DATETIME_RE.test(v.trim()) ? v.trim().replace('T', ' ').slice(0, 16) : null)

async function loadLead(ctx: ToolContext, leadId: number) {
  const [lead] = await ctx.db
    .select({ id: schema.leads.id, name: schema.leads.name, contactId: schema.leads.contactId, agentId: schema.leads.agentId, stage: schema.leads.stage })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, ctx.orgId)))
    .limit(1)
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
  return lead
}

export const INMO_WORKFLOWS: readonly WorkflowDef[] = [
  {
    key: 'lead_nuevo',
    label: 'Lead nuevo → cualificar → compatibles → proponer visita',
    description: 'Pasa el lead a «Cualificado», busca propiedades compatibles con la necesidad de su contacto (motor de Matching) y agenda una visita a la que elijas.',
    entity: 'lead',
    async start(ctx, leadId) {
      const lead = await loadLead(ctx, leadId)
      return { leadId: lead.id, leadName: lead.name, contactId: lead.contactId, commercialId: lead.agentId }
    },
    steps: [
      {
        key: 'cualificar',
        label: 'Cualificar el lead',
        tool: 'update_lead',
        async prepare(_ctx, s) {
          return { input: { leadId: s.leadId, stage: 'qualified', reason: 'Workflow de INMO: lead nuevo' } }
        },
      },
      {
        key: 'compatibles',
        label: 'Buscar propiedades compatibles',
        tool: 'find_matches',
        async prepare(ctx, s) {
          if (!s.contactId) return { blocked: 'El lead no está enlazado a un contacto: no hay necesidad de compra que comparar.' }
          const R = schema.buyerRequirements
          const [req] = await ctx.db
            .select({ id: R.id })
            .from(R)
            .where(and(eq(R.organizationId, ctx.orgId), eq(R.contactId, s.contactId), eq(R.status, 'active'), isNull(R.deletedAt)))
            .orderBy(desc(R.id))
            .limit(1)
          if (!req) return { blocked: 'El contacto no tiene ninguna necesidad de compra activa: créala en su ficha (pestaña Necesidades) o pídesela a INMO, y vuelve a intentarlo.' }
          return { input: { buyerRequirementId: req.id, limit: 5 } }
        },
        absorb(s, out) {
          s.buyerRequirementId = out?.buyerRequirementId ?? s.buyerRequirementId
          s.matches = (Array.isArray(out?.results) ? out.results : [])
            .filter((m: any) => m.eligibility !== 'ineligible')
            .slice(0, 5)
            .map((m: any) => ({ id: m.property.id, kind: m.property.kind, title: m.property.title, score: m.score }))
        },
      },
      {
        key: 'visita',
        label: 'Proponer una visita',
        tool: 'book_viewing',
        params: [
          { key: 'match', label: 'Propiedad', type: 'match', required: true },
          { key: 'scheduledAt', label: 'Fecha y hora (hora local de la agencia)', type: 'datetime', required: true },
        ],
        async prepare(_ctx, s, p) {
          if (!s.commercialId) return { blocked: 'El lead no tiene comercial asignado: asígnalo antes de agendar.' }
          const matches: any[] = Array.isArray(s.matches) ? s.matches : []
          if (!matches.length) return { blocked: 'No hay propiedades compatibles que proponer (el paso anterior no devolvió ninguna o se saltó).' }
          const options = { matches: matches.map((m) => ({ value: `${m.kind}:${m.id}`, label: `${m.title} · ${m.score}%` })) }
          const chosen = typeof p.match === 'string' ? matches.find((m) => `${m.kind}:${m.id}` === p.match) : matches[0]
          const scheduledAt = dt(p.scheduledAt)
          const missing = [...(chosen ? [] : ['match']), ...(scheduledAt ? [] : ['scheduledAt'])]
          if (missing.length) return { missing, options }
          return { input: { leadId: s.leadId, commercialId: s.commercialId, propertyId: chosen.id, propertyKind: chosen.kind, scheduledAt }, options }
        },
      },
    ],
  },
  {
    key: 'oferta_aceptada',
    label: 'Oferta aceptada → negociación → tarea de documentación',
    description: 'Con una oferta ya aceptada, mueve su lead a «Negociación» y crea la tarea para preparar la documentación de la operación.',
    entity: 'offer',
    async start(ctx, offerId) {
      const O = schema.offers
      const [offer] = await ctx.db
        .select({ id: O.id, status: O.status, leadId: O.leadId, buyerContactId: O.buyerContactId, commercialId: O.commercialId, propertyId: O.propertyId, propertyKind: O.propertyKind })
        .from(O)
        .where(and(eq(O.id, offerId), eq(O.organizationId, ctx.orgId)))
        .limit(1)
      if (!offer) throw createError({ statusCode: 404, statusMessage: 'Oferta no encontrada' })
      if (offer.status !== 'accepted') throw createError({ statusCode: 422, statusMessage: 'La oferta no está aceptada: este workflow empieza con una oferta aceptada.' })
      return { offerId: offer.id, leadId: offer.leadId, contactId: offer.buyerContactId, commercialId: offer.commercialId }
    },
    steps: [
      {
        key: 'negociacion',
        label: 'Mover el lead a «Negociación»',
        tool: 'update_lead',
        async prepare(_ctx, s) {
          if (!s.leadId) return { blocked: 'La oferta no está ligada a ningún lead.' }
          return { input: { leadId: s.leadId, stage: 'negotiation', reason: `Workflow de INMO: oferta #${s.offerId} aceptada` } }
        },
      },
      {
        key: 'documentacion',
        label: 'Tarea: preparar la documentación',
        tool: 'create_task',
        params: [{ key: 'dueAt', label: 'Vence (opcional)', type: 'datetime' }],
        async prepare(_ctx, s, p) {
          return {
            input: {
              title: `Preparar la documentación de la operación (oferta #${s.offerId})`,
              type: 'document',
              ...(s.leadId ? { leadId: s.leadId } : {}),
              ...(s.contactId ? { contactId: s.contactId } : {}),
              ...(s.commercialId ? { assigneeId: s.commercialId } : {}),
              ...(dt(p.dueAt) ? { dueAt: dt(p.dueAt) } : {}),
            },
          }
        },
      },
    ],
  },
  {
    key: 'visita_realizada',
    label: 'Visita realizada → seguimiento → anotar lo aprendido',
    description: 'Tras una visita, crea la llamada de seguimiento y guarda como nota (memoria de la agencia) lo que hayas aprendido del cliente.',
    entity: 'appointment',
    async start(ctx, visitId) {
      const V = schema.visits
      const [v] = await ctx.db
        .select({ id: V.id, leadId: V.leadId, contactId: V.contactId, agentId: V.agentId, status: V.status })
        .from(V)
        .where(and(eq(V.id, visitId), eq(V.organizationId, ctx.orgId), isNull(V.deletedAt)))
        .limit(1)
      if (!v) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })
      let contactId = v.contactId
      if (!contactId && v.leadId) contactId = (await loadLead(ctx, v.leadId)).contactId
      return { visitId: v.id, leadId: v.leadId, contactId, commercialId: v.agentId }
    },
    steps: [
      {
        key: 'seguimiento',
        label: 'Tarea: llamar para el seguimiento',
        tool: 'create_task',
        params: [{ key: 'dueAt', label: 'Cuándo llamar', type: 'datetime', required: true }],
        async prepare(_ctx, s, p) {
          if (!s.leadId && !s.contactId) return { blocked: 'La cita no tiene lead ni contacto a quien llamar.' }
          const dueAt = dt(p.dueAt)
          if (!dueAt) return { missing: ['dueAt'] }
          return {
            input: {
              title: `Llamar tras la visita (cita #${s.visitId})`,
              type: 'follow_up',
              dueAt,
              ...(s.leadId ? { leadId: s.leadId } : {}),
              ...(s.contactId ? { contactId: s.contactId } : {}),
              ...(s.commercialId ? { assigneeId: s.commercialId } : {}),
            },
          }
        },
      },
      {
        key: 'anotar',
        label: 'Anotar lo aprendido (memoria)',
        tool: 'remember_fact',
        params: [{ key: 'fact', label: 'Qué hay que recordar', type: 'text', required: true }],
        async prepare(_ctx, s, p) {
          const target = s.contactId ? { entityType: 'contact', entityId: s.contactId } : s.leadId ? { entityType: 'lead', entityId: s.leadId } : null
          if (!target) return { blocked: 'La cita no tiene lead ni contacto en el que anotarlo.' }
          const fact = typeof p.fact === 'string' ? p.fact.trim() : ''
          if (!fact) return { missing: ['fact'] }
          return { input: { ...target, fact } }
        },
      },
    ],
  },
]

export function workflowCatalog() {
  return INMO_WORKFLOWS.map((w) => ({
    key: w.key,
    label: w.label,
    description: w.description,
    entity: w.entity,
    steps: w.steps.map((s) => ({ key: s.key, label: s.label, tool: s.tool, requiresConfirmation: true })),
  }))
}

function getWorkflow(key: string): WorkflowDef {
  const w = INMO_WORKFLOWS.find((x) => x.key === key)
  if (!w) throw createError({ statusCode: 422, statusMessage: `No existe el workflow «${key}».` })
  return w
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return (JSON.parse(String(raw ?? '')) ?? fallback) as T
  } catch {
    return fallback
  }
}

interface StepLog {
  key: string
  tool: string
  status: 'ok' | 'error' | 'skipped'
  at: string
  target?: { type: string; id: number } | null
  errorCode?: string
  message?: string
}

async function loadRun(ctx: ToolContext, runId: number) {
  const W = schema.workflowRuns
  const [run] = await ctx.db
    .select()
    .from(W)
    .where(and(eq(W.id, runId), eq(W.organizationId, ctx.orgId), eq(W.kind, 'inmo_workflow'), eq(W.executedAs, ctx.user.id)))
    .limit(1)
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Workflow no encontrado' })
  return run
}

/** Lo que ve el panel: pasos, estado y la propuesta del paso actual (sin ejecutar nada). */
async function viewOf(ctx: ToolContext, run: any, params: Params = {}) {
  const wf = getWorkflow(run.workflowKey)
  const state = parseJson<State>(run.stateJson, {})
  const log = parseJson<StepLog[]>(run.stepsJson, [])
  let proposal: any = null
  if (run.status === 'waiting' && run.currentStep < wf.steps.length) {
    const step = wf.steps[run.currentStep]
    const prep = await step.prepare(ctx, state, params)
    proposal = {
      step: run.currentStep,
      key: step.key,
      label: step.label,
      tool: step.tool,
      toolDescription: getTool(step.tool)?.description ?? null,
      input: prep.input ?? null,
      blocked: prep.blocked ?? null,
      missing: prep.missing ?? [],
      params: step.params ?? [],
      options: prep.options ?? {},
    }
  }
  return {
    id: run.id,
    workflow: { key: wf.key, label: wf.label, entity: wf.entity },
    entity: { type: run.entityType, id: run.entityId },
    status: run.status,
    currentStep: run.currentStep,
    steps: wf.steps.map((s, i) => {
      const done = [...log].reverse().find((l) => l.key === s.key && l.status !== 'error')
      const lastError = [...log].reverse().find((l) => l.key === s.key && l.status === 'error')
      return { key: s.key, label: s.label, tool: s.tool, state: done ? done.status : i === run.currentStep && run.status === 'waiting' ? 'current' : 'pending', result: done ?? null, lastError: !done ? (lastError ?? null) : null }
    }),
    proposal,
    message: run.message,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export async function startWorkflow(ctx: ToolContext, workflowKey: unknown, entityId: unknown) {
  const wf = getWorkflow(String(workflowKey || ''))
  const id = Number(entityId)
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Indica el id de la entidad con la que empieza el workflow' })
  const state = await wf.start(ctx, id)
  const ts = now()
  const [run] = await ctx.db
    .insert(schema.workflowRuns)
    .values({
      organizationId: ctx.orgId,
      kind: 'inmo_workflow',
      workflowKey: wf.key,
      trigger: 'manual',
      entityType: wf.entity,
      entityId: id,
      executedAs: ctx.user.id,
      status: 'waiting',
      currentStep: 0,
      stateJson: JSON.stringify(state),
      stepsJson: '[]',
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return viewOf(ctx, run)
}

export async function getWorkflowRun(ctx: ToolContext, runId: number, params: Params = {}) {
  return viewOf(ctx, await loadRun(ctx, runId), params)
}

export async function listWorkflowRuns(ctx: ToolContext) {
  const W = schema.workflowRuns
  const rows = await ctx.db
    .select({ id: W.id, workflowKey: W.workflowKey, entityType: W.entityType, entityId: W.entityId, status: W.status, currentStep: W.currentStep, createdAt: W.createdAt, updatedAt: W.updatedAt })
    .from(W)
    .where(and(eq(W.organizationId, ctx.orgId), eq(W.kind, 'inmo_workflow'), eq(W.executedAs, ctx.user.id), inArray(W.status, ['waiting', 'running', 'ok', 'cancelled'])))
    .orderBy(desc(W.id))
    .limit(20)
  return rows.map((r: any) => ({ ...r, label: INMO_WORKFLOWS.find((w) => w.key === r.workflowKey)?.label ?? r.workflowKey, totalSteps: INMO_WORKFLOWS.find((w) => w.key === r.workflowKey)?.steps.length ?? 0 }))
}

/**
 * Avanza el workflow: `execute` (la confirmación de la persona: ejecuta el
 * paso actual con la herramienta), `skip` (lo salta sin ejecutar nada) o
 * `cancel`. `step` es el paso que la persona tenía delante: si ya no es el
 * actual (doble clic, otra pestaña), 409 y no se ejecuta nada.
 */
export async function advanceWorkflow(ctx: ToolContext, runId: number, body: { action?: unknown; step?: unknown; params?: unknown }) {
  const run = await loadRun(ctx, runId)
  const wf = getWorkflow(run.workflowKey)
  const action = String(body.action || '')
  if (!['execute', 'skip', 'cancel'].includes(action)) throw createError({ statusCode: 422, statusMessage: 'Acción no válida (execute, skip o cancel)' })
  if (run.status !== 'waiting') throw createError({ statusCode: 409, statusMessage: 'Este workflow ya no está esperando un paso.' })
  if (Number(body.step) !== run.currentStep) throw createError({ statusCode: 409, statusMessage: 'Ese paso ya no es el actual: recarga el workflow.' })

  const W = schema.workflowRuns
  const ts = now()
  // Reclamar el paso de forma atómica: dos clics no lo ejecutan dos veces.
  const claimed = await ctx.db
    .update(W)
    .set({ status: 'running', updatedAt: ts })
    .where(and(eq(W.id, run.id), eq(W.organizationId, ctx.orgId), eq(W.status, 'waiting'), eq(W.currentStep, run.currentStep)))
    .returning({ id: W.id })
  if (!claimed.length) throw createError({ statusCode: 409, statusMessage: 'Este paso ya se está ejecutando.' })

  const state = parseJson<State>(run.stateJson, {})
  const log = parseJson<StepLog[]>(run.stepsJson, [])
  const step = wf.steps[run.currentStep]
  const params = body.params && typeof body.params === 'object' && !Array.isArray(body.params) ? (body.params as Params) : {}
  let next = run.currentStep
  let status: string = 'waiting'
  let message: string | null = null

  if (action === 'cancel') {
    status = 'cancelled'
    message = 'Cancelado por la persona.'
  } else if (action === 'skip') {
    log.push({ key: step.key, tool: step.tool, status: 'skipped', at: ts })
    next = run.currentStep + 1
  } else {
    let prep: Preparation
    try {
      prep = await step.prepare(ctx, state, params)
    } catch (e) {
      await ctx.db.update(W).set({ status: 'waiting', updatedAt: ts }).where(eq(W.id, run.id))
      throw e
    }
    if (prep.blocked || prep.missing?.length || !prep.input) {
      await ctx.db.update(W).set({ status: 'waiting', updatedAt: ts }).where(eq(W.id, run.id))
      throw createError({ statusCode: 422, statusMessage: prep.blocked || 'Faltan datos para este paso.', data: { missing: prep.missing ?? [] } })
    }
    // executeTool nunca lanza: devuelve el error tipado, que queda en el registro del paso.
    const r = await executeTool({ ...ctx, source: 'inmo' }, step.tool, prep.input, { confirmed: true, idempotencyKey: `wf:${run.id}:${run.currentStep}` })
    if (r.ok) {
      step.absorb?.(state, r.output)
      log.push({ key: step.key, tool: step.tool, status: 'ok', at: ts, target: r.target })
      next = run.currentStep + 1
    } else {
      log.push({ key: step.key, tool: step.tool, status: 'error', at: ts, errorCode: r.error.code, message: r.error.message })
      message = r.error.message
    }
  }
  if (status !== 'cancelled' && next >= wf.steps.length) {
    status = 'ok'
    message = 'Workflow completado.'
  }
  await ctx.db
    .update(W)
    .set({ status, currentStep: next, stateJson: JSON.stringify(state), stepsJson: JSON.stringify(log), message, updatedAt: ts, ...(status === 'ok' || status === 'cancelled' ? { finishedAt: ts } : {}) })
    .where(eq(W.id, run.id))
  return getWorkflowRun(ctx, run.id)
}
