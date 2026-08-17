import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { answerQuestion } from '../../utils/ai'
import { rateLimit } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  // Each call can hit a paid LLM API (see server/utils/ai.ts) — cap it well before the
  // rest of the form-abuse limits, since the cost per request is much higher here.
  await rateLimit(event, 'ask', { limit: 15, windowSeconds: 3600 })

  const body = await readBody<{ slug?: string; id?: number; question?: string }>(event)
  const question = (body?.question || '').trim()
  if (!question) throw createError({ statusCode: 422, statusMessage: 'question is required' })
  if (question.length > 300) throw createError({ statusCode: 422, statusMessage: 'question too long' })

  const db = useDb(event)
  const P = schema.developerProperties
  // The answer quotes the project's real data back to the caller, so the
  // lookup is confined to the tenant that owns this hostname — a bare slug/id
  // would otherwise let anyone read another agency's listing through the
  // assistant.
  const orgId = resolvePublicOrgId(event)
  const rows = await db
    .select()
    .from(P)
    .where(and(body?.slug ? eq(P.slug, String(body.slug)) : eq(P.id, Number(body?.id)), eq(P.organizationId, orgId)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const { text, engine } = await answerQuestion(event, question, project)
  return { text, engine }
})
