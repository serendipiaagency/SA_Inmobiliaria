import { and, asc, eq, lte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { runChannelAdapter } from './adapters'
import { evaluateCondition } from './conditions'
import { addBackoff } from './scheduling'
import { CHANNEL_BY_KEY } from './channels'

const BATCH_SIZE = 25

function localHM(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  } catch {
    return date.toISOString().slice(11, 16)
  }
}

/** Handles overnight windows too (e.g. 22:00-06:00). No window configured = always allowed. */
function isWithinWindow(date: Date, timeZone: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return true
  const hm = localHM(date, timeZone)
  return start <= end ? hm >= start && hm <= end : hm >= start || hm <= end
}

/** Dependency + condition + channel-enabled/window gates. Used by the automatic dispatcher only — a manual "run now" bypasses timing gates but still calls executeJob directly. */
async function checkGates(db: any, job: any, nowDate: Date): Promise<{ pass: boolean; schedule?: any }> {
  if (job.dependsOnJobId) {
    const dep = await db.select({ status: schema.publicationJobs.status }).from(schema.publicationJobs).where(eq(schema.publicationJobs.id, job.dependsOnJobId)).limit(1)
    if (!dep[0] || dep[0].status !== 'success') return { pass: false }
  }

  const scheduleRows = await db.select().from(schema.publicationSchedules).where(eq(schema.publicationSchedules.id, job.scheduleId)).limit(1)
  const sched = scheduleRows[0]
  if (!sched) return { pass: false }

  const cond = await evaluateCondition(db, sched.developerPropertyId, job.conditionJson)
  if (!cond.met) return { pass: false, schedule: sched }

  const cfgRows = await db
    .select()
    .from(schema.publicationChannelConfigs)
    .where(and(eq(schema.publicationChannelConfigs.organizationId, job.organizationId), eq(schema.publicationChannelConfigs.channelKey, job.channelKey)))
    .limit(1)
  const cfg = cfgRows[0]
  if (cfg && !cfg.enabled) return { pass: false, schedule: sched }
  if (cfg && !isWithinWindow(nowDate, sched.timezone || 'UTC', cfg.windowStart, cfg.windowEnd)) return { pass: false, schedule: sched }

  return { pass: true, schedule: sched }
}

/**
 * Runs one job right now: claims it, calls its channel adapter, and records
 * the real outcome (success / scheduled retry with backoff / exhausted
 * failure) — history, execution log, and an internal notification. Shared by
 * the automatic dispatcher tick and the manual "run now" API action so both
 * paths produce identical, real records.
 */
export async function executeJob(db: any, env: Record<string, any>, job: any, runId: string) {
  const nowTs = now()
  const scheduleRows = await db.select().from(schema.publicationSchedules).where(eq(schema.publicationSchedules.id, job.scheduleId)).limit(1)
  const sched = scheduleRows[0]
  if (!sched) return { outcome: 'skipped' as const }

  await db.insert(schema.publicationQueue).values({ jobId: job.id, claimedAt: nowTs, claimedBy: runId, createdAt: nowTs })
  await db.update(schema.publicationJobs).set({ status: 'running', updatedAt: nowTs }).where(eq(schema.publicationJobs.id, job.id))
  await db.insert(schema.publicationHistory).values({
    organizationId: job.organizationId,
    scheduleId: job.scheduleId,
    jobId: job.id,
    event: 'job_running',
    message: `Ejecutando ${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey}...`,
    createdAt: nowTs,
  })

  const property = await db
    .select({ id: schema.developerProperties.id, slug: schema.developerProperties.slug, name: schema.developerProperties.name })
    .from(schema.developerProperties)
    .where(eq(schema.developerProperties.id, sched.developerPropertyId))
    .limit(1)

  const startedAt = now()
  const t0 = Date.now()
  const result = await runChannelAdapter({
    channelKey: job.channelKey,
    action: job.action,
    property: property[0] || { id: sched.developerPropertyId, slug: null, name: 'Propiedad' },
    externalId: job.externalId,
    env,
  })
  const finishedAt = now()

  await db.insert(schema.publicationExecutions).values({
    jobId: job.id,
    attemptNumber: job.retryCount + 1,
    startedAt,
    finishedAt,
    result: result.ok ? 'success' : 'error',
    connected: result.connected ? 1 : 0,
    responseSummary: result.ok ? result.message : null,
    errorMessage: result.ok ? null : result.message,
    durationMs: Date.now() - t0,
  })

  let outcome: 'success' | 'retrying' | 'failed'
  if (result.ok) {
    outcome = 'success'
    await db
      .update(schema.publicationJobs)
      .set({ status: 'success', externalId: result.externalId || job.externalId, lastError: null, updatedAt: finishedAt })
      .where(eq(schema.publicationJobs.id, job.id))
    await db.insert(schema.publicationHistory).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      event: 'job_success',
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey}: ${result.message}`,
      createdAt: finishedAt,
    })
    await db.insert(schema.publicationNotifications).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      type: 'job_success',
      channel: 'internal',
      delivered: 1,
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey} publicado correctamente.`,
      createdAt: finishedAt,
    })
  } else if (job.retryCount < job.maxRetries) {
    outcome = 'retrying'
    const nextAttempt = job.retryCount + 1
    const backoff = addBackoff(job.retryBackoffSeconds, nextAttempt)
    const nextRunAt = new Date(Date.now() + backoff * 1000).toISOString().replace('T', ' ').slice(0, 19)
    await db
      .update(schema.publicationJobs)
      .set({ status: 'pending', retryCount: nextAttempt, runAt: nextRunAt, lastError: result.message, updatedAt: finishedAt })
      .where(eq(schema.publicationJobs.id, job.id))
    await db.insert(schema.publicationRetries).values({
      jobId: job.id,
      attemptNumber: nextAttempt,
      scheduledAt: nextRunAt,
      backoffSeconds: backoff,
      executed: 0,
      createdAt: finishedAt,
    })
    await db.insert(schema.publicationHistory).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      event: 'job_retrying',
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey}: fallo (${result.message}). Reintento ${nextAttempt}/${job.maxRetries} programado en ${Math.round(backoff / 60)} min.`,
      createdAt: finishedAt,
    })
    await db.insert(schema.publicationNotifications).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      type: 'job_retrying',
      channel: 'internal',
      delivered: 1,
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey} falló, reintentando (${nextAttempt}/${job.maxRetries}).`,
      createdAt: finishedAt,
    })
  } else {
    outcome = 'failed'
    await db.update(schema.publicationJobs).set({ status: 'failed', lastError: result.message, updatedAt: finishedAt }).where(eq(schema.publicationJobs.id, job.id))
    await db.insert(schema.publicationHistory).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      event: 'job_failed',
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey}: fallo definitivo tras ${job.maxRetries} reintentos (${result.message}).`,
      createdAt: finishedAt,
    })
    await db.insert(schema.publicationNotifications).values({
      organizationId: job.organizationId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      type: 'job_failed',
      channel: 'internal',
      delivered: 1,
      message: `${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey} falló definitivamente.`,
      createdAt: finishedAt,
    })
  }

  await maybeCompleteSchedule(db, job.scheduleId, job.organizationId)
  return { outcome, result }
}

/**
 * One dispatch tick: claims every due job whose gates pass, executes it, and
 * records the real outcome. Runs on a 1-minute Cron Trigger
 * (server/tasks/scheduler/dispatch.ts) — a plain D1-backed queue, not
 * Cloudflare Queues (see module README).
 */
export async function runDispatchTick(db: any, env: Record<string, any>, runId: string) {
  const nowTs = now()
  const nowDate = new Date()

  const due = await db
    .select()
    .from(schema.publicationJobs)
    .where(and(eq(schema.publicationJobs.status, 'pending'), lte(schema.publicationJobs.runAt, nowTs)))
    .orderBy(asc(schema.publicationJobs.priorityWeight), asc(schema.publicationJobs.runAt))
    .limit(BATCH_SIZE)

  let processed = 0
  let succeeded = 0
  let failed = 0
  let retried = 0
  let skipped = 0

  for (const job of due) {
    const gate = await checkGates(db, job, nowDate)
    if (!gate.pass) {
      skipped++
      continue
    }

    const { outcome } = await executeJob(db, env, job, runId)
    processed++
    if (outcome === 'success') succeeded++
    else if (outcome === 'retrying') retried++
    else if (outcome === 'failed') failed++
  }

  return { processed, succeeded, failed, retried, skipped, dueCount: due.length }
}

/** Flips a schedule to completed/failed once every one of its jobs reaches a terminal state. */
async function maybeCompleteSchedule(db: any, scheduleId: number, organizationId: number) {
  const jobs = await db.select({ status: schema.publicationJobs.status }).from(schema.publicationJobs).where(eq(schema.publicationJobs.scheduleId, scheduleId))
  if (!jobs.length) return
  const terminal = new Set(['success', 'failed', 'cancelled', 'skipped'])
  if (!jobs.every((j: any) => terminal.has(j.status))) return

  const anyFailed = jobs.some((j: any) => j.status === 'failed')
  const nowTs = now()
  await db
    .update(schema.publicationSchedules)
    .set({ status: anyFailed ? 'failed' : 'completed', updatedAt: nowTs })
    .where(eq(schema.publicationSchedules.id, scheduleId))
  await db.insert(schema.publicationHistory).values({
    organizationId,
    scheduleId,
    jobId: null,
    event: 'schedule_completed',
    message: anyFailed ? 'Programación finalizada con errores.' : 'Programación completada correctamente.',
    createdAt: nowTs,
  })
}
