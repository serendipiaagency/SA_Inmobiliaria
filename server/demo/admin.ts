import { createError, type H3Event } from 'h3'
import type { SessionUser } from '../utils/auth'
import { cfEnv, useDb } from '../utils/db'
import { logAdminAction } from '../utils/audit'
import { advanceDemoProvisioning, demoProvisioningStatus, requestDemoProvisioning, type DemoProgress } from './runner'
import { DEMO_ORG_SLUG } from './purge'

/**
 * Sistemas > Empresas > Cuenta demo (sólo super admin; el que llama ya pasó
 * por requireSuperAdmin): ver cómo va, crearla, avanzar un tramo y
 * restablecerla. Restablecer borra los datos de la empresa demo y la vuelve a
 * sembrar anclada a hoy: pide escribir el identificador de la empresa.
 */
export async function handleDemoAction(event: H3Event, user: SessionUser, body: Record<string, any>): Promise<DemoProgress> {
  const db = useDb(event)
  const env = cfEnv(event) as unknown as Record<string, any>
  switch (body.action) {
    case 'demo-status':
      return demoProvisioningStatus(db)
    case 'demo-create': {
      const requested = await requestDemoProvisioning(db, { reset: false, trigger: 'admin' })
      if (requested.status === 'ready' || requested.busy) return requested
      await logAdminAction(event, { user, orgId: requested.orgId, action: 'create', resource: 'organization', resourceId: requested.orgId, detail: 'Cuenta demo: creación solicitada' })
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    }
    case 'demo-advance':
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    case 'demo-reset': {
      if (body.confirm !== DEMO_ORG_SLUG) throw createError({ statusCode: 422, statusMessage: `Para restablecer la demo escribe «${DEMO_ORG_SLUG}»` })
      const requested = await requestDemoProvisioning(db, { reset: true, trigger: 'admin' })
      if (requested.busy) throw createError({ statusCode: 409, statusMessage: 'La demo se está generando ahora mismo: espera a que termine el tramo en curso' })
      await logAdminAction(event, { user, orgId: requested.orgId, action: 'update', resource: 'organization', resourceId: requested.orgId, detail: 'Cuenta demo: restablecimiento (borrado y nueva siembra)' })
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    }
    default:
      throw createError({ statusCode: 400, statusMessage: 'Acción de la cuenta demo no reconocida' })
  }
}
