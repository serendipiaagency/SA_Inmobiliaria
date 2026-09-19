import { and, desc, eq, gte } from 'drizzle-orm'
import { requireSuperAdmin } from '../../utils/auth'
import { cfEnv, useDb, schema } from '../../utils/db'
import { checkDatabaseHealth, checkStorageHealth } from '../../utils/health'
import { EMAIL_HEALTH_WINDOW_DAYS, summarizeEmailHealth } from '../../utils/email/health'
import { CHANNELS, isChannelImplemented } from '../../utils/publication/channels'
import { buildSystemStatus, TRACKED_SECRETS } from '../../utils/systemStatus'
import { summarizeDomainHealth, type DomainHealthRow } from '../../utils/domainMonitor'

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
  const [database, storage, domainRows, emailRows] = await Promise.all([
    checkDatabaseHealth(env.DB),
    checkStorageHealth(env.MEDIA),
    // Cada dominio configurado con su ÚLTIMA comprobación (o ninguna, si la
    // tarea todavía no ha corrido para él). SQL crudo por el subselect
    // correlacionado: la sintaxis es la misma en D1 y en el SQLite de las
    // pruebas. Sin parámetros de usuario.
    env.DB.prepare(
      `SELECT o.id AS organizationId, o.domain AS domain, c.ok AS ok, c.error AS error, c.checked_at AS checkedAt
         FROM organizations o
         LEFT JOIN domain_checks c
           ON c.id = (SELECT id FROM domain_checks WHERE organization_id = o.id ORDER BY id DESC LIMIT 1)
        WHERE o.domain IS NOT NULL AND o.status = 'active'
        ORDER BY o.id`,
    ).all<{ organizationId: number; domain: string; ok: number | null; error: string | null; checkedAt: string | null }>(),
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

  // Un dominio sin comprobación todavía cuenta como "no comprobado", no
  // como caído: `checkedAt` nulo lo deja fuera de `lastCheckedAt` y `ok`
  // nulo no se lista como fallo.
  const domainHealth: DomainHealthRow[] = (domainRows.results || [])
    .filter((r) => r.checkedAt !== null)
    .map((r) => ({ domain: r.domain, organizationId: r.organizationId, ok: r.ok === 1, error: r.error, checkedAt: r.checkedAt! }))
  const configuredDomains = (domainRows.results || []).length
  const domains = summarizeDomainHealth(domainHealth)
  domains.total = configuredDomains

  return buildSystemStatus({
    secrets,
    database,
    storage,
    channels: { total: CHANNELS.length, implemented: CHANNELS.filter((c) => isChannelImplemented(c.key)).length },
    email: summarizeEmailHealth(emailRows, { connected: Boolean(env.RESEND_API_KEY) }),
    domains,
    build: useRuntimeConfig(event).buildInfo,
  })
})
