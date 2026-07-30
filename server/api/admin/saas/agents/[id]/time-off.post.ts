import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const agentId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(agentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const agentRows = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, agentId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
  if (!agentRows[0]) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })

  const body = await readBody<{ date?: string; reason?: string }>(event)
  if (!DATE_RE.test(body?.date || '')) throw createError({ statusCode: 422, statusMessage: 'date debe ser YYYY-MM-DD' })

  const [row] = await db
    .insert(schema.agentTimeOff)
    .values({ organizationId: orgId, agentId, date: body!.date!, reason: body?.reason?.slice(0, 200) || null, createdAt: now() })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'agent-time-off', resourceId: row.id })
  return { ok: true, data: row }
})
