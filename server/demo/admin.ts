import { createError, type H3Event } from 'h3'
import type { SessionUser } from '../utils/auth'
import { cfEnv, useDb } from '../utils/db'
import { logAdminAction } from '../utils/audit'
import { advanceDemoProvisioning, demoProvisioningStatus, requestDemoProvisioning, type DemoProgress } from './runner'
import { DEMO_ORG_SLUG } from './purge'

/**
 * Sistemas > Empresas > Cuenta demo (sólo super admin; el que llama ya pasó
 * por requireSuperAdmin): ver cómo va, crearla, avanzar un tramo,
 * restablecerla y regenerarla.
 *
 *  - Restablecer (`demo-reset`, pide `confirm: true`): NO destructivo. Quita
 *    lo que hayan dejado los visitantes (filas y ficheros), vuelve al estado
 *    sembrado desde su instantánea (mismas imágenes) y ejecuta los eventos que
 *    el código haya añadido desde entonces. Una demo sembrada antes de las
 *    instantáneas se regenera entera esta primera vez.
 *  - Regenerar (`demo-regenerate`, pide escribir el identificador de la
 *    empresa): destructivo. Borra todo, ficheros incluidos, y vuelve a sembrar
 *    la historia anclada a hoy.
 */
export async function handleDemoAction(event: H3Event, user: SessionUser, body: Record<string, any>): Promise<DemoProgress> {
  const db = useDb(event)
  const env = cfEnv(event) as unknown as Record<string, any>
  switch (body.action) {
    case 'demo-status':
      return demoProvisioningStatus(db, Date.now(), env)
    case 'demo-create': {
      const requested = await requestDemoProvisioning(db, { mode: 'create', trigger: 'admin' }, env)
      if (requested.status === 'ready' || requested.busy) return requested
      await logAdminAction(event, { user, orgId: requested.orgId, action: 'create', resource: 'organization', resourceId: requested.orgId, detail: 'Cuenta demo: creación solicitada' })
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    }
    case 'demo-advance':
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    case 'demo-reset': {
      if (body.confirm !== true) throw createError({ statusCode: 422, statusMessage: 'Confirma el restablecimiento de la demo' })
      const requested = await requestDemoProvisioning(db, { mode: 'restore', trigger: 'admin' }, env)
      if (requested.busy) throw createError({ statusCode: 409, statusMessage: 'La demo está ocupada ahora mismo: espera a que termine el tramo en curso' })
      const detail =
        requested.status === 'restoring'
          ? 'Cuenta demo: restablecimiento (vuelta a la instantánea sembrada, sin tocar las imágenes)'
          : 'Cuenta demo: restablecimiento (sin instantánea: regeneración completa)'
      await logAdminAction(event, { user, orgId: requested.orgId, action: 'update', resource: 'organization', resourceId: requested.orgId, detail })
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    }
    case 'demo-regenerate': {
      if (body.confirm !== DEMO_ORG_SLUG) throw createError({ statusCode: 422, statusMessage: `Para regenerar la demo escribe «${DEMO_ORG_SLUG}»` })
      const requested = await requestDemoProvisioning(db, { mode: 'regenerate', trigger: 'admin' }, env)
      if (requested.busy) throw createError({ statusCode: 409, statusMessage: 'La demo está ocupada ahora mismo: espera a que termine el tramo en curso' })
      await logAdminAction(event, { user, orgId: requested.orgId, action: 'update', resource: 'organization', resourceId: requested.orgId, detail: 'Cuenta demo: regeneración completa (borrado y nueva siembra anclada a hoy)' })
      return advanceDemoProvisioning(env, { trigger: 'admin' })
    }
    default:
      throw createError({ statusCode: 400, statusMessage: 'Acción de la cuenta demo no reconocida' })
  }
}
