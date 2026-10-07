import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { requireOrgScope, type SessionUser } from '../auth'
import { cfEnv, schema, useDb } from '../db'
import { logAdminAction } from '../audit'
import { OrgSenderError, orgSenderView, saveOrgSender, verifyOrgSender } from './orgSender'
import { assertNotDemoExternal } from '../demo/tenant'

/**
 * Capa HTTP del remitente de empresa. Sin rutas nuevas (presupuesto de rutas
 * de Nitro = 0): GET /api/admin/saas/email-health?view=sender y
 * POST /api/admin/saas/settings { section: 'email-sender' }, ambas en el área
 * `system` de la matriz RBAC (lectura y escritura respectivamente).
 *
 * La empresa es la de la sesión. Sólo un super_admin puede indicar otra
 * (`organizationId`, desde Sistemas > Empresas > ficha > Email), y tiene que
 * existir — mismo criterio que la subida del logo.
 */
async function targetOrg(event: H3Event, requested: unknown): Promise<{ user: SessionUser; orgId: number }> {
  const { user, orgId } = await requireOrgScope(event)
  if (requested == null || requested === '') return { user, orgId }
  if (user.role !== 'super_admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const id = Number(requested)
  const [org] = Number.isInteger(id) && id > 0 ? await useDb(event).select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1) : []
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Empresa no encontrada' })
  return { user, orgId: org.id }
}

function errorResponse(event: H3Event, e: OrgSenderError) {
  setResponseStatus(event, e.statusCode)
  return { ok: false as const, error: { field: e.field, message: e.message } }
}

export async function handleOrgSenderView(event: H3Event) {
  const { orgId } = await targetOrg(event, getQuery(event).organizationId)
  try {
    return await orgSenderView(useDb(event), cfEnv(event) as Record<string, any>, orgId)
  } catch (e) {
    if (e instanceof OrgSenderError) return errorResponse(event, e)
    throw e
  }
}

export async function handleOrgSenderWrite(event: H3Event, body: Record<string, any>) {
  const { user, orgId } = await targetOrg(event, body?.organizationId)
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  // Cuenta demo: no da de alta dominios en la cuenta de Resend de la plataforma.
  await assertNotDemoExternal(db, orgId)
  try {
    const result = body?.action === 'verify' ? await verifyOrgSender(db, env, orgId) : await saveOrgSender(db, env, orgId, body || {}, user)
    await logAdminAction(event, { user, orgId, action: body?.action === 'verify' ? 'run' : 'update', resource: 'organizations', resourceId: orgId, detail: result.detail })
    return { ok: true as const, ...result.view }
  } catch (e) {
    if (e instanceof OrgSenderError) return errorResponse(event, e)
    throw e
  }
}
