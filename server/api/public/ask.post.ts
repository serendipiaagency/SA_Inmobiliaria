import { eq, or } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { answerQuestion } from '../../utils/ai'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string; id?: number; question?: string }>(event)
  const question = (body?.question || '').trim()
  if (!question) throw createError({ statusCode: 422, statusMessage: 'question is required' })
  if (question.length > 300) throw createError({ statusCode: 422, statusMessage: 'question too long' })

  const db = useDb(event)
  const P = schema.developerProperties
  const rows = await db
    .select()
    .from(P)
    .where(body?.slug ? eq(P.slug, String(body.slug)) : eq(P.id, Number(body?.id)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const { text, engine } = await answerQuestion(event, question, project)
  return { text, engine }
})
