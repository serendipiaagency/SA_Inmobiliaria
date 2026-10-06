import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { hasAreaAccess } from '../permissions'
import type { SessionUser } from '../auth'
import { getTool } from '../tools/execute'
import { secretKindIn } from '../inmo/memory'
import { selectInChunks } from '../sqlChunks'
import { currentCursor, listAutomationRuns } from './engine'
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_ACTION_TOOL,
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_LABELS,
  CONDITION_FIELDS,
  type AutomationAction,
} from '../../../utils/automationCatalog'
import { LEAD_STAGES } from '../../../utils/leadCatalog'
import { TASK_TYPES } from '../../../utils/pipelineCatalog'

/**
 * Alta, edición, activación y detalle de automatizaciones (bloque N8b). Lo
 * llama el motor de recursos (`/api/admin/automations`, área CRM).
 *
 * Reglas:
 *  - Sólo disparadores, condiciones y acciones del catálogo
 *    (utils/automationCatalog.ts); nada de envíos a clientes.
 *  - Quien guarda o activa una automatización tiene que poder ejecutar su
 *    acción (el RBAC de la herramienta): si no, 403 — una automatización no
 *    amplía los permisos de nadie. Queda como su «configurador» y la acción
 *    se ejecuta después con SU usuario y SU organización.
 *  - Las referencias (comercial, responsable) se validan en la organización
 *    (ajena = 404).
 *  - Las filas de demostración heredadas (engine = 'legacy') no se editan ni
 *    se activan: sólo se pueden eliminar.
 *  - Crear o activar fija el cursor en «ahora»: lo anterior no la dispara.
 */

const MAX_CONDITIONS = 5

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === 'object') return raw as T
  try {
    return (JSON.parse(String(raw ?? '')) ?? fallback) as T
  } catch {
    return fallback
  }
}

async function assertTeamMember(db: any, orgId: number, id: unknown, label: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) fail(422, `Elige ${label}`)
  const [row] = await db
    .select({ id: schema.teamMembers.id })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, n), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  if (!row) fail(404, `${label[0].toUpperCase()}${label.slice(1)} no encontrado en esta organización`)
  return n
}

function validateConditions(trigger: string, raw: unknown) {
  const list = parseJson<any[]>(raw, [])
  if (!Array.isArray(list)) fail(422, 'Las condiciones deben ser una lista')
  if (list.length > MAX_CONDITIONS) fail(422, `Como máximo ${MAX_CONDITIONS} condiciones`)
  return list.map((c, i) => {
    const def = CONDITION_FIELDS.find((f) => f.key === c?.field)
    if (!def) fail(422, `Condición ${i + 1}: campo no válido`)
    if (!(def!.triggers as readonly string[]).includes(trigger)) fail(422, `Condición ${i + 1}: «${def!.label}» no aplica a este disparador`)
    if (!(def!.ops as readonly string[]).includes(c.op)) fail(422, `Condición ${i + 1}: operador no válido para «${def!.label}»`)
    if (c.op === 'empty' || c.op === 'not_empty') return { field: def!.key, op: c.op }
    if (def!.type === 'number' || (def!.type === 'ref' && c.op === 'eq')) {
      const n = Number(c.value)
      if (!Number.isFinite(n)) fail(422, `Condición ${i + 1}: «${def!.label}» necesita un número`)
      return { field: def!.key, op: c.op, value: n }
    }
    const values = (Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',')).map((x: unknown) => String(x).trim()).filter(Boolean)
    if (!values.length) fail(422, `Condición ${i + 1}: elige un valor`)
    for (const v of values) if (!def!.options!.includes(v)) fail(422, `Condición ${i + 1}: «${v}» no es un valor de «${def!.label}»`)
    return { field: def!.key, op: c.op, value: c.op === 'in' ? values : values[0] }
  })
}

async function validateActionConfig(db: any, orgId: number, action: AutomationAction, raw: unknown) {
  const cfg = parseJson<Record<string, any>>(raw, {})
  switch (action) {
    case 'create_task': {
      const title = String(cfg.title ?? '').trim()
      if (!title) fail(422, 'La tarea necesita un título')
      if (title.length > 200) fail(422, 'El título de la tarea admite como máximo 200 caracteres')
      const type = cfg.type || 'follow_up'
      if (!(TASK_TYPES as readonly string[]).includes(type)) fail(422, 'Tipo de tarea no válido')
      const dueInHours = cfg.dueInHours === undefined || cfg.dueInHours === '' ? 24 : Number(cfg.dueInHours)
      if (!Number.isInteger(dueInHours) || dueInHours < 0 || dueInHours > 720) fail(422, 'El vencimiento va de 0 a 720 horas')
      const assignee = cfg.assignee || 'lead_commercial'
      if (!['lead_commercial', 'member', 'none'].includes(assignee)) fail(422, 'Responsable no válido')
      const assigneeId = assignee === 'member' ? await assertTeamMember(db, orgId, cfg.assigneeId, 'el responsable') : null
      return { title, type, dueInHours, assignee, ...(assigneeId ? { assigneeId } : {}) }
    }
    case 'assign_lead':
      return { commercialId: await assertTeamMember(db, orgId, cfg.commercialId, 'el comercial') }
    case 'change_lead_stage': {
      if (!(LEAD_STAGES as readonly string[]).includes(cfg.stage)) fail(422, 'Elige una etapa del lead')
      return { stage: cfg.stage }
    }
    case 'create_note': {
      const body = String(cfg.body ?? '').trim()
      if (!body) fail(422, 'La nota no puede estar vacía')
      if (body.length > 1000) fail(422, 'La nota admite como máximo 1000 caracteres')
      if (secretKindIn(body)) fail(422, 'La nota parece contener un secreto (contraseña, clave o dato de pago): no se guarda')
      return { body }
    }
    case 'notify_team': {
      const message = String(cfg.message ?? '').trim()
      if (!message) fail(422, 'El aviso no puede estar vacío')
      if (message.length > 300) fail(422, 'El aviso admite como máximo 300 caracteres')
      return { message }
    }
  }
}

/** Quien configura tiene que poder ejecutar la acción él mismo (nunca se amplían permisos). */
function assertCanRun(user: SessionUser, action: AutomationAction) {
  const tool = getTool(AUTOMATION_ACTION_TOOL[action])
  if (!tool) fail(422, 'Acción no válida')
  if (tool!.requiresConfirmation) fail(422, 'Esa acción necesita la confirmación de una persona: no se puede automatizar')
  if (!hasAreaAccess(user, tool!.area, tool!.action)) fail(403, 'Tu usuario no puede ejecutar esa acción, así que tampoco puede automatizarla')
}

async function buildValues(db: any, orgId: number, user: SessionUser, body: Record<string, any>, existing: any | null) {
  const merged = { ...(existing || {}), ...body }
  const name = String(merged.name ?? '').trim()
  if (!name) fail(422, 'El nombre es obligatorio')
  if (name.length > 120) fail(422, 'El nombre admite como máximo 120 caracteres')
  const description = merged.description == null ? null : String(merged.description).trim().slice(0, 500) || null
  const trigger = String(merged.trigger ?? '')
  if (!(AUTOMATION_TRIGGERS as readonly string[]).includes(trigger)) fail(422, 'Elige un disparador del catálogo')
  const action = String(merged.action ?? '') as AutomationAction
  if (!(AUTOMATION_ACTIONS as readonly string[]).includes(action)) fail(422, 'Elige una acción del catálogo')
  assertCanRun(user, action)
  const conditions = validateConditions(trigger, 'conditions' in body ? body.conditions : (existing?.conditionsJson ?? '[]'))
  const config = await validateActionConfig(db, orgId, action, 'config' in body ? body.config : (existing?.actionConfigJson ?? '{}'))
  return { name, description, trigger, action, conditionsJson: JSON.stringify(conditions), actionConfigJson: JSON.stringify(config) }
}

export async function createAutomation(db: any, orgId: number, user: SessionUser, body: Record<string, any>) {
  const values = await buildValues(db, orgId, user, body || {}, null)
  const enabled = body?.enabled === false || body?.enabled === 0 ? 0 : 1
  const ts = now()
  const [row] = await db
    .insert(schema.automations)
    .values({ ...values, organizationId: orgId, engine: 'v1', enabled, createdBy: user.id, cursorId: await currentCursor(db, values.trigger), activeSince: ts, runsCount: 0, errorCount: 0, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

/**
 * Edición o activación. Activar (0 → 1) o cambiar el disparador mueve el
 * cursor a «ahora»: lo que pasó mientras estaba apagada no se recupera.
 */
export async function updateAutomation(db: any, orgId: number, user: SessionUser, existing: any, body: Record<string, any>) {
  if (existing.engine !== 'v1') fail(422, 'Es una regla de demostración heredada: nunca se ha ejecutado y no se puede activar ni editar. Elimínala y crea una real.')
  const editsConfig = ['name', 'description', 'trigger', 'action', 'conditions', 'config'].some((k) => k in (body || {}))
  const values = editsConfig ? await buildValues(db, orgId, user, body, existing) : null
  const enabled = body && 'enabled' in body ? (body.enabled === true || body.enabled === 1 || body.enabled === '1' ? 1 : 0) : existing.enabled
  // Activar también es configurar: hay que poder ejecutar la acción.
  if (enabled && !existing.enabled) assertCanRun(user, existing.action as AutomationAction)
  const ts = now()
  const triggerChanged = values && values.trigger !== existing.trigger
  const reactivated = enabled && !existing.enabled
  const patch: Record<string, any> = { ...(values || {}), enabled, updatedAt: ts }
  // Quien guarda o activa pasa a ser el configurador: la acción se ejecutará con sus permisos.
  if (editsConfig || reactivated) patch.createdBy = user.id
  if (triggerChanged || reactivated) {
    patch.cursorId = await currentCursor(db, (values?.trigger ?? existing.trigger) as string)
    patch.activeSince = ts
  }
  const [row] = await db
    .update(schema.automations)
    .set(patch)
    .where(and(eq(schema.automations.id, existing.id), eq(schema.automations.organizationId, orgId)))
    .returning()
  return row
}

/** Etiquetas, configuración ya parseada, quién la configuró y si es una demo heredada. */
export async function decorateAutomations(db: any, orgId: number, rows: any[]) {
  const ids = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[]
  const users = await selectInChunks(ids, (part) =>
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(inArray(schema.users.id, part), or(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'super_admin')))),
  )
  const names = new Map<number, string>(users.map((u: any) => [u.id, u.name]))
  return rows.map((r) => ({
    ...r,
    legacy: r.engine !== 'v1',
    triggerLabel: AUTOMATION_TRIGGER_LABELS[r.trigger as keyof typeof AUTOMATION_TRIGGER_LABELS] ?? r.trigger,
    actionLabel: AUTOMATION_ACTION_LABELS[r.action as keyof typeof AUTOMATION_ACTION_LABELS] ?? r.action,
    conditions: parseJson<any[]>(r.conditionsJson, []),
    config: parseJson<Record<string, any>>(r.actionConfigJson, {}),
    configuredByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
  }))
}

/** Ficha de una automatización con su registro de ejecuciones. */
export async function automationDetail(db: any, orgId: number, row: any) {
  const [decorated] = await decorateAutomations(db, orgId, [row])
  const runs = await listAutomationRuns(db, orgId, row.id)
  return { row: decorated, runs: runs.map((r: any) => ({ ...r, steps: parseJson<any[]>(r.stepsJson, []) })) }
}

/** Resumen para la cabecera de la página: sólo automatizaciones reales; las demo heredadas, aparte. */
export async function automationSummary(db: any, orgId: number) {
  const rows = await db
    .select({ id: schema.automations.id, engine: schema.automations.engine, enabled: schema.automations.enabled, runsCount: schema.automations.runsCount, errorCount: schema.automations.errorCount })
    .from(schema.automations)
    .where(and(eq(schema.automations.organizationId, orgId), isNull(schema.automations.deletedAt)))
  const real = rows.filter((r: any) => r.engine === 'v1')
  return {
    total: real.length,
    active: real.filter((r: any) => r.enabled).length,
    totalRuns: real.reduce((a: number, r: any) => a + (r.runsCount || 0), 0),
    totalErrors: real.reduce((a: number, r: any) => a + (r.errorCount || 0), 0),
    legacy: rows.length - real.length,
  }
}
