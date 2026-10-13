import { useDb, resolvePublicOrgId } from '../../utils/db'
import { publicOffices } from '../../utils/publicOffices'
import { publicCompanyProfile } from '../../utils/publicCompany'

/**
 * GET /api/public/offices — las oficinas publicadas de la inmobiliaria del
 * host (proyección pública, docs/home-corporativa.md) y el perfil público de
 * la empresa, para la página /oficinas y sus datos estructurados.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [offices, company] = await Promise.all([publicOffices(db, orgId), publicCompanyProfile(db, orgId)])
  setHeader(event, 'Cache-Control', 'private, max-age=120')
  return { offices, company }
})
