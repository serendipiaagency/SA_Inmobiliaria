import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface AvailabilityRuleInput {
  dayOfWeek?: number
  startTime?: string
  endTime?: string
}

/** Replaces an agent's whole weekly schedule in one call — simplest contract for a grid editor that submits the full week at once. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const agentId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(agentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const agentRows = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, agentId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
  if (!agentRows[0]) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })

  const body = await readBody<{ slotDurationMinutes?: number; bufferMinutes?: number; maxAppointmentsPerDay?: number | null; rules?: AvailabilityRuleInput[] }>(event)
  const rules = Array.isArray(body?.rules) ? body.rules : []
  for (const r of rules) {
    if (!Number.isInteger(r.dayOfWeek) || r.dayOfWeek! < 0 || r.dayOfWeek! > 6) throw createError({ statusCode: 422, statusMessage: 'dayOfWeek debe ser 0-6' })
    if (!TIME_RE.test(r.startTime || '') || !TIME_RE.test(r.endTime || '')) throw createError({ statusCode: 422, statusMessage: 'Formato de hora inválido (HH:MM)' })
    if (r.startTime! >= r.endTime!) throw createError({ statusCode: 422, statusMessage: 'La hora de inicio debe ser anterior a la de fin' })
  }

  const memberPatch: Record<string, any> = {}
  if (body?.slotDurationMinutes !== undefined) {
    const duration = Number(body.slotDurationMinutes)
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) throw createError({ statusCode: 422, statusMessage: 'Duración de cita inválida' })
    memberPatch.slotDurationMinutes = duration
  }
  if (body?.bufferMinutes !== undefined) {
    const buffer = Number(body.bufferMinutes)
    if (!Number.isFinite(buffer) || buffer < 0 || buffer > 240) throw createError({ statusCode: 422, statusMessage: 'Buffer inválido' })
    memberPatch.bufferMinutes = buffer
  }
  if (body?.maxAppointmentsPerDay !== undefined) {
    if (body.maxAppointmentsPerDay === null) {
      memberPatch.maxAppointmentsPerDay = null
    } else {
      const max = Number(body.maxAppointmentsPerDay)
      if (!Number.isFinite(max) || max < 1 || max > 100) throw createError({ statusCode: 422, statusMessage: 'Tope diario inválido' })
      memberPatch.maxAppointmentsPerDay = max
    }
  }
  if (Object.keys(memberPatch).length) {
    memberPatch.updatedAt = now()
    await db.update(schema.teamMembers).set(memberPatch).where(eq(schema.teamMembers.id, agentId))
  }

  await db.delete(schema.agentAvailability).where(and(eq(schema.agentAvailability.organizationId, orgId), eq(schema.agentAvailability.agentId, agentId)))
  if (rules.length) {
    const nowTs = now()
    await db.insert(schema.agentAvailability).values(
      rules.map((r) => ({ organizationId: orgId, agentId, dayOfWeek: r.dayOfWeek!, startTime: r.startTime!, endTime: r.endTime!, createdAt: nowTs })),
    )
  }

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'agent-availability', resourceId: agentId })
  return { ok: true }
})
