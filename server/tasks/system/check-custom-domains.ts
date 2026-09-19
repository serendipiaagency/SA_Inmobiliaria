import { and, desc, eq, isNotNull, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { checkDomain, domainAlertKind, DOMAIN_CHECK_RETENTION_DAYS, isDomainCheckMinute } from '../../utils/domainMonitor'
import { postOpsAlert } from '../../utils/alerts'
import { sendInternalNotification, sendTransactionalEmail } from '../../utils/email/send'

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Comprueba cada 10 minutos que cada dominio personalizado sigue llegando a
 * su agencia (server/utils/domainMonitor.ts explica qué se mira y por qué).
 *
 * Va montada sobre el cron por minuto que ya existe ("* * * * *", el del
 * despachador de publicaciones y los recordatorios de citas) y se sale en
 * los minutos que no tocan, en vez de añadir un sexto Cron Trigger: el
 * límite de triggers por Worker es pequeño y ya están los cinco en uso.
 *
 * Avisa sólo al cambiar de estado (caído ↔ recuperado), por tres vías que
 * ya existían: el webhook de incidencias (ERROR_ALERT_WEBHOOK_URL), el
 * buzón interno de la propia agencia (sus destinatarios de avisos) y el
 * correo de cada super_admin de la plataforma. Si ninguna está configurada
 * el resultado queda igualmente en domain_checks y en Estado del sistema.
 *
 * Cross-tenant a propósito, como toda tarea programada: un Cron Trigger no
 * tiene petición ni sesión de ninguna agencia.
 */
export default defineTask<
  | { skipped: true; reason: string }
  | { checked: number; ok: number; failing: number; alerts: number; pruned: number }
>({
  meta: {
    name: 'system:check-custom-domains',
    description: 'Every 10 min: verifies each custom domain still routes to its organization and alerts on state changes',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const nowDate = new Date()
    if (!isDomainCheckMinute(nowDate)) return { result: { skipped: true, reason: 'Not a check minute' } }

    const db = drizzle(env.DB as D1Database, { schema })
    const orgs = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name, domain: schema.organizations.domain, status: schema.organizations.status })
      .from(schema.organizations)
      .where(and(isNotNull(schema.organizations.domain), eq(schema.organizations.status, 'active')))

    let ok = 0
    let failing = 0
    let alerts = 0

    for (const org of orgs) {
      const domain = org.domain!
      const [previous] = await db
        .select({ ok: schema.domainChecks.ok })
        .from(schema.domainChecks)
        .where(eq(schema.domainChecks.organizationId, org.id))
        .orderBy(desc(schema.domainChecks.id))
        .limit(1)

      const result = await checkDomain(domain, org.id)
      await db.insert(schema.domainChecks).values({
        organizationId: org.id,
        domain,
        ok: result.ok ? 1 : 0,
        httpStatus: result.httpStatus,
        latencyMs: result.latencyMs,
        error: result.error,
        checkedAt: fmt(nowDate),
      })
      if (result.ok) ok++
      else failing++

      const kind = domainAlertKind(previous ? previous.ok === 1 : null, result.ok)
      if (!kind) continue
      alerts++

      const summary =
        kind === 'failed'
          ? `🔴 Dominio caído: https://${domain} (${org.name}) — ${result.error}`
          : `🟢 Dominio recuperado: https://${domain} (${org.name}) vuelve a responder`
      await postOpsAlert(env, summary)

      const template = kind === 'failed' ? 'domain_check_failed' : 'domain_check_recovered'
      const data = { domain, organizationName: org.name, error: result.error, checkedAt: fmt(nowDate) }
      try {
        // La propia agencia, a su buzón interno (si lo tiene configurado)…
        await sendInternalNotification(db, env, org.id, template, data)
        // …y cada super_admin de la plataforma, que es quien puede arreglar
        // el enrutado. Se envía con la identidad de la agencia afectada para
        // que el remitente diga de quién es el dominio.
        const superAdmins = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.role, 'super_admin'))
        if (superAdmins.length) {
          await sendTransactionalEmail(db, env, { organizationId: org.id, template, to: superAdmins.map((u) => u.email), data })
        }
      } catch (err) {
        // El aviso por correo es la tercera vía, no la única: si Resend no
        // está o falla, el resultado ya consta en domain_checks y el webhook
        // ya ha salido. Un fallo aquí no debe parar el resto de dominios.
        console.error('check-custom-domains: email alert failed', err)
      }
    }

    const cutoff = fmt(new Date(nowDate.getTime() - DOMAIN_CHECK_RETENTION_DAYS * 86_400_000))
    const pruned = await db.delete(schema.domainChecks).where(lt(schema.domainChecks.checkedAt, cutoff)).returning({ id: schema.domainChecks.id })

    return { result: { checked: orgs.length, ok, failing, alerts, pruned: pruned.length } }
  },
})
