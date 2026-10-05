import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { useDb, schema, now, isUniqueConstraintError } from '../db'
import { recordActivity } from '../activity/service'
import { livePropertyCond } from '../properties/trash'
import { ROUTING_SCOPES } from '../../../utils/leadCatalog'

/**
 * Lead Routing (FASE 15, migración 0071).
 *
 * Servicio central: nadie más debe decidir a mano a qué comercial va un
 * lead nuevo — todo pasa por `routeLead()` + `assignLead()`. Oficinas y
 * equipos son entidades desde la migración 0086 (reglas «Oficina» y
 * «Equipo», y `targetOfficeId`); `teamMembers.department` sigue valiendo
 * como reparto por departamento.
 */

export class LeadRoutingError extends Error {}

export interface RoutingContext {
  propertyId?: number | null
  district?: string | null
  city?: string | null
  language?: string | null
  propertyType?: string | null
  /** true = developer_properties (obra nueva); false = agent_properties (2ª mano); null = no se sabe. */
  isNewBuild?: boolean | null
  /** Oficina que ya trae el lead (migración 0086): la regla «Oficina» compara con ella. */
  officeId?: number | null
  /** Momento de la entrada, para las reglas con horario. Por defecto, ahora. */
  at?: Date
}

/**
 * Horario de una regla (lead_routing_rules.schedule_json, migración 0086):
 * `{ days: [1..7] (1 = lunes), from: 'HH:MM', to: 'HH:MM', timezone: 'Europe/Madrid' }`.
 * Fuera de su horario la regla no aplica y se prueba la siguiente — así un
 * equipo de guardia recibe lo que entra de noche o en fin de semana.
 */
export interface RoutingSchedule {
  days?: number[]
  from?: string
  to?: string
  timezone?: string
}

export function parseRoutingSchedule(raw: unknown): RoutingSchedule | null {
  if (!raw) return null
  let v: any = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object') return null
  return v as RoutingSchedule
}

/** Valida un horario antes de guardarlo (lo usa el alta/edición de reglas). Devuelve el texto del error o null. */
export function validateRoutingSchedule(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  const s = parseRoutingSchedule(raw)
  if (!s) return 'El horario no es un JSON válido'
  if (s.days && (!Array.isArray(s.days) || s.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7))) return 'Los días van de 1 (lunes) a 7 (domingo)'
  for (const k of ['from', 'to'] as const) if (s[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k]!)) return `«${k === 'from' ? 'Desde' : 'Hasta'}» debe tener el formato HH:MM`
  if (s.timezone) {
    try {
      new Intl.DateTimeFormat('es-ES', { timeZone: s.timezone })
    } catch {
      return 'Zona horaria no válida (usa el formato Europe/Madrid)'
    }
  }
  return null
}

/**
 * Valida una regla antes de guardarla (alta y edición desde el CRUD
 * genérico), sobre el estado resultante: ámbito del catálogo, horario bien
 * formado, y que la oficina o el equipo de `matchValue` son de esta agencia
 * (`matchValue` es texto libre: el motor genérico no puede validarlo como
 * relación). Lanza 422/404.
 */
export async function validateRoutingRule(db: any, orgId: number, data: Record<string, any>, existing: Record<string, any> | null): Promise<void> {
  const merged = { ...(existing || {}), ...data }
  if (!(ROUTING_SCOPES as readonly string[]).includes(String(merged.scope))) throw createError({ statusCode: 422, statusMessage: 'Ámbito de la regla no válido' })
  const scheduleProblem = validateRoutingSchedule(merged.scheduleJson)
  if (scheduleProblem) throw createError({ statusCode: 422, statusMessage: scheduleProblem })
  const value = merged.matchValue == null || merged.matchValue === '' ? null : String(merged.matchValue).trim()
  if (merged.scope === 'team' || (merged.scope === 'office' && value)) {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: merged.scope === 'team' ? 'Elige el equipo de la regla' : 'La oficina de la regla no es válida' })
    const table = merged.scope === 'team' ? schema.teams : schema.offices
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
    if (!row) throw createError({ statusCode: 404, statusMessage: merged.scope === 'team' ? 'Equipo no encontrado' : 'Oficina no encontrada' })
  }
}

/** ¿Está `at` dentro del horario? Sin horario, siempre. Admite franjas que cruzan la medianoche (22:00-06:00). */
export function isWithinSchedule(schedule: RoutingSchedule | null, at: Date = new Date()): boolean {
  if (!schedule) return true
  const tz = schedule.timezone || 'Europe/Madrid'
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const day = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[get('weekday')]
  const hm = `${get('hour')}:${get('minute')}`
  if (schedule.days?.length && !schedule.days.includes(day)) return false
  const from = schedule.from || '00:00'
  const to = schedule.to || '23:59'
  return from <= to ? hm >= from && hm <= to : hm >= from || hm <= to
}

export interface RoutingDecision {
  commercialId: number | null
  ruleId: number | null
  /** Explicación en cadena, lista para enseñar ("Zona Chamberí → Equipo Centro → Round Robin → Laura"). */
  explanation: string
}

function normalizeText(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Contexto de enrutado a partir de una Property real, probando primero
 * agent_properties (2ª mano) y si no, developer_properties (obra nueva) —
 * mismo patrón dual-catálogo que server/utils/matching/service.ts. Sólo
 * agent_properties tiene un comercial responsable propio; developer_properties
 * no (no hay columna para ello), así que la regla 'property' nunca aplica a
 * un lead de obra nueva — es honesto, no un hueco por arreglar.
 *
 * Una propiedad en la papelera no aporta contexto (ni comercial
 * responsable): el lead se enruta como si no trajera propiedad.
 */
export async function buildRoutingContextFromProperty(event: H3Event, orgId: number, propertyId: number | null | undefined): Promise<RoutingContext> {
  if (!propertyId) return {}
  const db = useDb(event)

  const agentRows = await db
    .select({ district: schema.agentProperties.district, city: schema.agentProperties.city, propertyType: schema.agentProperties.propertyType })
    .from(schema.agentProperties)
    .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId), livePropertyCond(schema.agentProperties)))
    .limit(1)
  if (agentRows[0]) return { propertyId, ...agentRows[0], isNewBuild: false }

  const devRows = await db
    .select({ district: schema.developerProperties.district, city: schema.developerProperties.city, propertyType: schema.developerProperties.propertyType })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId), livePropertyCond(schema.developerProperties)))
    .limit(1)
  if (devRows[0]) return { propertyId, ...devRows[0], isNewBuild: true }

  return {}
}

async function resolvePropertyResponsible(event: H3Event, orgId: number, propertyId: number): Promise<number | null> {
  const db = useDb(event)
  const row = (
    await db
      .select({ agentId: schema.agentProperties.agentId })
      .from(schema.agentProperties)
      .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId), livePropertyCond(schema.agentProperties)))
      .limit(1)
  )[0]
  return row?.agentId ?? null
}

/**
 * Comerciales activos de la organización, opcionalmente acotados a un
 * department (texto), a una oficina o a un equipo (entidades, migración
 * 0086). Orden por id: determinista.
 */
async function poolFor(event: H3Event, orgId: number, department: string | null | undefined, opts: { officeId?: number | null; teamId?: number | null } = {}): Promise<number[]> {
  const db = useDb(event)
  const filters = [eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.employmentStatus, 'active')]
  if (department) filters.push(eq(schema.teamMembers.department, department))
  if (opts.officeId) filters.push(eq(schema.teamMembers.officeId, opts.officeId))
  if (opts.teamId) filters.push(eq(schema.teamMembers.teamId, opts.teamId))
  const rows = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(...filters)).orderBy(schema.teamMembers.id)
  return rows.map((r: any) => r.id)
}

/**
 * Elige por carga de trabajo: el comercial del pool con menos leads activos
 * (ni ganados ni perdidos) ahora mismo. Definición simple y documentada
 * (FASE 15 §16) — no combina unidades distintas en una fórmula inventada.
 */
async function pickByWorkload(event: H3Event, orgId: number, pool: number[]): Promise<number | null> {
  if (!pool.length) return null
  const db = useDb(event)
  const rows = await db
    .select({ agentId: schema.leads.agentId, n: sql<number>`count(*)` })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.agentId, pool), notInArray(schema.leads.status, ['won', 'lost'])))
    .groupBy(schema.leads.agentId)
  const counts = new Map<number, number>(pool.map((id) => [id, 0]))
  for (const r of rows as any[]) counts.set(r.agentId, Number(r.n))
  let best = pool[0]
  let bestCount = Infinity
  for (const id of pool) {
    const c = counts.get(id) ?? 0
    if (c < bestCount) {
      best = id
      bestCount = c
    }
  }
  return best
}

/**
 * Round robin real, persistente y concurrency-safe: compare-and-swap sobre
 * `lead_round_robin_state` (lee el último asignado, calcula el siguiente,
 * actualiza sólo si nadie lo cambió entretanto) — mismo principio de
 * "reclamar con una condición atómica" que ya usa este repo para evitar
 * process-then-check, sin depender de transacciones explícitas de D1.
 */
async function pickByRoundRobin(event: H3Event, orgId: number, scopeKey: string, pool: number[]): Promise<number | null> {
  if (!pool.length) return null
  const db = useDb(event)

  for (let attempt = 0; attempt < 4; attempt++) {
    const state = (
      await db
        .select()
        .from(schema.leadRoundRobinState)
        .where(and(eq(schema.leadRoundRobinState.organizationId, orgId), eq(schema.leadRoundRobinState.scopeKey, scopeKey)))
        .limit(1)
    )[0]
    const lastId = state?.lastAssignedCommercialId ?? null
    const idx = lastId != null ? pool.indexOf(lastId) : -1
    const next = pool[(idx + 1) % pool.length]
    const nowTs = now()

    if (!state) {
      try {
        await db.insert(schema.leadRoundRobinState).values({ organizationId: orgId, scopeKey, lastAssignedCommercialId: next, updatedAt: nowTs })
        return next
      } catch (e) {
        if (isUniqueConstraintError(e)) continue // otra petición lo creó a la vez — se relee en el siguiente intento
        throw e
      }
    }

    const guard = lastId == null ? isNull(schema.leadRoundRobinState.lastAssignedCommercialId) : eq(schema.leadRoundRobinState.lastAssignedCommercialId, lastId)
    const updated = await db
      .update(schema.leadRoundRobinState)
      .set({ lastAssignedCommercialId: next, updatedAt: nowTs })
      .where(and(eq(schema.leadRoundRobinState.id, state.id), guard))
      .returning({ id: schema.leadRoundRobinState.id })
    if (updated.length) return next
    // Otra petición ganó la carrera y ya movió el turno — se relee y se reintenta contra el nuevo estado.
  }
  // Tras varios intentos concurrentes, se asigna de forma determinista en vez de dejar el lead sin dueño.
  return pool[0]
}

/**
 * Evalúa las reglas de la organización en orden de prioridad y decide a
 * quién va un lead. Nunca escribe nada — sólo decide. `assignLead()` aplica
 * la decisión. Null en `commercialId` = ninguna regla aplicable, queda sin
 * asignar (cola), nunca se pierde el lead por ello.
 */
export async function routeLead(event: H3Event, orgId: number, ctx: RoutingContext): Promise<RoutingDecision> {
  const db = useDb(event)
  const rules = await db
    .select()
    .from(schema.leadRoutingRules)
    .where(and(eq(schema.leadRoutingRules.organizationId, orgId), eq(schema.leadRoutingRules.enabled, 1)))
    .orderBy(schema.leadRoutingRules.priority)

  for (const rule of rules as any[]) {
    let matched = false
    let label = rule.name
    // Fuera de su horario, la regla no aplica (se prueba la siguiente).
    if (!isWithinSchedule(parseRoutingSchedule(rule.scheduleJson), ctx.at)) continue
    let teamId: number | null = null

    if (rule.scope === 'property') {
      if (ctx.propertyId) {
        const responsible = await resolvePropertyResponsible(event, orgId, ctx.propertyId)
        if (responsible) return { commercialId: responsible, ruleId: rule.id, explanation: `${rule.name}: comercial responsable de la propiedad` }
      }
      continue
    }
    if (rule.scope === 'zone') {
      matched = !!rule.matchValue && (normalizeText(ctx.district) === normalizeText(rule.matchValue) || normalizeText(ctx.city) === normalizeText(rule.matchValue))
      label = `Zona ${rule.matchValue}`
    } else if (rule.scope === 'language') {
      matched = !!rule.matchValue && !!ctx.language && normalizeText(ctx.language) === normalizeText(rule.matchValue)
      label = `Idioma ${rule.matchValue}`
    } else if (rule.scope === 'property_type') {
      matched = !!rule.matchValue && !!ctx.propertyType && normalizeText(ctx.propertyType) === normalizeText(rule.matchValue)
      label = `Tipo ${rule.matchValue}`
    } else if (rule.scope === 'new_build') {
      matched = ctx.isNewBuild === true
      label = 'Obra nueva'
    } else if (rule.scope === 'department') {
      matched = true // regla de reparto — sin condición propia, es el nivel de "equipo" o el catch-all final
      label = rule.targetDepartment ? `Equipo ${rule.targetDepartment}` : 'Reparto general'
    } else if (rule.scope === 'office') {
      // El lead ya trae oficina (formulario de una oficina, alta manual): la
      // regla aplica si es la suya. Sin `matchValue`, aplica a cualquier lead
      // y reparte dentro de `targetOfficeId`.
      matched = rule.matchValue ? Number(rule.matchValue) === Number(ctx.officeId) : true
      label = 'Oficina'
    } else if (rule.scope === 'team') {
      // Reparto dentro de un equipo (entidad Equipos): `matchValue` es su id.
      teamId = Number(rule.matchValue) || null
      matched = !!teamId
      label = 'Equipo'
    }
    if (!matched) continue

    if (rule.targetCommercialId) {
      return { commercialId: rule.targetCommercialId, ruleId: rule.id, explanation: `${rule.name} → ${label}` }
    }

    const officeId = rule.targetOfficeId ?? (rule.scope === 'office' ? ctx.officeId ?? null : null)
    const pool = await poolFor(event, orgId, rule.targetDepartment, { officeId, teamId })
    if (!pool.length) continue // nadie en este grupo — se prueba la siguiente regla, nunca se bloquea aquí

    const scopeKey = [rule.targetDepartment || 'org', officeId ? `office:${officeId}` : null, teamId ? `team:${teamId}` : null].filter(Boolean).join('|')
    const picked = rule.strategy === 'workload' ? await pickByWorkload(event, orgId, pool) : await pickByRoundRobin(event, orgId, scopeKey, pool)
    if (picked) {
      const strategyLabel = rule.strategy === 'workload' ? 'Carga de trabajo' : 'Round Robin'
      return { commercialId: picked, ruleId: rule.id, explanation: `${rule.name} → ${label} → ${strategyLabel}` }
    }
  }

  return { commercialId: null, ruleId: null, explanation: 'Ninguna regla aplicable — queda sin asignar' }
}

/** Aplica una decisión de enrutado: escribe leads.agentId/agentName y deja constancia en el historial. */
export async function assignLead(event: H3Event, orgId: number, leadId: number, decision: RoutingDecision, opts: { assignedBy?: number | null } = {}) {
  const db = useDb(event)
  const existing = (
    await db.select({ agentId: schema.leads.agentId, contactId: schema.leads.contactId }).from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1)
  )[0]
  if (!existing) throw new LeadRoutingError('Lead no encontrado')

  let agentName: string | null = null
  if (decision.commercialId) {
    const tm = (
      await db.select({ name: schema.teamMembers.name }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, decision.commercialId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
    )[0]
    agentName = tm?.name ?? null
  }

  const nowTs = now()
  // La oficina y el equipo del lead siguen al comercial cuando el lead no
  // tenía (migración 0086): así filtran y segmentan por oficina sin un paso más.
  const [lead] = await db.select({ officeId: schema.leads.officeId, teamId: schema.leads.teamId }).from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1)
  let inherit: Record<string, number> = {}
  if (decision.commercialId && (!lead?.officeId || !lead?.teamId)) {
    const [tm] = await db
      .select({ officeId: schema.teamMembers.officeId, teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.id, decision.commercialId), eq(schema.teamMembers.organizationId, orgId)))
      .limit(1)
    if (!lead?.officeId && tm?.officeId) inherit.officeId = tm.officeId
    if (!lead?.teamId && tm?.teamId) inherit.teamId = tm.teamId
  }
  await db.update(schema.leads).set({ agentId: decision.commercialId, agentName, updatedAt: nowTs, ...inherit }).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
  await db.insert(schema.leadAssignmentHistory).values({
    organizationId: orgId,
    leadId,
    fromCommercialId: existing.agentId,
    toCommercialId: decision.commercialId,
    ruleId: decision.ruleId,
    reason: decision.explanation,
    assignedBy: opts.assignedBy ?? null,
    createdAt: nowTs,
  })

  if (existing.agentId !== decision.commercialId) {
    await recordActivity(db, orgId, {
      eventType: existing.agentId ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED',
      entityType: 'lead',
      entityId: leadId,
      leadId,
      contactId: existing.contactId,
      actorType: opts.assignedBy ? 'user' : 'system',
      actorId: opts.assignedBy ?? null,
      metadata: { fromCommercialId: existing.agentId, toCommercialId: decision.commercialId, ruleId: decision.ruleId, reason: decision.explanation },
    })
  }
}

/** Reasignación manual — siempre dentro de una decisión con reason propia y assignedBy real, nunca silenciosa. */
export async function reassignLead(event: H3Event, orgId: number, leadId: number, toCommercialId: number | null, opts: { userId?: number | null; reason?: string | null } = {}) {
  await assignLead(event, orgId, leadId, { commercialId: toCommercialId, ruleId: null, explanation: opts.reason || 'Reasignación manual' }, { assignedBy: opts.userId })
}
