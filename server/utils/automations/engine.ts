import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, max, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { executeTool, getTool } from '../tools/execute'
import type { ToolContext } from '../tools/types'
import type { SessionUser } from '../auth'
import { agendaNowWall } from '../appointments/timezone'
import {
  ACTIONS_NEEDING_LEAD,
  AUTOMATION_ACTION_TOOL,
  AUTOMATION_TRIGGER_LABELS,
  CONDITION_FIELDS,
  type AutomationAction,
  type AutomationTrigger,
} from '../../../utils/automationCatalog'
import { LEAD_STAGE_LABELS } from '../../../utils/leadCatalog'
import { DEAL_STAGE_LABELS } from '../../../utils/pipelineCatalog'

/**
 * Motor de automatizaciones (bloque N8b, FASE 34): «cuando pase X, si se
 * cumple Y, haz Z», sobre hechos REALES del dominio y con acciones REALES.
 *
 *   disparador  → lee eventos nuevos de su fuente (Actividad, historial de
 *                 etapas del lead, alertas de SLA o tareas vencidas) a partir
 *                 de su cursor: lo anterior a crearla o activarla no cuenta.
 *   condiciones → todas tienen que cumplirse (Y), sobre datos leídos de la
 *                 organización de la automatización.
 *   acción      → UNA Domain Tool por executeTool(), con la organización de la
 *                 automatización y el usuario que la configuró (su RBAC, en el
 *                 momento de ejecutar): si ya no puede, la ejecución falla con
 *                 PERMISSION_DENIED y queda registrada. Nunca una que necesite
 *                 confirmación humana.
 *   registro    → una fila en `workflow_runs` por evento y automatización
 *                 (índice único: un evento no la dispara dos veces), con el
 *                 resultado o el error tipado; contador y último error en la
 *                 propia automatización.
 *
 * Una automatización desactivada no se carga: no ejecuta nada. Las filas de
 * demostración heredadas (engine = 'legacy') tampoco: el motor sólo lee v1.
 *
 * Lo llama cada minuto server/tasks/automations/run.ts (todas las agencias
 * con alguna activa) y el botón «Procesar ahora» del panel (una sola).
 */

export type Condition = { field: string; op: string; value?: unknown }

export interface TriggerEvent {
  key: string
  /** Id en la tabla de origen (para avanzar el cursor); null en las que no tienen cursor. */
  cursor: number | null
  entityType: string
  entityId: number
  leadId: number | null
  contactId: number | null
  appointmentId?: number | null
  dealId?: number | null
  fromStage?: string | null
  toStage?: string | null
  taskType?: string | null
  taskPriority?: string | null
}

const EVENTS_PER_AUTOMATION = 25
const RUNS_PER_ORG = 100
/** Freno contra bucles (una acción que vuelve a disparar la misma automatización). */
export const MAX_RUNS_PER_ENTITY_PER_DAY = 5

const ACTIVITY_TRIGGERS: Partial<Record<AutomationTrigger, string>> = {
  'lead.created': 'LEAD_CREATED',
  'visit.completed': 'VIEWING_COMPLETED',
  'offer.accepted': 'OFFER_ACCEPTED',
  'deal.stage_changed': 'DEAL_STAGE_CHANGED',
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return (JSON.parse(String(raw ?? '')) ?? fallback) as T
  } catch {
    return fallback
  }
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
}

/** El cursor desde el que empieza una automatización nueva o recién activada: lo que ya existe no la dispara. */
export async function currentCursor(db: any, trigger: string): Promise<number> {
  let table: any = null
  if (ACTIVITY_TRIGGERS[trigger as AutomationTrigger]) table = schema.activities
  else if (trigger === 'lead.stage_changed') table = schema.leadStageHistory
  else if (trigger === 'lead.unattended') table = schema.leadSlaAlerts
  if (!table) return 0
  const [row] = await db.select({ m: max(table.id) }).from(table)
  return Number(row?.m ?? 0)
}

/** Eventos nuevos para esta automatización, siempre de SU organización. */
export async function fetchEvents(db: any, automation: any, limit = EVENTS_PER_AUTOMATION): Promise<TriggerEvent[]> {
  const orgId = automation.organizationId
  const trigger = automation.trigger as AutomationTrigger
  const cursor = Number(automation.cursorId || 0)
  const activityType = ACTIVITY_TRIGGERS[trigger]
  if (activityType) {
    const A = schema.activities
    const rows = await db
      .select()
      .from(A)
      .where(and(eq(A.organizationId, orgId), eq(A.eventType, activityType), gt(A.id, cursor)))
      .orderBy(asc(A.id))
      .limit(limit)
    return rows.map((r: any) => {
      const meta = parseJson<Record<string, any>>(r.metadataJson, {})
      return {
        key: `activity:${r.id}`,
        cursor: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        leadId: r.leadId ?? null,
        contactId: r.contactId ?? null,
        appointmentId: r.appointmentId ?? (r.entityType === 'visit' ? r.entityId : null),
        dealId: r.entityType === 'deal' ? r.entityId : null,
        fromStage: meta.fromStage ?? null,
        toStage: meta.toStage ?? null,
      }
    })
  }
  if (trigger === 'lead.stage_changed') {
    const H = schema.leadStageHistory
    const rows = await db
      .select({ id: H.id, leadId: H.leadId, fromStage: H.fromStage, toStage: H.toStage })
      .from(H)
      .where(and(eq(H.organizationId, orgId), gt(H.id, cursor)))
      .orderBy(asc(H.id))
      .limit(limit)
    return rows.map((r: any) => ({ key: `stage_history:${r.id}`, cursor: r.id, entityType: 'lead', entityId: r.leadId, leadId: r.leadId, contactId: null, fromStage: r.fromStage, toStage: r.toStage }))
  }
  if (trigger === 'lead.unattended') {
    const S = schema.leadSlaAlerts
    const rows = await db
      .select({ id: S.id, leadId: S.leadId })
      .from(S)
      .where(and(eq(S.organizationId, orgId), eq(S.type, 'unattended'), gt(S.id, cursor)))
      .orderBy(asc(S.id))
      .limit(limit)
    return rows.map((r: any) => ({ key: `sla_alert:${r.id}`, cursor: r.id, entityType: 'lead', entityId: r.leadId, leadId: r.leadId, contactId: null }))
  }
  if (trigger === 'task.overdue') {
    // Hora de pared de la agencia: las tareas guardan la hora como se ve en el calendario.
    const nowWall = await agendaNowWall(db, orgId, null)
    const since = automation.activeSince || automation.createdAt || nowWall
    const T = schema.tasks
    const rows = await db
      .select({ id: T.id, leadId: T.leadId, contactId: T.contactId, appointmentId: T.appointmentId, dealId: T.dealId, type: T.type, priority: T.priority })
      .from(T)
      .where(
        and(
          eq(T.organizationId, orgId),
          inArray(T.status, ['open', 'in_progress']),
          isNull(T.deletedAt),
          isNotNull(T.dueAt),
          lt(T.dueAt, nowWall),
          gte(T.dueAt, since),
          sql`not exists (select 1 from workflow_runs r where r.automation_id = ${automation.id} and r.event_key = 'task:' || ${T.id})`,
        ),
      )
      .orderBy(asc(T.dueAt), asc(T.id))
      .limit(limit)
    return rows.map((r: any) => ({ key: `task:${r.id}`, cursor: null, entityType: 'task', entityId: r.id, leadId: r.leadId, contactId: r.contactId, appointmentId: r.appointmentId, dealId: r.dealId, taskType: r.type, taskPriority: r.priority }))
  }
  return []
}

interface EventContext {
  lead: { id: number; name: string; source: string | null; stage: string | null; priority: string | null; agentId: number | null; budget: number | null; contactId: number | null } | null
  contactName: string | null
}

async function loadContext(db: any, orgId: number, ev: TriggerEvent): Promise<EventContext> {
  let lead: EventContext['lead'] = null
  if (ev.leadId) {
    const L = schema.leads
    const [row] = await db
      .select({ id: L.id, name: L.name, source: L.source, stage: L.stage, priority: L.priority, agentId: L.agentId, budget: L.budget, contactId: L.contactId })
      .from(L)
      .where(and(eq(L.id, ev.leadId), eq(L.organizationId, orgId)))
      .limit(1)
    lead = row ?? null
  }
  let contactName: string | null = null
  const contactId = ev.contactId ?? lead?.contactId ?? null
  if (contactId) {
    const [c] = await db
      .select({ name: schema.contacts.name })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId)))
      .limit(1)
    contactName = c?.name ?? null
  }
  return { lead, contactName }
}

function fieldValue(field: string, ev: TriggerEvent, c: EventContext): unknown {
  switch (field) {
    case 'lead.source':
      return c.lead?.source ?? null
    case 'lead.stage':
      return c.lead?.stage ?? null
    case 'lead.priority':
      return c.lead?.priority ?? null
    case 'lead.commercial':
      return c.lead?.agentId ?? null
    case 'lead.budget':
      return c.lead?.budget ?? null
    case 'stage.to':
      return ev.toStage ?? null
    case 'stage.from':
      return ev.fromStage ?? null
    case 'task.type':
      return ev.taskType ?? null
    case 'task.priority':
      return ev.taskPriority ?? null
    default:
      return undefined
  }
}

/** ¿Se cumplen TODAS las condiciones? Si no, cuál falla (para el registro). */
export function evaluateConditions(conditions: Condition[], ev: TriggerEvent, c: EventContext): { ok: true } | { ok: false; reason: string } {
  for (const cond of conditions) {
    const def = CONDITION_FIELDS.find((f) => f.key === cond.field)
    const v = fieldValue(cond.field, ev, c)
    const empty = v === null || v === undefined || v === ''
    let pass: boolean
    switch (cond.op) {
      case 'empty':
        pass = empty
        break
      case 'not_empty':
        pass = !empty
        break
      case 'eq':
        pass = !empty && String(v) === String(cond.value)
        break
      case 'neq':
        pass = empty || String(v) !== String(cond.value)
        break
      case 'in':
        pass = !empty && (Array.isArray(cond.value) ? cond.value.map(String) : String(cond.value ?? '').split(',')).map((x) => x.trim()).includes(String(v))
        break
      case 'gte':
        pass = !empty && Number(v) >= Number(cond.value)
        break
      case 'lte':
        pass = !empty && Number(v) <= Number(cond.value)
        break
      default:
        pass = false
    }
    if (!pass) return { ok: false, reason: `No se cumple: ${def?.label ?? cond.field} (${empty ? 'sin valor' : String(v)})` }
  }
  return { ok: true }
}

function render(template: string, ev: TriggerEvent, automation: any, c: EventContext): string {
  const stage = ev.toStage ? (LEAD_STAGE_LABELS[ev.toStage] ?? DEAL_STAGE_LABELS[ev.toStage] ?? ev.toStage) : ''
  return template
    .replaceAll('{{nombre}}', c.lead?.name ?? c.contactName ?? '')
    .replaceAll('{{evento}}', AUTOMATION_TRIGGER_LABELS[automation.trigger as AutomationTrigger] ?? automation.trigger)
    .replaceAll('{{etapa}}', stage)
    .replaceAll('{{id}}', String(ev.entityId))
    .trim()
}

/** La entidad sobre la que se anota algo: el lead si lo hay; si no, el contacto, la cita o la operación. */
function noteTarget(ev: TriggerEvent, c: EventContext): { entityType: string; entityId: number } | null {
  if (ev.leadId && c.lead) return { entityType: 'lead', entityId: ev.leadId }
  const contactId = ev.contactId ?? c.lead?.contactId ?? null
  if (contactId) return { entityType: 'contact', entityId: contactId }
  if (ev.appointmentId) return { entityType: 'appointment', entityId: ev.appointmentId }
  if (ev.dealId) return { entityType: 'deal', entityId: ev.dealId }
  return null
}

/** La llamada a la herramienta para este evento, o el motivo por el que no aplica. */
export async function buildActionInput(db: any, automation: any, ev: TriggerEvent, c: EventContext): Promise<{ tool: string; input: Record<string, unknown> } | { skip: string }> {
  const action = automation.action as AutomationAction
  const cfg = parseJson<Record<string, any>>(automation.actionConfigJson, {})
  const tool = AUTOMATION_ACTION_TOOL[action]
  if (!tool) return { skip: `Acción desconocida «${automation.action}».` }
  const reason = `Automatización «${automation.name}»`
  if (ACTIONS_NEEDING_LEAD.includes(action) && !c.lead) return { skip: 'El evento no tiene un lead sobre el que actuar.' }
  switch (action) {
    case 'create_task': {
      const hours = Number(cfg.dueInHours ?? 24)
      const assigneeId = cfg.assignee === 'lead_commercial' ? (c.lead?.agentId ?? null) : cfg.assignee === 'member' ? Number(cfg.assigneeId) || null : null
      const dueWall = await agendaNowWall(db, automation.organizationId, assigneeId, new Date(Date.now() + hours * 3_600_000))
      return {
        tool,
        input: {
          title: render(String(cfg.title || 'Seguimiento'), ev, automation, c).slice(0, 200) || 'Seguimiento',
          type: cfg.type || 'follow_up',
          dueAt: dueWall.slice(0, 16),
          ...(assigneeId ? { assigneeId } : {}),
          ...(c.lead ? { leadId: c.lead.id } : {}),
          ...((ev.contactId ?? c.lead?.contactId) ? { contactId: ev.contactId ?? c.lead?.contactId } : {}),
        },
      }
    }
    case 'assign_lead':
      return { tool, input: { leadId: c.lead!.id, commercialId: Number(cfg.commercialId), reason } }
    case 'change_lead_stage':
      if (c.lead!.stage === cfg.stage) return { skip: 'El lead ya está en esa etapa.' }
      return { tool, input: { leadId: c.lead!.id, stage: cfg.stage, reason } }
    case 'create_note': {
      const target = noteTarget(ev, c)
      if (!target) return { skip: 'El evento no tiene ninguna ficha en la que anotar.' }
      return { tool, input: { ...target, body: render(String(cfg.body || ''), ev, automation, c) } }
    }
    case 'notify_team':
      return { tool, input: { message: render(String(cfg.message || ''), ev, automation, c).slice(0, 300) } }
    default:
      return { skip: `Acción desconocida «${automation.action}».` }
  }
}

/** El usuario que configuró la automatización, como sesión: su RBAC actual, y sólo si sigue siendo de esa agencia. */
export async function loadConfigurer(db: any, automation: any): Promise<SessionUser | null> {
  if (!automation.createdBy) return null
  const U = schema.users
  const [u] = await db
    .select({ id: U.id, name: U.name, email: U.email, role: U.role, organizationId: U.organizationId, permissions: U.permissions })
    .from(U)
    .where(eq(U.id, automation.createdBy))
    .limit(1)
  if (!u) return null
  if (u.role === 'super_admin') return u
  if (u.role !== 'admin' || u.organizationId !== automation.organizationId) return null
  return u
}

export interface RunOptions {
  /** El evento H3 de la petición («Procesar ahora»); en el cron se construye uno mínimo con el env. */
  event?: any
  env?: Record<string, any>
  automationId?: number
  maxRuns?: number
}

export interface RunSummary {
  automations: number
  events: number
  ok: number
  error: number
  skipped: number
}

/** Procesa las automatizaciones ACTIVAS de UNA organización. */
export async function runAutomationsForOrg(db: any, orgId: number, opts: RunOptions = {}): Promise<RunSummary> {
  const AU = schema.automations
  const conds = [eq(AU.organizationId, orgId), eq(AU.engine, 'v1'), eq(AU.enabled, 1), isNull(AU.deletedAt)]
  if (opts.automationId) conds.push(eq(AU.id, opts.automationId))
  const list = await db.select().from(AU).where(and(...conds)).orderBy(asc(AU.id))
  const summary: RunSummary = { automations: list.length, events: 0, ok: 0, error: 0, skipped: 0 }
  let budget = opts.maxRuns ?? RUNS_PER_ORG
  const event = opts.event ?? { context: { cloudflare: { env: opts.env ?? {} }, db }, node: { req: { headers: {} } } }
  const env = opts.env ?? (event.context?.cloudflare?.env || {})

  for (const automation of list) {
    if (budget <= 0) break
    const events = await fetchEvents(db, automation, Math.min(EVENTS_PER_AUTOMATION, budget))
    if (!events.length) continue
    const conditions = parseJson<Condition[]>(automation.conditionsJson, [])
    const user = await loadConfigurer(db, automation)
    let cursor = Number(automation.cursorId || 0)
    let ran = 0
    let failed = 0
    let lastError: string | null = null

    for (const ev of events) {
      budget--
      summary.events++
      const ts = now()
      // Reclamar el evento: si otra pasada ya lo tomó, el índice único lo impide.
      let runId: number
      try {
        const [row] = await db
          .insert(schema.workflowRuns)
          .values({ organizationId: orgId, kind: 'automation', automationId: automation.id, trigger: automation.trigger, eventKey: ev.key, entityType: ev.entityType, entityId: ev.entityId, executedAs: user?.id ?? null, status: 'running', createdAt: ts, updatedAt: ts })
          .returning({ id: schema.workflowRuns.id })
        runId = row.id
      } catch {
        if (ev.cursor) cursor = Math.max(cursor, ev.cursor)
        continue
      }
      const finish = async (status: 'ok' | 'error' | 'skipped', extra: { errorCode?: string | null; message?: string | null; steps?: unknown } = {}) => {
        await db
          .update(schema.workflowRuns)
          .set({ status, errorCode: extra.errorCode ?? null, message: extra.message ?? null, stepsJson: extra.steps ? JSON.stringify(extra.steps) : null, updatedAt: now(), finishedAt: now() })
          .where(eq(schema.workflowRuns.id, runId))
        summary[status]++
      }

      const c = await loadContext(db, orgId, ev)
      const check = evaluateConditions(conditions, ev, c)
      if (!check.ok) {
        await finish('skipped', { message: check.reason })
      } else {
        const built = await buildActionInput(db, automation, ev, c)
        if ('skip' in built) {
          await finish('skipped', { message: built.skip })
        } else if (!user) {
          ran++
          failed++
          lastError = 'Quien configuró la automatización ya no tiene acceso a esta agencia.'
          await finish('error', { errorCode: 'PERMISSION_DENIED', message: lastError })
        } else if (getTool(built.tool)?.requiresConfirmation) {
          // Defensa: el catálogo nunca ofrece una así, pero si llegara, no se ejecuta.
          await finish('skipped', { message: 'Esa acción necesita la confirmación de una persona.' })
        } else {
          const recent = await db
            .select({ n: count() })
            .from(schema.workflowRuns)
            .where(
              and(
                eq(schema.workflowRuns.automationId, automation.id),
                eq(schema.workflowRuns.entityType, ev.entityType),
                eq(schema.workflowRuns.entityId, ev.entityId),
                inArray(schema.workflowRuns.status, ['ok', 'error']),
                gt(schema.workflowRuns.createdAt, hoursAgo(24)),
              ),
            )
          if (Number(recent[0]?.n ?? 0) >= MAX_RUNS_PER_ENTITY_PER_DAY) {
            await finish('skipped', { message: `Freno de seguridad: ya se ejecutó ${MAX_RUNS_PER_ENTITY_PER_DAY} veces sobre esta misma ficha en 24 h.` })
          } else {
            const ctx: ToolContext = { event, db, env, orgId, user, source: 'automation' }
            const r = await executeTool(ctx, built.tool, built.input, { idempotencyKey: `auto:${automation.id}:${ev.key}` })
            ran++
            if (r.ok) {
              await finish('ok', { steps: [{ tool: built.tool, ok: true, target: r.target }], message: r.target ? `${built.tool} → ${r.target.type} #${r.target.id}` : built.tool })
            } else {
              failed++
              lastError = r.error.message
              await finish('error', { errorCode: r.error.code, message: r.error.message, steps: [{ tool: built.tool, ok: false, errorCode: r.error.code }] })
            }
          }
        }
      }
      if (ev.cursor) cursor = Math.max(cursor, ev.cursor)
    }

    await db
      .update(AU)
      .set({
        cursorId: cursor,
        ...(ran
          ? {
              runsCount: sql`${AU.runsCount} + ${ran}`,
              lastRunAt: now(),
              errorCount: sql`${AU.errorCount} + ${failed}`,
              ...(failed ? { lastError } : {}),
            }
          : {}),
      })
      .where(and(eq(AU.id, automation.id), eq(AU.organizationId, orgId)))
  }
  return summary
}

/** Organizaciones con alguna automatización activa (para el cron). */
export async function organizationsWithActiveAutomations(db: any): Promise<number[]> {
  const AU = schema.automations
  const rows = await db
    .selectDistinct({ orgId: AU.organizationId })
    .from(AU)
    .innerJoin(schema.organizations, eq(schema.organizations.id, AU.organizationId))
    .where(and(eq(AU.engine, 'v1'), eq(AU.enabled, 1), isNull(AU.deletedAt), eq(schema.organizations.status, 'active')))
  return rows.map((r: any) => r.orgId)
}

/** Las últimas ejecuciones de una automatización de la organización. */
export async function listAutomationRuns(db: any, orgId: number, automationId: number, limit = 50) {
  const W = schema.workflowRuns
  return db
    .select({ id: W.id, trigger: W.trigger, eventKey: W.eventKey, entityType: W.entityType, entityId: W.entityId, executedAs: W.executedAs, status: W.status, errorCode: W.errorCode, message: W.message, stepsJson: W.stepsJson, createdAt: W.createdAt, finishedAt: W.finishedAt })
    .from(W)
    .where(and(eq(W.organizationId, orgId), eq(W.kind, 'automation'), eq(W.automationId, automationId)))
    .orderBy(desc(W.id))
    .limit(Math.max(1, Math.min(limit, 100)))
}
