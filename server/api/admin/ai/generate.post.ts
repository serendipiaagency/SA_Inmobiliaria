import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { generateContent, CONTENT_KINDS, type ContentKind } from '../../../utils/ai'
import { rateLimit } from '../../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  // Real $ cost per call once AI_API_KEY is configured — bound it so a bug
  // or a compromised session can't run up an unbounded AI bill.
  await rateLimit(event, 'ai-generate', { limit: 30, windowSeconds: 600 })
  const body = await readBody<{ id?: number; kind?: ContentKind }>(event)
  const id = Number(body?.id)
  const kind = body?.kind
  if (!id || !kind || !CONTENT_KINDS.some((k) => k.key === kind)) {
    throw createError({ statusCode: 422, statusMessage: 'id and valid kind are required' })
  }
  const db = useDb(event)
  const rows = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, id)).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const { text, engine } = await generateContent(event, kind, project)
  return { text, engine, kind }
})
