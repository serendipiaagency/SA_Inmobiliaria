import { useDb, resolvePublicOrgId } from '../../utils/db'
import { getPublishedConsent, loadConsentProfile } from '../../utils/siteConsent'

/**
 * GET /api/public/site-consent — la presentación del aviso de cookies y del
 * aviso de demostración de la web que se visita: sólo la versión publicada
 * (o, sin publicar, la de partida) y lo público que el aviso toma de la
 * empresa (logo, color de marca, nombre). Nada del borrador ni del panel; los
 * datos legales que faltan no salen de aquí (la web ya los pone «por
 * confirmar» en sus páginas legales).
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [config, profile] = await Promise.all([getPublishedConsent(db, orgId), loadConsentProfile(db, orgId)])
  return { ...config, logo: profile.logo, brandColor: profile.brandColor, companyName: profile.companyName }
})
