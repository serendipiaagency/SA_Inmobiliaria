import type { H3Event } from 'h3'
import { cfEnv, now } from './db'
import * as schema from '../db/schema'
import { drizzle } from 'drizzle-orm/d1'

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'run' | 'pause' | 'resume' | 'retry' | 'duplicate' | 'priority'

/**
 * Records a write action to admin_audit_log — "who did what, to which
 * record, when" (migrations/0028). Called from the generic admin CRUD
 * chokepoint (create/update/delete/restore) and from the Publication
 * Scheduler's mutating endpoints, which don't go through that chokepoint.
 *
 * Best-effort by design: a logging failure must never break the action it's
 * describing (same contract as server/plugins/error-logging.ts).
 */
export async function logAdminAction(
  event: H3Event,
  params: {
    user: { id: number; email: string }
    orgId: number | null
    action: AuditAction
    resource: string
    resourceId?: string | number | null
    detail?: string
  },
): Promise<void> {
  try {
    const db = drizzle(cfEnv(event).DB, { schema })
    await db.insert(schema.adminAuditLog).values({
      organizationId: params.orgId,
      userId: params.user.id,
      userEmail: params.user.email,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId != null ? String(params.resourceId) : null,
      detail: params.detail || null,
      ip: getRequestHeader(event, 'cf-connecting-ip') || getRequestIP(event) || null,
      createdAt: now(),
    })
  } catch (err) {
    console.error('Failed to write admin_audit_log', err)
  }
}
