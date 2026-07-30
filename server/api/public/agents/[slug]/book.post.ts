import { and, eq } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId } from '../../../../utils/db'
import { isSlotAvailable } from '../../../../utils/appointments/availability'
import { upsertLead } from '../../../../utils/leads'
import { rateLimit } from '../../../../utils/rateLimit'
import { isValidEmail, isValidPhone } from '../../../../utils/validate'

const VALID_CHANNELS = ['in_person', 'video', 'phone'] as const
const SLOT_START_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

interface BookAppointmentBody {
  name?: string
  email?: string
  phone?: string
  startAt?: string
  channel?: string
  propertyId?: number
  notes?: string
}

/** Books a real appointment with an agent — re-validates the slot server-side, never trusts the client's picker state. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'book-appointment', { limit: 8, windowSeconds: 600 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const body = await readBody<BookAppointmentBody>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'name es obligatorio' })
  if (!body?.startAt || !SLOT_START_RE.test(body.startAt)) throw createError({ statusCode: 422, statusMessage: 'startAt inválido' })
  if (!body?.email && !body?.phone) throw createError({ statusCode: 422, statusMessage: 'email o phone es obligatorio' })
  if (body.email && !isValidEmail(body.email)) throw createError({ statusCode: 422, statusMessage: 'Email inválido' })
  if (body.phone && !isValidPhone(body.phone)) throw createError({ statusCode: 422, statusMessage: 'Teléfono inválido' })
  const channel = (VALID_CHANNELS as readonly string[]).includes(body.channel || '') ? (body.channel as string) : 'in_person'

  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

  const agentRows = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.slug, slug), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })

  const available = await isSlotAvailable(db, orgId, agent.id, body.startAt, agent.slotDurationMinutes)
  if (!available) throw createError({ statusCode: 409, statusMessage: 'Ese horario ya no está disponible, elige otro.' })

  let propertyId: number | null = null
  let propertyName: string | null = null
  if (body.propertyId) {
    const propRows = await db
      .select({ id: schema.developerProperties.id, name: schema.developerProperties.name })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, Number(body.propertyId)), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
    if (propRows[0]) {
      propertyId = propRows[0].id
      propertyName = propRows[0].name
    }
  }

  const endsAt = new Date(new Date(`${body.startAt.replace(' ', 'T')}Z`).getTime() + agent.slotDurationMinutes * 60_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  const contactLine = [body.email && `Email: ${body.email}`, body.phone && `Tel: ${body.phone}`].filter(Boolean).join(' · ')
  const nowTs = now()
  const [visit] = await db
    .insert(schema.visits)
    .values({
      organizationId: orgId,
      clientName: name,
      propertyId,
      propertyName,
      agentId: agent.id,
      agentName: agent.name,
      scheduledAt: body.startAt,
      durationMinutes: agent.slotDurationMinutes,
      endsAt,
      status: 'scheduled',
      channel,
      notes: [contactLine, body.notes].filter(Boolean).join('\n') || null,
      createdAt: nowTs,
    })
    .returning({ id: schema.visits.id, scheduledAt: schema.visits.scheduledAt })

  try {
    await upsertLead(event, {
      organizationId: orgId,
      name,
      email: body.email || null,
      phone: body.phone || null,
      source: 'web',
      propertyId,
      propertyName,
      agentId: agent.id,
      agentName: agent.name,
      notes: `Cita agendada con ${agent.name} (${channel})`,
      scoreBump: 25,
    })
  } catch {
    // La cita ya quedó guardada — el pipeline de leads nunca debe bloquearla.
  }

  return { ok: true, visitId: visit.id, scheduledAt: visit.scheduledAt, endsAt }
})
