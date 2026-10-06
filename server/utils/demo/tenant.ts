import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'

/**
 * La cuenta demo comercial («Norte Astur Inmobiliaria»): una empresa normal
 * del producto marcada como demo para el propio sistema.
 *
 * La marca es `organizations.registration_source = 'demo'`: el mismo campo
 * que ya dice CÓMO nació cada empresa (alta del super admin o autorregistro),
 * con un origen más, el aprovisionamiento de la demo. No hay columna nueva.
 * Nada que decida el acceso lee ese campo
 * (server/utils/organizations/access.ts), así que la demo entra como
 * cualquier otra empresa activa.
 *
 * Lo que la marca activa está en un solo sitio, `isDemoOrg()`, y lo consultan
 * los puntos por los que algo sale de la plataforma: emails, webhooks, avisos
 * de citas por WhatsApp/SMS, la bandeja de WhatsApp, las llamadas y los cobros
 * de Stripe. En la demo esas acciones se registran como NO enviadas, con un
 * motivo visible; nunca se simulan como hechas.
 */
export const DEMO_REGISTRATION_SOURCE = 'demo'

/** Lo que ve quien intenta enviar algo desde la demo. */
export const DEMO_BLOCKED_MESSAGE = 'Cuenta de demostración: no se envía nada fuera de la plataforma.'

export function isDemoOrganizationRow(org: { registrationSource?: string | null } | null | undefined): boolean {
  return org?.registrationSource === DEMO_REGISTRATION_SOURCE
}

// Una consulta por empresa y minuto como mucho: los envíos la miran en cada
// intento, y la marca sólo cambia al crear la demo.
const CACHE_TTL_MS = 60_000
const demoCache = new Map<number, { demo: boolean; at: number }>()

export async function isDemoOrg(db: any, orgId: number | null | undefined): Promise<boolean> {
  if (!orgId) return false
  const hit = demoCache.get(orgId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.demo
  const [row] = await db
    .select({ registrationSource: schema.organizations.registrationSource })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  const demo = isDemoOrganizationRow(row)
  demoCache.set(orgId, { demo, at: Date.now() })
  return demo
}

export function forgetDemoOrgCache(orgId?: number): void {
  if (orgId == null) demoCache.clear()
  else demoCache.delete(orgId)
}

/** Para los endpoints: corta la acción con un 409 y el motivo, en lugar de llamar al proveedor. */
export async function assertNotDemoExternal(db: any, orgId: number | null | undefined): Promise<void> {
  if (await isDemoOrg(db, orgId)) {
    throw createError({ statusCode: 409, statusMessage: DEMO_BLOCKED_MESSAGE, data: { reason: 'demo_tenant' } })
  }
}
