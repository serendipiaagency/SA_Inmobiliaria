import { normalizeSiteConsent, type SiteConsentConfig } from '~/utils/siteConsent'

/** Lo que devuelve GET /api/public/site-consent: la configuración publicada y lo público de la empresa. */
export interface PublicSiteConsent extends SiteConsentConfig {
  logo: string | null
  brandColor: string | null
  companyName: string
}

/**
 * La presentación publicada del aviso de cookies y del aviso de demostración
 * de la web que se visita (utils/siteConsent.ts), leída una vez por página
 * en el servidor y compartida por los dos avisos (misma clave de
 * useAsyncData). Si la lectura falla, los avisos de partida: el
 * consentimiento se pide igual, con el aspecto de siempre.
 */
export async function useSiteConsent() {
  const fetcher = useRequestFetch()
  const { data } = await useAsyncData<PublicSiteConsent | null>('site-consent', () => fetcher<PublicSiteConsent>('/api/public/site-consent').catch(() => null))
  const config = computed(() => normalizeSiteConsent(data.value))
  const logo = computed(() => data.value?.logo ?? null)
  const brandColor = computed(() => data.value?.brandColor ?? null)
  return { data, config, logo, brandColor }
}
