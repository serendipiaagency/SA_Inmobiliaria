import { and, asc, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { CLOSED_STATUSES } from './status'
import {
  buildPool,
  cursorScopeFor,
  explain,
  pickFromPool,
  ruleApplies,
  type RoutableCommercial,
  type RoutableLead,
  type RoutingDecision,
  type RoutingRule,
  type RoutingStrategy,
} from './routing'

/**
 * La parte del routing que habla con la base de datos (FASE 15).
 *
 * Las decisiones las toma `routing.ts`, que es puro. Aquí sólo se cargan las
 * reglas y los comerciales, se avanza el contador del turno rotatorio y se
 * guarda el resultado con su explicación.
 */

export class RoutingError extends Error {}

async function loadRules(event: H3Event, orgId: number): Promise<RoutingRule[]> {
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.leadRoutingRules)
    .where(and(eq(schema.leadRoutingRules.organizationId, orgId), eq(schema.leadRoutingRules.enabled, 1)))
    .orderBy(asc(schema.leadRoutingRules.priority), asc(schema.leadRoutingRules.id))
  return rows as RoutingRule[]
}

/**
 * Los comerciales de la organización, con su carga actual.
 *
 * La carga se cuenta en una sola consulta agregada y no una por comercial: con
 * veinte comerciales serían veinte viajes a la base por cada lead que entra.
 */
async function loadCommercials(event: H3Event, orgId: number): Promise<RoutableCommercial[]> {
  const db = useDb(event)

  const members = await db
    .select({
      id: schema.teamMembers.id,
      name: schema.teamMembers.name,
      officeName: schema.teamMembers.officeName,
      zones: schema.teamMembers.zones,
      propertyTypes: schema.teamMembers.propertyTypes,
      languages: schema.teamMembers.languages,
      employmentStatus: schema.teamMembers.employmentStatus,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))

  if (!members.length) return []

  // Leads vivos por comercial: un lead ganado o perdido ya no ocupa a nadie.
  // La definición de "vivo" es la de `pipeline.ts` (CLOSED_STATUSES) y no una
  // lista escrita aquí, para que reparto y SLA cuenten lo mismo.
  const load = await db
    .select({ agentId: schema.leads.agentId, total: sql<number>`count(*)` })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), notInArray(schema.leads.status, [...CLOSED_STATUSES])))
    .groupBy(schema.leads.agentId)

  const byAgent = new Map(load.map((l) => [l.agentId, Number(l.total)]))
  return members.map((m) => ({ ...m, activeLeads: byAgent.get(m.id) || 0 }))
}

/**
 * Avanza el contador del turno rotatorio y devuelve el valor anterior.
 *
 * `counter = counter + 1` es atómico en SQLite, así que dos leads que entren a
 * la vez obtienen valores distintos y acaban en comerciales distintos. Sin
 * esto, leer-y-escribir desde el código tendría una carrera justo en el caso
 * que más importa: la ráfaga de leads de una campaña.
 */
async function nextCursor(event: H3Event, orgId: number, scopeKey: string): Promise<number> {
  const db = useDb(event)
  const nowTs = now()

  await db
    .insert(schema.leadRoutingCursors)
    .values({ organizationId: orgId, scopeKey, counter: 0, updatedAt: nowTs })
    .onConflictDoNothing()

  const updated = await db
    .update(schema.leadRoutingCursors)
    .set({ counter: sql`${schema.leadRoutingCursors.counter} + 1`, updatedAt: nowTs })
    .where(and(eq(schema.leadRoutingCursors.organizationId, orgId), eq(schema.leadRoutingCursors.scopeKey, scopeKey)))
    .returning({ counter: schema.leadRoutingCursors.counter })

  // El contador devuelto ya está incrementado; el índice usa el valor previo
  // para que el primer lead de un ámbito nuevo vaya al primer comercial.
  return Math.max(0, (updated[0]?.counter ?? 1) - 1)
}

/**
 * Decide a quién corresponde un lead, sin escribir nada.
 *
 * Recorre las reglas por prioridad. La primera que aplica Y encuentra a alguien
 * gana. Si una regla aplica pero no encuentra a nadie, se prueba la siguiente:
 * eso es lo que evita que una regla mal configurada deje leads sin dueño.
 */
export async function decideAssignment(event: H3Event, orgId: number, lead: RoutableLead): Promise<RoutingDecision> {
  const [rules, commercials] = await Promise.all([loadRules(event, orgId), loadCommercials(event, orgId)])

  const attempted: string[] = []

  for (const rule of rules) {
    if (!ruleApplies(rule, lead)) continue

    const pool = buildPool(rule, lead, commercials)
    const strategy = rule.strategy as RoutingStrategy
    const scope = cursorScopeFor(rule)

    // El contador sólo se gasta si el turno rotatorio va a elegir de verdad.
    // Avanzarlo en una regla que luego no encuentra a nadie desordenaría el
    // reparto sin que nadie lo hubiera pedido.
    const needsCursor = strategy === 'round_robin' && pool.length > 0
    const cursorCounter = needsCursor ? await nextCursor(event, orgId, scope) : 0

    const { commercial, step } = pickFromPool(rule, lead, pool, { cursorCounter })

    if (!commercial) {
      attempted.push(`${rule.name}: ${step}`)
      continue
    }

    const steps = [rule.name]
    if (rule.targetOffice) steps.push(`oficina ${rule.targetOffice}`)
    steps.push(step)

    return {
      commercialId: commercial.id,
      ruleId: rule.id,
      ruleName: rule.name,
      strategy,
      explanation: explain(steps, commercial.name),
      steps,
      usedFallback: false,
      cursorScope: needsCursor ? scope : undefined,
      pool: pool.map((c) => c.id),
    }
  }

  // Ninguna regla resolvió. Antes de rendirse, reparto general entre los
  // comerciales activos: un lead sin dueño es un cliente al que nadie llama.
  const fallbackRule: RoutingRule = {
    id: 0,
    name: 'Reparto general',
    priority: 9999,
    enabled: 1,
    strategy: 'round_robin',
    respectWorkingHours: 0,
  }
  const pool = buildPool(fallbackRule, { ...lead, zone: null, propertyType: null, language: null }, commercials)

  if (!pool.length) {
    // Se dice explícitamente que queda sin asignar, y por qué. Callarlo sería
    // exactamente el fallo que esta fase viene a corregir.
    const why = commercials.length ? 'ningún comercial activo cumple las condiciones' : 'la organización no tiene comerciales dados de alta'
    return {
      commercialId: null,
      ruleId: null,
      ruleName: null,
      strategy: null,
      explanation: `Sin asignar: ${why}`,
      steps: attempted.length ? attempted : [why],
      usedFallback: true,
      pool: [],
    }
  }

  const scope = 'fallback:all'
  const cursorCounter = await nextCursor(event, orgId, scope)
  const { commercial, step } = pickFromPool(fallbackRule, lead, pool, { cursorCounter })

  return {
    commercialId: commercial?.id ?? null,
    ruleId: null,
    ruleName: fallbackRule.name,
    strategy: 'round_robin',
    explanation: explain(['Reparto general', step], commercial?.name ?? null),
    steps: ['Reparto general', step],
    usedFallback: true,
    cursorScope: scope,
    pool: pool.map((c) => c.id),
  }
}

/**
 * Asigna el lead y deja constancia.
 *
 * Guarda la explicación completa en el propio lead y en el historial. La del
 * historial no se recalcula nunca: si la regla cambia el mes que viene, la
 * explicación de hoy tiene que seguir diciendo lo que se decidió hoy.
 */
export async function assignLead(
  event: H3Event,
  orgId: number,
  leadId: number,
  opts: { userId?: number | null; commercialId?: number; reason?: string | null } = {},
) {
  const db = useDb(event)

  const lead = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!lead) throw new RoutingError('Lead no encontrado')

  let decision: RoutingDecision
  let source: 'automatic' | 'manual' | 'fallback' = 'automatic'

  if (opts.commercialId) {
    // Reasignación a mano: se comprueba que el comercial es de esta
    // organización antes de nada. Sin eso, un id de otra agencia acabaría
    // escrito en el lead.
    const target = (
      await db
        .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.id, opts.commercialId), eq(schema.teamMembers.organizationId, orgId)))
        .limit(1)
    )[0]
    if (!target) throw new RoutingError('Comercial no encontrado')

    source = 'manual'
    decision = {
      commercialId: target.id,
      ruleId: null,
      ruleName: null,
      strategy: null,
      explanation: `Asignado a mano${opts.reason ? `: ${opts.reason}` : ''} → ${target.name}`,
      steps: ['Asignación manual'],
      usedFallback: false,
      pool: [],
    }
  } else {
    // La zona y el tipo salen del inmueble consultado, no del texto del lead.
    let zone: string | null = null
    let propertyType: string | null = null
    let propertyOwnerCommercialId: number | null = null

    if (lead.propertyId) {
      const property = (
        await db
          .select({
            district: schema.agentProperties.district,
            city: schema.agentProperties.city,
            propertyType: schema.agentProperties.propertyType,
            agentId: schema.agentProperties.agentId,
          })
          .from(schema.agentProperties)
          .where(and(eq(schema.agentProperties.id, lead.propertyId), eq(schema.agentProperties.organizationId, orgId)))
          .limit(1)
      )[0]
      if (property) {
        zone = property.district || property.city || null
        propertyType = property.propertyType || null
        propertyOwnerCommercialId = property.agentId || null
      }
    }

    decision = await decideAssignment(event, orgId, {
      id: lead.id,
      source: lead.source,
      portal: lead.portal,
      zone,
      propertyType,
      propertyOwnerCommercialId,
    })
    if (decision.usedFallback) source = 'fallback'
  }

  const nowTs = now()
  const commercialName = decision.commercialId
    ? (
        await db
          .select({ name: schema.teamMembers.name })
          .from(schema.teamMembers)
          .where(and(eq(schema.teamMembers.id, decision.commercialId), eq(schema.teamMembers.organizationId, orgId)))
          .limit(1)
      )[0]?.name || null
    : null

  await db
    .update(schema.leads)
    .set({
      agentId: decision.commercialId,
      agentName: commercialName,
      routingRuleId: decision.ruleId,
      routingExplanation: decision.explanation,
      updatedAt: nowTs,
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

  await db.insert(schema.leadAssignments).values({
    organizationId: orgId,
    leadId,
    fromCommercialId: lead.agentId,
    toCommercialId: decision.commercialId,
    ruleId: decision.ruleId,
    source,
    explanation: decision.explanation,
    reason: opts.reason || null,
    assignedBy: opts.userId ?? null,
    createdAt: nowTs,
  })

  return { decision, commercialName }
}

/** El historial de asignaciones de un lead. Sólo lectura, como el de etapas. */
export async function assignmentHistory(event: H3Event, orgId: number, leadId: number) {
  const db = useDb(event)
  return db
    .select()
    .from(schema.leadAssignments)
    .where(and(eq(schema.leadAssignments.organizationId, orgId), eq(schema.leadAssignments.leadId, leadId)))
    .orderBy(asc(schema.leadAssignments.id))
}

/** Leads vivos que no tienen dueño. Es la cola que no debe existir, y por eso se puede consultar. */
export async function unassignedLeads(event: H3Event, orgId: number) {
  const db = useDb(event)
  return db
    .select({ id: schema.leads.id, name: schema.leads.name, source: schema.leads.source, createdAt: schema.leads.createdAt })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.organizationId, orgId),
        notInArray(schema.leads.status, [...CLOSED_STATUSES]),
        or(isNull(schema.leads.agentId), eq(schema.leads.agentId, 0)),
      ),
    )
    .orderBy(asc(schema.leads.createdAt))
    .limit(200)
}
