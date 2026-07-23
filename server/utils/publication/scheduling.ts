import { now } from '../db'
import { priorityWeight } from './channels'

/** Same 'YYYY-MM-DD HH:MM:SS' text format every other table in this project uses. */
export function computeRunAt(baseIso: string, offsetMinutes: number): string {
  const base = new Date(baseIso.includes('T') ? baseIso : baseIso.replace(' ', 'T') + 'Z')
  const d = Number.isFinite(base.getTime()) ? base : new Date()
  d.setUTCMinutes(d.getUTCMinutes() + (offsetMinutes || 0))
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export interface TemplateStep {
  channelKey: string
  offsetMinutes: number
  priority?: string
  action?: 'publish' | 'update_images' | 'update_text' | 'unpublish'
  dependsOnChannelKey?: string
  condition?: { type: string; value: number } | null
}

export interface BuildJobsInput {
  organizationId: number
  scheduleId: number
  baseScheduledAt: string
  steps: TemplateStep[]
  channelConfigByKey: Record<string, { maxRetries: number; retryBackoffSeconds: number; maxDurationSeconds: number }>
}

/**
 * Turns a staged-launch sequence (template steps or a manually built one)
 * into concrete PublicationJob rows. `dependsOnChannelKey` is resolved to a
 * real `dependsOnJobId` here since jobs don't exist yet when steps are
 * authored — the caller inserts these rows and gets back real ids to link.
 */
export function buildJobRows(input: BuildJobsInput) {
  const nowTs = now()
  const jobsByChannel: Record<string, number> = {} // channelKey -> index into the returned array
  const rows = input.steps.map((step, i) => {
    jobsByChannel[step.channelKey] = i
    const cfg = input.channelConfigByKey[step.channelKey]
    return {
      organizationId: input.organizationId,
      scheduleId: input.scheduleId,
      channelKey: step.channelKey,
      runAt: computeRunAt(input.baseScheduledAt, step.offsetMinutes || 0),
      offsetMinutes: step.offsetMinutes || 0,
      priority: step.priority || 'normal',
      priorityWeight: priorityWeight(step.priority),
      dependsOnChannelKeyRef: step.dependsOnChannelKey || null, // resolved to an id by the caller after insert
      conditionJson: step.condition ? JSON.stringify(step.condition) : null,
      status: 'pending' as const,
      action: step.action || ('publish' as const),
      maxRetries: cfg?.maxRetries ?? 3,
      retryCount: 0,
      retryBackoffSeconds: cfg?.retryBackoffSeconds ?? 300,
      maxDurationSeconds: cfg?.maxDurationSeconds ?? 120,
      createdAt: nowTs,
      updatedAt: nowTs,
    }
  })
  return { rows, jobsByChannel }
}

export function addBackoff(baseSeconds: number, attemptNumber: number): number {
  // Exponential backoff, capped at 6h so a flaky channel doesn't push a retry days out.
  return Math.min(baseSeconds * 2 ** Math.max(0, attemptNumber - 1), 6 * 60 * 60)
}
