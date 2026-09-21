import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { isUniqueConstraintError, now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

/**
 * POST /api/admin/comms/templates — registra a mano una plantilla ya
 * aprobada en el proveedor (Meta: nombre + idioma exactos; Twilio: Content
 * SID HX…). El cuerpo con {{1}}… sirve para previsualizar y rellenar.
 *
 * Body: { channelId: number; name: string; language?: string; body: string; category?: string; contentSid?: string }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const body = (await readBody(event)) || {}
  const channelId = Number(body.channelId)
  const channels = await db
    .select({ id: schema.commsChannels.id, provider: schema.commsChannels.provider })
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.id, channelId), eq(schema.commsChannels.organizationId, orgId)))
    .limit(1)
  const channel = channels[0]
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  const name = String(body.name || '')
    .trim()
    .toLowerCase()
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw createError({ statusCode: 422, statusMessage: 'El nombre de la plantilla es el de Meta: minúsculas, números y guiones bajos.' })
  const text = String(body.body || '').trim()
  if (!text) throw createError({ statusCode: 422, statusMessage: 'Pega el texto aprobado de la plantilla (con sus {{1}}, {{2}}…).' })
  const contentSid = body.contentSid ? String(body.contentSid).trim() : null
  if (channel.provider === 'twilio' && !/^HX[0-9a-f]{32}$/i.test(contentSid || '')) throw createError({ statusCode: 422, statusMessage: 'Una plantilla de Twilio necesita su Content SID (HX…).' })
  const nowTs = now()
  try {
    const [row] = await db
      .insert(schema.commsTemplates)
      .values({
        organizationId: orgId,
        channelId,
        name,
        language: String(body.language || 'es').slice(0, 10),
        category: body.category ? String(body.category).slice(0, 40) : null,
        body: text.slice(0, 2000),
        status: 'approved',
        externalId: contentSid,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning()
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'comms-template', resourceId: row.id, detail: name })
    return { ok: true, template: row }
  } catch (e: any) {
    if (isUniqueConstraintError(e)) throw createError({ statusCode: 409, statusMessage: 'Ya hay una plantilla con ese nombre e idioma en este canal.' })
    throw e
  }
})
