import { and, eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { executeJob } from '../../../utils/publication/dispatcher'

/** POST /api/admin/scheduler/run — Fase 4 ("publicar inmediatamente") + Fase 16. Executes a job right now, synchronously, bypassing its scheduled run_at (dependency/condition gates still apply implicitly via the channel adapter's own real state). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ jobId?: number }>(event)
  const jobId = Number(body?.jobId)
  if (!jobId) throw createError({ statusCode: 422, statusMessage: 'jobId es obligatorio' })

  const db = useDb(event)
  const rows = await db.select().from(schema.publicationJobs).where(and(eq(schema.publicationJobs.id, jobId), eq(schema.publicationJobs.organizationId, orgId))).limit(1)
  const job = rows[0]
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job no encontrado' })
  if (!['pending', 'paused', 'failed'].includes(job.status)) throw createError({ statusCode: 422, statusMessage: `No se puede ejecutar un job en estado "${job.status}"` })

  const env = cfEnv(event) as any
  const { outcome, result } = await executeJob(db, env, job, `manual-${user.id}-${Date.now()}`)
  return { ok: true, outcome, message: result?.message }
})
