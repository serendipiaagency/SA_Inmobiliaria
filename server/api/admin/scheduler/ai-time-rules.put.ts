import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'

/** Updates this org's AI-time auto-apply rule (autoApply/minConfidence/minSampleSize), upserting if it doesn't exist yet. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = await readBody<{ autoApply?: boolean; minConfidence?: number; minSampleSize?: number }>(event)

  const minConfidence = body?.minConfidence !== undefined ? Math.min(1, Math.max(0, Number(body.minConfidence))) : undefined
  const minSampleSize = body?.minSampleSize !== undefined ? Math.max(1, Math.round(Number(body.minSampleSize))) : undefined
  if (minConfidence !== undefined && Number.isNaN(minConfidence)) throw createError({ statusCode: 422, statusMessage: 'minConfidence inválido' })
  if (minSampleSize !== undefined && Number.isNaN(minSampleSize)) throw createError({ statusCode: 422, statusMessage: 'minSampleSize inválido' })

  const nowTs = now()
  const existing = await db.select({ id: schema.publicationAiTimeRules.id }).from(schema.publicationAiTimeRules).where(eq(schema.publicationAiTimeRules.organizationId, orgId)).limit(1)

  const patch: Record<string, any> = { updatedAt: nowTs }
  if (body?.autoApply !== undefined) patch.autoApply = body.autoApply ? 1 : 0
  if (minConfidence !== undefined) patch.minConfidence = minConfidence
  if (minSampleSize !== undefined) patch.minSampleSize = minSampleSize

  if (existing[0]) {
    await db.update(schema.publicationAiTimeRules).set(patch).where(eq(schema.publicationAiTimeRules.id, existing[0].id))
  } else {
    await db.insert(schema.publicationAiTimeRules).values({
      organizationId: orgId,
      autoApply: patch.autoApply ?? 0,
      minConfidence: patch.minConfidence ?? 0.6,
      minSampleSize: patch.minSampleSize ?? 5,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
  }

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'scheduler-ai-time-rule' })
  return { ok: true }
})
