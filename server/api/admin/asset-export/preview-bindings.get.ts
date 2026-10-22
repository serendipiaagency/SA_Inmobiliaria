import { requireOrgScope } from '../../../utils/auth'
import { resolveAssetBindings } from '../../../utils/assetExport/bindings'

/**
 * GET /api/admin/asset-export/preview-bindings?assetKind=&assetId=
 *
 * Resuelve los datos REALES de una propiedad (valores + URLs de imagen) para
 * que el editor visual muestre el documento con su contenido de verdad en vez
 * de `{{tokens}}`. Reutiliza `resolveAssetBindings` (el mismo resolver que usa
 * la exportación del PDF), así que lo que se ve en el lienzo coincide con lo
 * que se descargará. Sólo lectura; respeta el aislamiento multi-tenant
 * (resolveAssetBindings valida que la propiedad sea de la organización).
 *
 * Las imágenes del binding vienen como clave R2, `/api/media/<clave>` o URL
 * externa; aquí se normalizan a una URL que el navegador puede cargar.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const assetKind = String(q.assetKind || '')
  const assetId = Number(q.assetId || 0)
  if (!['developer_property', 'agent_property'].includes(assetKind) || !Number.isInteger(assetId) || assetId <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'assetKind y assetId válidos son obligatorios' })
  }

  const { values, images } = await resolveAssetBindings(event, { orgId, assetKind, assetId })

  const toUrl = (v: string | null) => (!v ? null : /^https?:\/\//i.test(v) || v.startsWith('/api/media/') ? v : `/api/media/${v}`)
  const imageUrls: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(images)) imageUrls[k] = toUrl(v)

  return { values, images: imageUrls }
})
