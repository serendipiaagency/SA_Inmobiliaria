import { useDb, resolvePublicOrgId } from '../../utils/db'
import { getPublishedFooter, loadFooterAvailability, loadFooterProfile } from '../../utils/siteFooter'

/**
 * GET /api/public/site-footer — el pie de la web que se visita: sólo la
 * versión publicada (o, sin publicar, el de partida), los datos públicos de
 * contacto de la empresa (teléfono, ciudad, redes) y qué páginas existen, para
 * no enlazar a ninguna que no esté. Nada del borrador ni del panel.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [config, profile, available] = await Promise.all([getPublishedFooter(db, orgId), loadFooterProfile(db, orgId), loadFooterAvailability(db, orgId)])
  return { config, profile, available }
})
