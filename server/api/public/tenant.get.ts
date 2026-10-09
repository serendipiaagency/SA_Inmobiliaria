import { eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { getCommsSettings } from '../../utils/comms/inbox'
import { organizationCurrency } from '../../utils/currency'
import { isDemoOrg } from '../../utils/demo/tenant'
import { getCookieProviders } from '../../utils/siteSettings'
import { NO_COOKIE_PROVIDERS } from '../../../utils/cookieConsent'

/**
 * Public branding for the resolved tenant — consumed by useTenant() to
 * render Logo.vue, page <head>, and (via `isCustomDomain`) to decide
 * whether `/` should render the platform's own marketing page or this
 * tenant's real-estate portal home (pages/index.vue).
 *
 * `isCustomDomain` is true only when server/middleware/00.tenant.ts matched
 * this request's Host against a real `organizations.domain` row — never on
 * the primary/default host (*.workers.dev, localhost, PRIMARY_DOMAIN),
 * where event.context.org is deliberately left unset.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const isCustomDomain = Boolean((event.context as any).org)
  const orgId = resolvePublicOrgId(event)
  const rows = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      companyName: schema.organizations.companyName,
      logo: schema.organizations.logo,
      brandColor: schema.organizations.brandColor,
      // Data-controller identity for the public privacy/terms pages (task 12) —
      // nullable, so those pages show "por confirmar" until an org fills them in.
      legalCompanyName: schema.organizations.legalCompanyName,
      taxId: schema.organizations.taxId,
      legalAddress: schema.organizations.legalAddress,
      legalEmail: schema.organizations.legalEmail,
      legalPhone: schema.organizations.legalPhone,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  // Núcleo N8a: si la agencia activó el chat de su web (Comunicaciones →
  // Configuración). Sólo el interruptor y el saludo, que son públicos.
  const chat = await getCommsSettings(db, orgId).catch(() => null)
  // La moneda de la agencia es la BASE de los precios de su web: el selector
  // del visitante convierte desde ella (utils/currency.ts). Es un ajuste
  // público por naturaleza — cada precio publicado ya la lleva.
  const currency = await organizationCurrency(db, orgId)
  return {
    // Vista previa de una empresa sin dominio (server/utils/sitePreview.ts). La web se ve tal cual, sin
    // franjas; sólo el aviso de cookies cambia: guarda la elección en una clave aparte y no carga analítica.
    preview: Boolean((event.context as any).sitePreview),
    // Cuenta demo: la web neutraliza los enlaces que llamarían o escribirían de verdad (plugins/demo-links.client.ts).
    isDemo: await isDemoOrg(db, orgId).catch(() => false),
    webChat: { enabled: Boolean(chat?.webChatEnabled), greeting: chat?.webChatGreeting ?? null },
    currency,
    // Proveedores sujetos al aviso de cookies (Constructor Web → Cookies). IDs públicos: acaban en el HTML.
    cookies: await getCookieProviders(db, orgId).catch(() => NO_COOKIE_PROVIDERS),
    ...(rows[0] || {
      id: 1,
      name: 'M&M Real Estate',
      companyName: 'M&M Real Estate',
      logo: null,
      brandColor: null,
      legalCompanyName: null,
      taxId: null,
      legalAddress: null,
      legalEmail: null,
      legalPhone: null,
    }),
    isCustomDomain,
  }
})
