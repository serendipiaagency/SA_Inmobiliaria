import type { InjectionKey, Ref } from 'vue'
import { DEFAULT_AGENCY_CURRENCY } from '~/utils/currency'
import type { CookieProviders } from '~/utils/cookieConsent'

export interface TenantBranding {
  id: number
  name: string
  companyName: string | null
  logo: string | null
  brandColor: string | null
  /** True only on a request that matched a real per-org custom domain — see server/api/public/tenant.get.ts. */
  isCustomDomain: boolean
  /** Data-controller identity for the public privacy/terms pages — nullable until an org fills these in. */
  legalCompanyName: string | null
  taxId: string | null
  legalAddress: string | null
  legalEmail: string | null
  legalPhone: string | null
  /** Núcleo N8a: el chat de la web pública, si la agencia lo activó (Comunicaciones → Configuración). */
  webChat?: { enabled: boolean; greeting: string | null }
  /** Moneda de la agencia (Configuración → Moneda): la base en la que están los precios — ver utils/currency.ts. */
  currency?: string
  /** Vista previa de una empresa sin dominio, sólo para su equipo (server/utils/sitePreview.ts). */
  preview?: boolean
  /** Cuenta demo: sin llamadas ni mensajes reales (plugins/demo-links.client.ts). */
  isDemo?: boolean
  /** Proveedores sujetos al aviso de cookies que configuró la agencia (utils/cookieConsent.ts). */
  cookies?: CookieProviders
}

/** Domain-resolved branding for the public site (see server/middleware/00.tenant.ts). */
export function useTenant() {
  const tenant = useState<TenantBranding | null>('tenant-branding', () => null)

  async function load() {
    if (tenant.value) return
    try {
      const req = useRequestFetch()
      tenant.value = await req<TenantBranding>('/api/public/tenant')
    } catch {
      tenant.value = {
        id: 1,
        name: 'M&M Real Estate',
        companyName: 'M&M Real Estate',
        logo: null,
        brandColor: null,
        isCustomDomain: false,
        legalCompanyName: null,
        taxId: null,
        legalAddress: null,
        legalEmail: null,
        legalPhone: null,
        webChat: { enabled: false, greeting: null },
        currency: DEFAULT_AGENCY_CURRENCY,
      }
    }
  }

  return { tenant, load }
}

/**
 * En el lienzo del Constructor (pages/admin/site-builder/canvas.vue), la marca
 * de la empresa que se edita —no la del dominio del panel—: la proveen el
 * lienzo y la usan las secciones que pintan con el color de marca (el Hero).
 */
export const TENANT_BRANDING_OVERRIDE: InjectionKey<Ref<TenantBranding | null>> = Symbol('tenant-branding-override')
