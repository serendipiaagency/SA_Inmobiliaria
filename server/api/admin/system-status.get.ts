import { and, desc, eq, gte } from 'drizzle-orm'
import { requireSuperAdmin } from '../../utils/auth'
import { cfEnv, useDb, schema } from '../../utils/db'
import { checkDatabaseHealth, checkStorageHealth } from '../../utils/health'
import { EMAIL_HEALTH_WINDOW_DAYS, summarizeEmailHealth } from '../../utils/email/health'
import { CHANNELS, isChannelImplemented } from '../../utils/publication/channels'
import { buildSystemStatus, TRACKED_SECRETS } from '../../utils/systemStatus'

/**
 * GET /api/admin/system-status — qué integraciones de la plataforma están
 * vivas, dormidas o mal configuradas, en una sola respuesta.
 *
 * **super_admin únicamente**: esto no son datos de un inquilino sino la
 * configuración de la plataforma entera, y decir qué secretos faltan es
 * información de operación, no de negocio. Va como `super-admin` en
 * server/utils/adminRouteMatrix.ts.
 *
 * De los secretos sólo viaja su *presencia*, nunca su valor ni un fragmento:
 * la única operación que se hace sobre ellos es `Boolean(...)`.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const env = cfEnv(event)
  const db = useDb(event)

  const secrets: Record<string, boolean> = {}
  for (const name of TRACKED_SECRETS) secrets[name] = Boolean((env as Record<string, any>)[name])

  const since = new Date(Date.now() - EMAIL_HEALTH_WINDOW_DAYS * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
  const [database, storage, emailRows] = await Promise.all([
    checkDatabaseHealth(env.DB),
    checkStorageHealth(env.MEDIA),
    // Plataforma entera, no una organización: esta pantalla es del
    // super_admin y la pregunta que responde es "¿sale el correo?", no
    // "¿sale el correo de esta agencia?".
    db
      .select({ status: schema.emailLog.status, errorMessage: schema.emailLog.errorMessage, createdAt: schema.emailLog.createdAt })
      .from(schema.emailLog)
      .where(and(gte(schema.emailLog.createdAt, since), eq(schema.emailLog.provider, 'resend')))
      .orderBy(desc(schema.emailLog.id))
      .limit(1000),
  ])

  return buildSystemStatus({
    secrets,
    database,
    storage,
    channels: { total: CHANNELS.length, implemented: CHANNELS.filter((c) => isChannelImplemented(c.key)).length },
    email: summarizeEmailHealth(emailRows, { connected: Boolean(env.RESEND_API_KEY) }),
    build: useRuntimeConfig(event).buildInfo,
  })
})
