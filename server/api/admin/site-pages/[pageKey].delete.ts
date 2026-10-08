import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { requireValidPageKey, resetSitePage } from '../../../utils/sitePages'

/**
 * «Volver a la página original» (server/utils/sitePages.ts → resetSitePage):
 * quita la versión del Constructor de esa página — la web vuelve a servir el
 * contenido de siempre de esa dirección y el borrador, la siembra. El
 * historial de versiones se conserva y se puede restaurar.
 *
 * Es un DELETE sobre la página y no una ruta nueva a propósito: cada ruta de
 * la API es una clave más en el tipado de `$fetch` de Nitro, y el proyecto
 * está en el límite de lo que TypeScript puede resolver (TS2589 en decenas de
 * llamadas con una sola ruta más). Un método nuevo en una ruta que ya existe
 * no añade clave.
 */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const doc = await resetSitePage(db, orgId, pageKey)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'site-pages', resourceId: pageKey, detail: 'reset' })

  return { ok: true, ...doc }
})
