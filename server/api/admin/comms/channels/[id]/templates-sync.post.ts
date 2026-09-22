import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { metaListTemplates } from '../../../../../utils/comms/providers/metaCloud'

/** POST /api/admin/comms/channels/:id/templates-sync — trae las plantillas de la WABA (Meta) con su estado real de aprobación. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const channel = await loadChannel(db, env, { id: Number(getRouterParam(event, 'id')), orgId })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  if (channel.provider !== 'meta_cloud') throw createError({ statusCode: 409, statusMessage: 'Sólo los canales de Meta pueden sincronizar plantillas; en Twilio se registran a mano con su Content SID.' })
  const r = await metaListTemplates(channel, env)
  if (!r.ok) throw createError({ statusCode: 502, statusMessage: r.error || 'Meta no devolvió plantillas' })

  const nowTs = now()
  let created = 0
  let updated = 0
  for (const t of r.templates) {
    if (!t.body) continue
    const status = t.status.toLowerCase()
    const normalized = ['approved', 'pending', 'rejected', 'paused'].includes(status) ? status : 'unknown'
    const existing = await db
      .select({ id: schema.commsTemplates.id })
      .from(schema.commsTemplates)
      .where(and(eq(schema.commsTemplates.channelId, channel.id), eq(schema.commsTemplates.name, t.name), eq(schema.commsTemplates.language, t.language)))
      .limit(1)
    if (existing[0]) {
      await db.update(schema.commsTemplates).set({ body: t.body, category: t.category, status: normalized, externalId: t.externalId, syncedAt: nowTs, updatedAt: nowTs }).where(eq(schema.commsTemplates.id, existing[0].id))
      updated++
    } else {
      await db.insert(schema.commsTemplates).values({ organizationId: orgId, channelId: channel.id, name: t.name, language: t.language, category: t.category, body: t.body, status: normalized, externalId: t.externalId, syncedAt: nowTs, createdAt: nowTs, updatedAt: nowTs })
      created++
    }
  }
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-channel', resourceId: channel.id, detail: `templates-sync:${created}+${updated}` })
  return { ok: true, created, updated, total: r.templates.length }
})
