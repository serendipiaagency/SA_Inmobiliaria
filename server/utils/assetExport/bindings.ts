import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, cfEnv } from '../db'
import { getOrCreateAssetQrUrl } from './qrLinks'

export interface AssetBindings {
  values: Record<string, string>
  /** R2 keys (not URLs) for image-type bindings, resolved separately since the renderer needs raw bytes. */
  images: Record<string, string | null>
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return 'Precio a consultar'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price)
}

/**
 * Resolves every {{asset.*}} / {{tenant.*}} token a template can reference
 * against the real developer_properties row + the org's Brand Kit — no
 * fabricated values. A field that genuinely has no data (no description, no
 * agent) resolves to an empty string rather than invented placeholder text,
 * so a template that binds it just renders that area blank.
 */
export async function resolveAssetBindings(
  event: H3Event,
  params: { orgId: number; assetKind: string; assetId: number },
): Promise<AssetBindings> {
  const db = useDb(event)
  if (params.assetKind !== 'developer_property') {
    throw createError({ statusCode: 400, statusMessage: `Unsupported assetKind: ${params.assetKind}` })
  }

  const rows = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, params.assetId)).limit(1)
  const asset = rows[0]
  if (!asset || asset.organizationId !== params.orgId) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const brandKitRows = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organizationId, params.orgId)).limit(1)
  const brandKit = brandKitRows[0] || null

  const orgRows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, params.orgId)).limit(1)
  const org = orgRows[0] || null

  const origin = getRequestURL(event).origin
  const publicUrl = asset.slug ? `${origin}/property-details/${asset.slug}` : origin
  const qrCodeUrl = await getOrCreateAssetQrUrl(event, { orgId: params.orgId, assetKind: params.assetKind, assetId: params.assetId, destinationUrl: publicUrl })

  const values: Record<string, string> = {
    'asset.title': asset.name || '',
    'asset.reference': String(asset.id),
    'asset.price': formatPrice(asset.price),
    'asset.pricePerSquareMeter': asset.price && asset.area ? formatPrice(asset.price / asset.area) : '',
    'asset.location': asset.community || asset.street || '',
    'asset.city': asset.community || '',
    'asset.propertyType': asset.propertyType || '',
    'asset.bedrooms': asset.bedrooms != null ? String(asset.bedrooms) : '',
    'asset.bathrooms': asset.bathrooms != null ? String(asset.bathrooms) : '',
    'asset.builtArea': asset.area != null ? `${asset.area} m²` : '',
    'asset.description': asset.description || '',
    'asset.publicUrl': publicUrl,
    'asset.qrCode': qrCodeUrl,
    'tenant.website': org?.domain ? `https://${org.domain}` : origin,
    'tenant.legalText': brandKit?.legalText || '',
    'tenant.phone': brandKit?.phone || '',
    'tenant.whatsapp': brandKit?.whatsapp || '',
    'tenant.email': brandKit?.email || '',
    'tenant.primaryColor': brandKit?.colorPrimary || '#16150f',
    'tenant.secondaryColor': brandKit?.colorSecondary || '#B08D57',
  }

  const images: Record<string, string | null> = {
    'asset.mainImage': asset.coverImage || null,
    'tenant.logo': brandKit?.logo || org?.logo || null,
  }

  return { values, images }
}

/**
 * Reads raw image bytes + a pdf-lib-compatible format hint for an image
 * binding value. Handles both real R2 keys (uploads via storeFile) and
 * plain http(s) URLs — some seed/demo property photos are external URLs
 * rather than R2-stored files, and a real property with a real external
 * photo shouldn't silently render blank just because it wasn't uploaded
 * through this app.
 */
export async function fetchImageBytes(event: H3Event, keyOrUrl: string | null): Promise<{ bytes: Uint8Array; format: 'png' | 'jpg' } | null> {
  if (!keyOrUrl) return null

  if (/^https?:\/\//i.test(keyOrUrl)) {
    const res = await fetch(keyOrUrl).catch(() => null)
    if (!res || !res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || ''
    return { bytes, format: contentType.includes('png') ? 'png' : 'jpg' }
  }

  const obj = await cfEnv(event).MEDIA.get(keyOrUrl)
  if (!obj) return null
  const bytes = new Uint8Array(await obj.arrayBuffer())
  const contentType = obj.httpMetadata?.contentType || ''
  return { bytes, format: contentType.includes('png') ? 'png' : 'jpg' }
}
