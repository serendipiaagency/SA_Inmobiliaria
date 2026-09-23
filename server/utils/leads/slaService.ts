import { and, desc, eq, inArray, notInArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { CLOSED_STATUSES } from './status'
import { ALERT_LABELS, alertStillApplies, evaluateLead, resolutionReason, responseMetrics, type AlertKind, type SlaConfig, type SlaLead } from './sla'

/**
 * La parte del SLA que habla con la base de datos (FASE 16).
 *
 * Las reglas están en `sla.ts`, que es puro. Aquí se cargan la configuración y
 * los leads, se abren las alertas nuevas y se cierran las que ya no aplican.
 */

/** Sin fila de configuración, el SLA está apagado: no se alerta de nada hasta que la agencia lo decida. */
const DEFAULT_CONFIG: SlaConfig = { enabled: 0, firstResponseMinutes: 60, staleDays: 7, businessHoursOnly: 0 }

export async function slaConfig(event: H3Event, orgId: number): Promise<SlaConfig> {
  const db = useDb(event)
  const row = (
    await db.select().from(schema.slaSettings).where(eq(schema.slaSettings.organizationId, orgId)).limit(1)
  )[0]
  if (!row) return DEFAULT_CONFIG
  return {
    enabled: row.enabled,
    firstResponseMinutes: row.firstResponseMinutes,
    staleDays: row.staleDays,
    businessHoursOnly: row.businessHoursOnly,
  }
}

export async function saveSlaConfig(event: H3Event, orgId: number, input: Partial<SlaConfig>) {
  const db = useDb(event)
  const nowTs = now()
  const existing = (
    await db.select({ id: schema.slaSettings.id }).from(schema.slaSettings).where(eq(schema.slaSettings.organizationId, orgId)).limit(1)
  )[0]

  const values = {
    enabled: input.enabled ?? DEFAULT_CONFIG.enabled,
    firstResponseMinutes: Math.max(1, input.firstResponseMinutes ?? DEFAULT_CONFIG.firstResponseMinutes),
    staleDays: Math.max(1, input.staleDays ?? DEFAULT_CONFIG.staleDays),
    businessHoursOnly: input.businessHoursOnly ?? DEFAULT_CONFIG.businessHoursOnly,
    updatedAt: nowTs,
  }

  if (existing) {
    await db.update(schema.slaSettings).set(values).where(eq(schema.slaSettings.organizationId, orgId))
  } else {
    await db.insert(schema.slaSettings).values({ organizationId: orgId, ...values, createdAt: nowTs })
  }
  return slaConfig(event, orgId)
}

function toSlaLead(row: typeof schema.leads.$inferSelect): SlaLead {
  return {
    id: row.id,
    createdAt: row.createdAt,
    status: row.status,
    stage: row.stage,
    agentId: row.agentId,
    firstContactAt: row.firstContactAt,
    firstResponseAt: row.firstResponseAt,
    lastContactAt: row.lastContactAt,
    qualifiedAt: row.qualifiedAt,
    firstAppointmentAt: row.firstAppointmentAt,
    nextActionAt: row.nextActionAt,
  }
}

/**
 * Recalcula las alertas de la organización: abre las que faltan y cierra las
 * que ya no aplican.
 *
 * Idempotente a propósito. Se puede ejecutar cuantas veces haga falta —al
 * abrir el panel, desde una tarea programada— sin duplicar avisos ni perder
 * los que siguen vigentes. El índice único sobre (lead, tipo) abierto lo
 * garantiza también a nivel de base de datos, no sólo aquí.
 */
export async function refreshAlerts(event: H3Event, orgId: number) {
  const db = useDb(event)
  const config = await slaConfig(event, orgId)
  const nowMs = Date.now()
  const nowTs = now()

  const open = await db
    .select()
    .from(schema.leadAlerts)
    .where(and(eq(schema.leadAlerts.organizationId, orgId), eq(schema.leadAlerts.status, 'open')))

  if (!config.enabled) {
    // Al apagar el SLA no se borran las alertas: se cierran diciendo por qué.
    // Borrarlas haría desaparecer el historial de incumplimientos.
    for (const alert of open) {
      await db
        .update(schema.leadAlerts)
        .set({ status: 'resolved', resolvedAt: nowTs, resolvedReason: 'se desactivó el seguimiento de plazos' })
        .where(and(eq(schema.leadAlerts.id, alert.id), eq(schema.leadAlerts.organizationId, orgId)))
    }
    return { opened: 0, resolved: open.length, config }
  }

  const leads = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), notInArray(schema.leads.status, [...CLOSED_STATUSES])))
    .limit(1000)

  const byId = new Map(leads.map((l) => [l.id, toSlaLead(l)]))

  // 1) Cerrar las que ya no aplican.
  let resolved = 0
  for (const alert of open) {
    const lead = byId.get(alert.leadId)
    // Si el lead ya no está vivo o el motivo desapareció, la alerta se cierra.
    const stillApplies = lead ? alertStillApplies(alert.kind as AlertKind, lead, config, nowMs) : false
    if (stillApplies) continue

    await db
      .update(schema.leadAlerts)
      .set({
        status: 'resolved',
        resolvedAt: nowTs,
        resolvedReason: lead ? resolutionReason(alert.kind as AlertKind, lead) : 'la oportunidad se cerró',
      })
      .where(and(eq(schema.leadAlerts.id, alert.id), eq(schema.leadAlerts.organizationId, orgId)))
    resolved++
  }

  // 2) Abrir las nuevas.
  const openKeys = new Set(open.filter((a) => a.status === 'open').map((a) => `${a.leadId}:${a.kind}`))
  let opened = 0
  for (const lead of leads) {
    for (const alert of evaluateLead(toSlaLead(lead), config, nowMs)) {
      const key = `${alert.leadId}:${alert.kind}`
      if (openKeys.has(key)) continue
      await db
        .insert(schema.leadAlerts)
        .values({
          organizationId: orgId,
          leadId: alert.leadId,
          kind: alert.kind,
          status: 'open',
          detail: alert.detail,
          commercialId: alert.commercialId,
          createdAt: nowTs,
        })
        .onConflictDoNothing()
      openKeys.add(key)
      opened++
    }
  }

  return { opened, resolved, config }
}

/** Las alertas abiertas, con el nombre del lead para poder enseñarlas sin otra consulta. */
export async function openAlerts(event: H3Event, orgId: number) {
  const db = useDb(event)
  const alerts = await db
    .select()
    .from(schema.leadAlerts)
    .where(and(eq(schema.leadAlerts.organizationId, orgId), eq(schema.leadAlerts.status, 'open')))
    .orderBy(desc(schema.leadAlerts.id))
    .limit(200)

  if (!alerts.length) return []

  const leadIds = [...new Set(alerts.map((a) => a.leadId))]
  const leads = await db
    .select({ id: schema.leads.id, name: schema.leads.name, agentName: schema.leads.agentName, stage: schema.leads.stage })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.id, leadIds)))
  const byLead = new Map(leads.map((l) => [l.id, l]))

  return alerts.map((a) => ({
    ...a,
    kindLabel: ALERT_LABELS[a.kind as AlertKind] || a.kind,
    lead: byLead.get(a.leadId) || null,
  }))
}

/** Descartar una alerta a mano: no se borra, se marca y queda quién lo hizo. */
export async function dismissAlert(event: H3Event, orgId: number, alertId: number, reason: string | null, userId: number | null) {
  const db = useDb(event)
  await db
    .update(schema.leadAlerts)
    .set({ status: 'dismissed', resolvedAt: now(), resolvedReason: reason || `descartada por el usuario ${userId ?? '—'}` })
    .where(and(eq(schema.leadAlerts.id, alertId), eq(schema.leadAlerts.organizationId, orgId), eq(schema.leadAlerts.status, 'open')))

  return (
    await db
      .select()
      .from(schema.leadAlerts)
      .where(and(eq(schema.leadAlerts.id, alertId), eq(schema.leadAlerts.organizationId, orgId)))
      .limit(1)
  )[0]
}

/** Las métricas del periodo, sobre los leads que sí se pudieron medir. */
export async function slaMetrics(event: H3Event, orgId: number) {
  const db = useDb(event)
  const config = await slaConfig(event, orgId)
  const leads = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.organizationId, orgId))
    .orderBy(desc(schema.leads.id))
    .limit(500)

  return { config, ...responseMetrics(leads.map(toSlaLead), config) }
}

/**
 * Registra el primer intento de contacto. Sólo escribe la primera vez: el dato
 * es "cuánto tardamos en intentarlo", y sobrescribirlo lo convertiría en
 * "cuándo fue la última vez", que ya es `lastContactAt`.
 */
export async function markFirstContact(event: H3Event, orgId: number, leadId: number) {
  const db = useDb(event)
  const lead = (
    await db
      .select({ id: schema.leads.id, firstContactAt: schema.leads.firstContactAt })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!lead || lead.firstContactAt) return lead || null

  const ts = now()
  await db
    .update(schema.leads)
    .set({ firstContactAt: ts, updatedAt: ts })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
  return { id: leadId, firstContactAt: ts }
}
