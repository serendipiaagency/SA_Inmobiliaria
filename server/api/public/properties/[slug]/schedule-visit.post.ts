import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { upsertLead } from '../../../../utils/leads'
import { rateLimit } from '../../../../utils/rateLimit'
import { isValidEmail, isValidPhone } from '../../../../utils/validate'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'schedule-visit', { limit: 8, windowSeconds: 600 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const body = await readBody<{ name?: string; email?: string; phone?: string; scheduledAt?: string; channel?: string; notes?: string }>(event)
  if (!body?.name || !body?.scheduledAt) throw createError({ statusCode: 422, statusMessage: 'name and scheduledAt are required' })
  // At least one real contact channel is required — otherwise the visit can't actually be
  // confirmed with the requester, and it silently skips the leads dedupe (upsertLead only
  // matches by email), letting the leads/visits tables grow unbounded with unreachable rows.
  if (!body.email && !body.phone) {
    throw createError({ statusCode: 422, statusMessage: 'email or phone is required' })
  }
  if (body.email && !isValidEmail(body.email)) throw createError({ statusCode: 422, statusMessage: 'Invalid email' })
  if (body.phone && !isValidPhone(body.phone)) throw createError({ statusCode: 422, statusMessage: 'Invalid phone' })
  const channel = (['in_person', 'video', 'phone'] as const).includes(body.channel as any) ? body.channel : 'in_person'

  const db = useDb(event)
  const rows = await db.select({ id: schema.developerProperties.id, name: schema.developerProperties.name }).from(schema.developerProperties).where(eq(schema.developerProperties.slug, slug)).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const contactLine = [body.email && `Email: ${body.email}`, body.phone && `Tel: ${body.phone}`].filter(Boolean).join(' · ')
  await db.insert(schema.visits).values({
    clientName: body.name,
    propertyId: project.id,
    propertyName: project.name,
    scheduledAt: body.scheduledAt,
    status: 'scheduled',
    channel: channel as string,
    notes: [contactLine, body.notes].filter(Boolean).join('\n') || null,
    createdAt: now(),
  })

  try {
    await upsertLead(event, {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      source: 'web',
      propertyId: project.id,
      propertyName: project.name,
      notes: `Visita agendada (${channel})`,
      scoreBump: 25,
    })
  } catch {
    // Lead pipeline must never block the visit request from being saved.
  }

  return { ok: true }
})
