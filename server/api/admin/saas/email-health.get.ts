import { and, desc, eq, gte } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { cfEnv, useDb, schema } from '../../../utils/db'
import { EMAIL_HEALTH_WINDOW_DAYS, summarizeEmailHealth } from '../../../utils/email/health'

/**
 * GET /api/admin/saas/email-health — estado real del canal de email de esta
 * organización, para que un fallo de envío deje de ser invisible.
 *
 * No envía nada ni toca Resend: sólo resume las filas que `email_log` ya tiene
 * (server/utils/email/health.ts). Lo único que se consulta fuera de D1 es si
 * existe el secreto RESEND_API_KEY, porque sin él no sale ni un email y
 * conviene decirlo con esas palabras en vez de dejar 200 filas "En cola".
 */

/** Techo de filas a resumir. Una organización sana envía muchas menos en una semana; el límite existe para que una que se haya vuelto loca no convierta esto en una consulta cara. */
const MAX_ROWS = 1000

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const since = new Date(Date.now() - EMAIL_HEALTH_WINDOW_DAYS * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)

  const rows = await db
    .select({
      status: schema.emailLog.status,
      errorMessage: schema.emailLog.errorMessage,
      createdAt: schema.emailLog.createdAt,
    })
    .from(schema.emailLog)
    .where(and(eq(schema.emailLog.organizationId, orgId), gte(schema.emailLog.createdAt, since)))
    .orderBy(desc(schema.emailLog.id))
    .limit(MAX_ROWS)

  // Booleano, nunca el valor: el secreto no sale de aquí ni en una respuesta
  // de administración.
  const connected = Boolean(cfEnv(event).RESEND_API_KEY)

  return summarizeEmailHealth(rows, { connected })
})
