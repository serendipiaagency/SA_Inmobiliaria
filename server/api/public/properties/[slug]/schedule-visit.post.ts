import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { upsertLead } from '../../../../utils/leads'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const body = await readBody<{ name?: string; email?: string; phone?: string; scheduledAt?: string; channel?: string; notes?: string }>(event)
  if (!body?.name || !body?.scheduledAt) throw createError({ statusCode: 422, statusMessage: 'name and scheduledAt are required' })
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
