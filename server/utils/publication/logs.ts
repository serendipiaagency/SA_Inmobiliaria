import * as schema from '../../db/schema'
import { now } from '../db'

interface LogPublicationEventInput {
  organizationId: number
  level?: 'info' | 'warn' | 'error'
  message: string
  jobId?: number | null
  scheduleId?: number | null
  actorUserId?: number | null
  context?: Record<string, unknown>
}

/**
 * Structured, queryable log line for the scheduler (publication_logs) —
 * distinct from publication_history, which is the human-readable per-schedule
 * timeline shown in the admin UI. This is the low-level trail Fase 17's
 * "seguridad/auditoría" requirement points at: every dispatcher decision
 * (including gate skips, which never make it into publication_history)
 * lands here with full context for later querying/alerting.
 */
export async function logPublicationEvent(db: any, input: LogPublicationEventInput) {
  await db.insert(schema.publicationLogs).values({
    organizationId: input.organizationId,
    level: input.level || 'info',
    message: input.message,
    jobId: input.jobId ?? null,
    scheduleId: input.scheduleId ?? null,
    actorUserId: input.actorUserId ?? null,
    contextJson: input.context ? JSON.stringify(input.context) : null,
    createdAt: now(),
  })
}
