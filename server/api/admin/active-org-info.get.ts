import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireOrgScope } from '../../utils/auth'
import { organizationCurrencySetting } from '../../utils/currency'
import { agencyCurrencyOrDefault } from '../../../utils/currency'
import { isDemoOrg } from '../../utils/demo/tenant'

/**
 * The logged-in admin's own (or currently switched-to, for super_admin) organization's branding.
 *
 * También la moneda de la agencia (Configuración → Moneda, AED si nunca se
 * eligió): con ella pinta el panel todos los importes (`useAgencyCurrency`).
 * Va aquí y no en `/api/admin/saas/settings` porque esta ruta la puede leer
 * cualquier cuenta del panel (metadatos del shell), y Configuración es del
 * área Sistema: un comercial sin ese permiso vería los precios en una moneda
 * que no es la de su agencia.
 *
 * `recordCurrency` es la moneda por defecto de un registro nuevo con moneda
 * propia (oferta, depósito): la elegida o, sin ajuste, `eur` como antes —
 * ver `defaultRecordCurrency()` en server/utils/currency.ts.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, companyName: schema.organizations.companyName, logo: schema.organizations.logo, brandColor: schema.organizations.brandColor, domain: schema.organizations.domain })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  const chosen = await organizationCurrencySetting(db, orgId).catch(() => null)
  return {
    ...(rows[0] || { id: orgId, name: 'M&M Real Estate', companyName: 'M&M Real Estate', logo: null, brandColor: null, domain: null }),
    currency: agencyCurrencyOrDefault(chosen),
    // Cuenta demo (server/utils/demo/tenant.ts): el panel lo indica y neutraliza tel:/mailto:/WhatsApp.
    isDemo: await isDemoOrg(db, orgId).catch(() => false),
    recordCurrency: (chosen || 'EUR').toLowerCase(),
  }
})
