import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now, isUniqueConstraintError } from '../db'

/**
 * Lead Routing (FASE 15, migración 0071).
 *
 * Servicio central: nadie más debe decidir a mano a qué comercial va un
 * lead nuevo — todo pasa por `routeLead()` + `assignLead()`. No existe
 * Office ni Team como entidades (mismo hueco documentado desde la 0066);
 * "Team" se resuelve con `teamMembers.department`, ya existente.
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
 */
export async function buildRoutingContextFromProperty(event: H3Event, orgId: number, propertyId: number | null | undefined): Promise<RoutingContext> {
  if (!propertyId) return {}
  const db = useDb(event)

  const agentRows = await db
    .select({ district: schema.agentProperties.district, city: schema.agentProperties.city, propertyType: schema.agentProperties.propertyType })
    .from(schema.agentProperties)
    .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
    .limit(1)
  if (agentRows[0]) return { propertyId, ...agentRows[0], isNewBuild: false }

  const devRows = await db
    .select({ district: schema.developerProperties.district, city: schema.developerProperties.city, propertyType: schema.developerProperties.propertyType })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId)))
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
      .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
      .limit(1)
  )[0]
  return row?.agentId ?? null
}

/** Comerciales activos de la organización, opcionalmente acotados a un department. Orden por id: determinista. */
async function poolFor(event: H3Event, orgId: number, department: string | null | undefined): Promise<number[]> {
  const db = useDb(event)
  const filters = [eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.employmentStatus, 'active')]
  if (department) filters.push(eq(schema.teamMembers.department, department))
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
    }
    if (!matched) continue

    if (rule.targetCommercialId) {
      return { commercialId: rule.targetCommercialId, ruleId: rule.id, explanation: `${rule.name} → ${label}` }
    }

    const pool = await poolFor(event, orgId, rule.targetDepartment)
    if (!pool.length) continue // nadie en este grupo — se prueba la siguiente regla, nunca se bloquea aquí

    const scopeKey = rule.targetDepartment || 'org'
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
  const existing = (await db.select({ agentId: schema.leads.agentId }).from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!existing) throw new LeadRoutingError('Lead no encontrado')

  let agentName: string | null = null
  if (decision.commercialId) {
    const tm = (
      await db.select({ name: schema.teamMembers.name }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, decision.commercialId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
    )[0]
    agentName = tm?.name ?? null
  }

  const nowTs = now()
  await db.update(schema.leads).set({ agentId: decision.commercialId, agentName, updatedAt: nowTs }).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
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
}

/** Reasignación manual — siempre dentro de una decisión con reason propia y assignedBy real, nunca silenciosa. */
export async function reassignLead(event: H3Event, orgId: number, leadId: number, toCommercialId: number | null, opts: { userId?: number | null; reason?: string | null } = {}) {
  await assignLead(event, orgId, leadId, { commercialId: toCommercialId, ruleId: null, explanation: opts.reason || 'Reasignación manual' }, { assignedBy: opts.userId })
}
