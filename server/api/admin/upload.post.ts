import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../utils/auth'
import { schema, useDb } from '../../utils/db'
import { storeAndRegisterFile } from '../../utils/media'
import type { MediaCategory } from '../../utils/mediaAssets'

// `property-media`: renders, drone, 360 y PDF de la multimedia de una propiedad (FASE 7, bloque N7a).
const PROPERTY_PHOTO_FOLDERS = new Set(['developer-properties', 'properties', 'floor-plans', 'project-images', 'gallery-images', 'social-media', 'property-media'])
const LOGO_FOLDERS = new Set(['brand-kit', 'developers', 'agents', 'team', 'organizations'])
// Logo de empresa: sólo imagen (nunca PDF) y como mucho 2 MB.
const LOGO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const LOGO_MAX_BYTES = 2 * 1024 * 1024

function categoryFor(folder: string): MediaCategory {
  if (PROPERTY_PHOTO_FOLDERS.has(folder)) return 'property-photo'
  if (LOGO_FOLDERS.has(folder)) return 'logo'
  return 'upload'
}

/**
 * Generic image upload for the admin catalog forms (logos, cover photos,
 * floor-plan images, master plans, community imagery…). Everything here ends
 * up embedded on the public site, so it's registered `visibility: 'public'` —
 * cacheable, no auth required to read back — but it's still a real,
 * quota-counted, tenant-owned `media_assets` row, not an anonymous R2 write.
 *
 * Video no longer goes through here — a single request holding the whole
 * file (up to 100MB) in memory was the exact problem P1-8
 * (docs/production-hardening-audit.md) fixed. See
 * server/api/admin/upload/multipart/ for the chunked replacement, used by
 * components/property-builder/VideoField.vue.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folder')
  const folder = (folderPart ? new TextDecoder().decode(folderPart.data) : 'uploads').replace(/[^a-z0-9_-]/gi, '') || 'uploads'

  const db = useDb(event)
  // Sistemas > Empresas (alta y ficha): el super admin sube el logo DE OTRA
  // empresa, así que el fichero tiene que quedar a nombre de esa empresa
  // (su cuota, su media_assets), no de la que tenga activa en el selector.
  // Sólo un super_admin puede apuntar a otra organización, y tiene que existir.
  let targetOrgId = orgId
  const orgPart = parts?.find((p) => p.name === 'organizationId')
  if (orgPart) {
    if (user.role !== 'super_admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    const requested = Number(new TextDecoder().decode(orgPart.data))
    const [org] = Number.isInteger(requested) && requested > 0 ? await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, requested)).limit(1) : []
    if (!org) throw createError({ statusCode: 404, statusMessage: 'Empresa no encontrada' })
    targetOrgId = org.id
  }
  const isOrgLogo = folder === 'organizations'
  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: targetOrgId,
    visibility: 'public',
    category: categoryFor(folder),
    entityType: folder,
    createdBy: user.id,
    ...(isOrgLogo ? { allowedTypes: LOGO_TYPES, maxBytes: LOGO_MAX_BYTES } : {}),
  })
  return { key: stored.key, url: `/api/media/${stored.key}` }
})
