import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { generateContent, CONTENT_KINDS, type ContentKind } from '../../../utils/ai'
import { rateLimit } from '../../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
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
  // The generated copy quotes the project's real name, price and description
  // back to the caller — reading it by bare id would hand another tenant's
  // catalog data to whoever guessed the number.
  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, id), eq(schema.developerProperties.organizationId, orgId)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const { text, engine } = await generateContent(event, kind, project)
  return { text, engine, kind }
})
