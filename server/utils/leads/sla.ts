import { and, eq, isNull, lt, ne } from 'drizzle-orm'
import { schema, now } from '../db'

/**
 * Lead SLA (FASE 16, migración 0071).
 *
 * Mide si una oportunidad se está atendiendo a tiempo. Los timestamps
 * (`firstResponseAt`, `qualifiedAt`) los rellenan acciones reales en
 * server/utils/leads/pipeline.ts — nunca se inventan aquí a partir de
 * `updatedAt`.
 *
 * Recibe `db` directamente (no `event`) en todas sus funciones, igual que
 * server/utils/appointments/notifications.ts — así `checkSlaForOrg()` puede
 * llamarse tanto desde una petición real como desde el cron cross-tenant
 * server/tasks/leads/sla-check.ts, que no tiene H3Event.
 */

export interface SlaSettingsValues {
  newLeadUnattendedMinutes: number
  qualifiedWithoutActionHours: number
  inactiveLeadDays: number
  useBusinessHours: boolean
}

const DEFAULTS: SlaSettingsValues = { newLeadUnattendedMinutes: 30, qualifiedWithoutActionHours: 24, inactiveLeadDays: 7, useBusinessHours: false }

export async function getSlaSettings(db: any, orgId: number): Promise<SlaSettingsValues> {
  const row = (await db.select().from(schema.slaSettings).where(eq(schema.slaSettings.organizationId, orgId)).limit(1))[0]
  if (!row) return { ...DEFAULTS }
  return {
    newLeadUnattendedMinutes: row.newLeadUnattendedMinutes,
    qualifiedWithoutActionHours: row.qualifiedWithoutActionHours,
    inactiveLeadDays: row.inactiveLeadDays,
    useBusinessHours: !!row.useBusinessHours,
  }
}

export async function updateSlaSettings(db: any, orgId: number, input: Partial<SlaSettingsValues>) {
  const current = await getSlaSettings(db, orgId)
  const merged = { ...current, ...input }
  const nowTs = now()
  await db
    .insert(schema.slaSettings)
    .values({
      organizationId: orgId,
      newLeadUnattendedMinutes: merged.newLeadUnattendedMinutes,
      qualifiedWithoutActionHours: merged.qualifiedWithoutActionHours,
      inactiveLeadDays: merged.inactiveLeadDays,
      useBusinessHours: merged.useBusinessHours ? 1 : 0,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .onConflictDoUpdate({
      target: schema.slaSettings.organizationId,
      set: {
        newLeadUnattendedMinutes: merged.newLeadUnattendedMinutes,
        qualifiedWithoutActionHours: merged.qualifiedWithoutActionHours,
        inactiveLeadDays: merged.inactiveLeadDays,
        useBusinessHours: merged.useBusinessHours ? 1 : 0,
        updatedAt: nowTs,
      },
    })
  return merged
}

/** Cuándo se consiguió la primera cita — nunca se sobrescribe una vez puesta. Llamarlo tras crear una visita real vinculada a un lead. */
export async function markFirstAppointment(db: any, orgId: number, leadId: number) {
  const lead = (await db.select({ firstAppointmentAt: schema.leads.firstAppointmentAt }).from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!lead || lead.firstAppointmentAt) return
  const nowTs = now()
  await db.update(schema.leads).set({ firstAppointmentAt: nowTs, updatedAt: nowTs }).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

async function openAlert(db: any, orgId: number, leadId: number, type: string) {
  const nowTs = now()
  try {
    await db.insert(schema.leadSlaAlerts).values({ organizationId: orgId, leadId, type, status: 'open', openedAt: nowTs, createdAt: nowTs })
  } catch {
    // Ya existe una alerta abierta de este tipo para este lead — el índice único parcial lo impide, no hace falta comprobar antes.
  }
}

async function resolveAlert(db: any, orgId: number, leadId: number, type: string, reason: 'auto' | 'manual') {
  await db
    .update(schema.leadSlaAlerts)
    .set({ status: 'resolved', resolvedAt: now(), resolvedReason: reason })
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.leadId, leadId), eq(schema.leadSlaAlerts.type, type), eq(schema.leadSlaAlerts.status, 'open')))
}

/**
 * Recorre los leads activos de una organización, abre alertas nuevas y
 * resuelve las que ya no aplican. La llama, por cada organización, el cron
 * cross-tenant server/tasks/leads/sla-check.ts.
 */
export async function checkSlaForOrg(db: any, orgId: number) {
  const settings = await getSlaSettings(db, orgId)

  // 1) Nuevo sin atender: stage='new' (nunca lo tocó una persona) y ha pasado el umbral desde su creación.
  const unattendedThreshold = minutesAgo(settings.newLeadUnattendedMinutes)
  const unattended = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.stage, 'new'), isNull(schema.leads.firstResponseAt), ne(schema.leads.status, 'lost'), lt(schema.leads.createdAt, unattendedThreshold)))
  for (const r of unattended as any[]) await openAlert(db, orgId, r.id, 'unattended')
  // Se resuelve en cuanto haya respuesta real o el lead avance: cualquier alerta abierta de un lead que ya no cumpla la condición.
  const stillUnattendedIds = new Set((unattended as any[]).map((r) => r.id))
  const openUnattended = await db
    .select({ leadId: schema.leadSlaAlerts.leadId })
    .from(schema.leadSlaAlerts)
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.type, 'unattended'), eq(schema.leadSlaAlerts.status, 'open')))
  for (const r of openUnattended as any[]) if (!stillUnattendedIds.has(r.leadId)) await resolveAlert(db, orgId, r.leadId, 'unattended', 'auto')

  // 2) Cualificado sin próxima acción: sin nextActionAt futuro, umbral cumplido desde qualifiedAt.
  // qualifiedAt se compara en memoria (pocas filas por org) en vez de duplicar la lógica de umbral en SQL para una columna nullable.
  const qualifiedThreshold = minutesAgo(settings.qualifiedWithoutActionHours * 60)
  const qualifiedRows = await db
    .select({ id: schema.leads.id, qualifiedAt: schema.leads.qualifiedAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), isNull(schema.leads.nextActionAt), ne(schema.leads.status, 'lost')))
  const dueQualified = (qualifiedRows as any[]).filter((r) => r.qualifiedAt && r.qualifiedAt < qualifiedThreshold)
  for (const r of dueQualified) await openAlert(db, orgId, r.id, 'qualified_no_action')
  const dueQualifiedIds = new Set(dueQualified.map((r) => r.id))
  const openQualified = await db
    .select({ leadId: schema.leadSlaAlerts.leadId })
    .from(schema.leadSlaAlerts)
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.type, 'qualified_no_action'), eq(schema.leadSlaAlerts.status, 'open')))
  for (const r of openQualified as any[]) if (!dueQualifiedIds.has(r.leadId)) await resolveAlert(db, orgId, r.leadId, 'qualified_no_action', 'auto')

  // 3) Sin contacto X días: última interacción real (lastContactAt) supera el umbral, lead sigue activo.
  const inactiveThreshold = minutesAgo(settings.inactiveLeadDays * 24 * 60)
  const inactive = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), ne(schema.leads.status, 'lost'), ne(schema.leads.stage, 'won'), lt(schema.leads.lastContactAt, inactiveThreshold)))
  for (const r of inactive as any[]) await openAlert(db, orgId, r.id, 'inactive')
  const inactiveIds = new Set((inactive as any[]).map((r) => r.id))
  const openInactive = await db
    .select({ leadId: schema.leadSlaAlerts.leadId })
    .from(schema.leadSlaAlerts)
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.type, 'inactive'), eq(schema.leadSlaAlerts.status, 'open')))
  for (const r of openInactive as any[]) if (!inactiveIds.has(r.leadId)) await resolveAlert(db, orgId, r.leadId, 'inactive', 'auto')
}
