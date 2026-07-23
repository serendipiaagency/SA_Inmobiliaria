interface TenantBranding {
  id: number
  name: string
  companyName: string | null
  logo: string | null
  brandColor: string | null
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
      tenant.value = { id: 1, name: 'M&M Real Estate', companyName: 'M&M Real Estate', logo: null, brandColor: null }
    }
  }

  return { tenant, load }
}
