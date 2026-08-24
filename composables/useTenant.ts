interface TenantBranding {
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
      }
    }
  }

  return { tenant, load }
}
