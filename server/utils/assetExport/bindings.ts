import { and, eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, cfEnv } from '../db'
import { getOrCreateAssetQrUrl } from './qrLinks'
import { trashedPropertyMessage } from '../properties/trash'
import { toPublicProperty } from '../propertyPrivacy'
import { listPublicGallery } from '../properties/media'
import { organizationCurrency } from '../currency'
import { formatMoney } from '../../../utils/currency'
import { PROPERTY_TYPE_LABELS } from '../../../utils/propertySheet'

export interface AssetBindings {
  values: Record<string, string>
  /** R2 keys (not URLs) for image-type bindings, resolved separately since the renderer needs raw bytes. */
  images: Record<string, string | null>
}

/** Precio en la moneda de la agencia, en la que se guarda (utils/currency.ts) — antes «€» fijo. */
function formatPrice(price: number | null | undefined, currency: string): string {
  if (price == null) return 'Precio a consultar'
  return formatMoney(price, currency)
}

/** El tipo con la etiqueta del catálogo común («Piso»), nunca la clave interna («Apartment»). */
function typeLabel(type: string | null | undefined): string {
  return type ? PROPERTY_TYPE_LABELS[type] || type : ''
}

export interface TenantBindings {
  website: string
  legalText: string
  phone: string
  whatsapp: string
  email: string
  primaryColor: string
  secondaryColor: string
  logo: string | null
  orgName: string
}

/** Resolves the org-level (not asset-level) Brand Kit fields — shared by resolveAssetBindings and the catalog cover/index pages, which have no single asset to hang off of. */
export async function resolveTenantBindings(event: H3Event, orgId: number): Promise<TenantBindings> {
  const db = useDb(event)
  const brandKitRows = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId)).limit(1)
  const brandKit = brandKitRows[0] || null

  const orgRows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  const org = orgRows[0] || null

  const origin = getRequestURL(event).origin
  return {
    website: org?.domain ? `https://${org.domain}` : origin,
    legalText: brandKit?.legalText || '',
    phone: brandKit?.phone || '',
    whatsapp: brandKit?.whatsapp || '',
    email: brandKit?.email || '',
    primaryColor: brandKit?.colorPrimary || '#16150f',
    secondaryColor: brandKit?.colorSecondary || '#B08D57',
    logo: brandKit?.logo || org?.logo || null,
    orgName: org?.name || '',
  }
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
  // 2ª mano (FASE 28): sólo la usa «Crear catálogo»; piezas, lotes y API v1
  // siguen aceptando únicamente obra nueva (validan antes de llegar aquí).
  if (params.assetKind === 'agent_property') return resolveAgentAssetBindings(event, params)
  if (params.assetKind !== 'developer_property') {
    throw createError({ statusCode: 400, statusMessage: `Unsupported assetKind: ${params.assetKind}` })
  }

  const rows = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, params.assetId)).limit(1)
  const asset = rows[0]
  if (!asset || asset.organizationId !== params.orgId) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  // Toda exportación (pieza, lote, catálogo, API v1) pasa por aquí: de una
  // propiedad en la papelera no se genera material nuevo.
  if (asset.deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('exportarla') })

  const tenant = await resolveTenantBindings(event, params.orgId)
  const currency = await organizationCurrency(db, params.orgId)

  const publicUrl = asset.slug ? `${tenant.website}/propiedades/${asset.slug}` : `${tenant.website}/`
  const qrCodeUrl = await getOrCreateAssetQrUrl(event, { orgId: params.orgId, assetKind: params.assetKind, assetId: params.assetId, destinationUrl: publicUrl })

  const values: Record<string, string> = {
    'asset.title': asset.name || '',
    'asset.reference': String(asset.id),
    'asset.price': formatPrice(asset.price, currency),
    'asset.pricePerSquareMeter': asset.price && asset.area ? formatPrice(asset.price / asset.area, currency) : '',
    'asset.location': asset.community || asset.street || '',
    'asset.city': asset.community || '',
    'asset.propertyType': typeLabel(asset.propertyType),
    'asset.bedrooms': asset.bedrooms != null ? String(asset.bedrooms) : '',
    'asset.bathrooms': asset.bathrooms != null ? String(asset.bathrooms) : '',
    'asset.builtArea': asset.area != null ? `${asset.area} m²` : '',
    'asset.description': asset.description || '',
    'asset.publicUrl': publicUrl,
    'asset.qrCode': qrCodeUrl,
    'tenant.website': tenant.website,
    'tenant.legalText': tenant.legalText,
    'tenant.phone': tenant.phone,
    'tenant.whatsapp': tenant.whatsapp,
    'tenant.email': tenant.email,
    'tenant.primaryColor': tenant.primaryColor,
    'tenant.secondaryColor': tenant.secondaryColor,
  }

  const images: Record<string, string | null> = {
    'asset.mainImage': asset.coverImage || null,
    'asset.masterPlanImage': asset.masterPlanImage || null,
    'asset.locationMapImage': asset.locationMap || null,
    'tenant.logo': tenant.logo,
  }

  return { values, images }
}

/**
 * El título de una propiedad de 2ª mano en material para clientes. No tiene
 * nombre propio: «<tipo> en <zona>» («Piso en Chamberí»). La calle sólo si la
 * ubicación es exacta y no hay zona —nunca con el número, que
 * `toPublicProperty()` ya quita—; si no hay nada, «Inmueble #id».
 */
export function agentCatalogTitle(p: { id: number; propertyType?: string | null; street?: string | null; community?: string | null; district?: string | null; city?: string | null; locationPrivacy?: string | null }): string {
  const type = typeLabel(p.propertyType) || 'Inmueble'
  const zone = p.community || p.district || p.city
  if (zone) return `${type} en ${zone}`
  if (p.street && (p.locationPrivacy || 'exact') === 'exact') return `${type} en ${p.street}`
  return `${type} #${p.id}`
}

/** La zona de una propiedad de 2ª mano («Chamberí, Madrid»): barrio o distrito y localidad, nunca la dirección. */
export function agentCatalogZone(p: { community?: string | null; district?: string | null; city?: string | null }): string {
  return [...new Set([p.community || p.district, p.city].map((v) => String(v || '').trim()).filter(Boolean))].join(', ')
}

/**
 * La foto principal que puede ir en material para clientes (FASE 7): la
 * portada de la ficha (`main_image`) salvo que esa misma foto esté marcada en
 * la galería como no publicable, privada u oculta; si lo está o no hay
 * portada, la primera foto publicable de la galería, en su orden; si no hay
 * ninguna, sin foto. Nunca una foto que la ficha pública no enseñaría.
 */
export async function publishableAgentCover(db: any, propertyId: number, mainImage: string | null | undefined): Promise<string | null> {
  const G = schema.propertyGalleryImages
  if (mainImage) {
    const blocked = await db
      .select({ id: G.id })
      .from(G)
      .where(and(eq(G.propertyId, propertyId), eq(G.image, mainImage), or(eq(G.isPublishable, 0), eq(G.isPrivate, 1), eq(G.isHidden, 1))))
      .limit(1)
    if (!blocked.length) return mainImage
  }
  const gallery = await listPublicGallery(db, 'agent', [propertyId])
  return gallery.get(propertyId)?.[0]?.image ?? null
}

/**
 * Las mismas claves `{{asset.*}}` que obra nueva, para una ficha de 2ª mano
 * (FASE 28): foto, título, precio, m², dormitorios, baños, zona y referencia.
 *
 * Sólo lo publicable: la fila pasa por `toPublicProperty()` (fuera lo interno
 * y la ubicación redactada según su privacidad), la zona nunca lleva la
 * dirección, y la foto sale de `publishableAgentCover()`. La referencia es el
 * número de ficha, como en obra nueva: la referencia interna (`reference`) es
 * de las columnas que nunca salen en una respuesta pública. 2ª mano no tiene
 * página pública, así que no hay enlace ni QR (vacíos: la plantilla los deja
 * en blanco, nunca un destino inventado).
 */
export async function resolveAgentAssetBindings(event: H3Event, params: { orgId: number; assetId: number }): Promise<AssetBindings> {
  const db = useDb(event)
  const rows = await db.select().from(schema.agentProperties).where(and(eq(schema.agentProperties.id, params.assetId), eq(schema.agentProperties.organizationId, params.orgId))).limit(1)
  const asset = rows[0]
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (asset.deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('exportarla') })

  const p = toPublicProperty(asset, { catalog: 'agent' }) as typeof asset
  const tenant = await resolveTenantBindings(event, params.orgId)
  const currency = await organizationCurrency(db, params.orgId)
  const cover = await publishableAgentCover(db, asset.id, asset.mainImage)

  const values: Record<string, string> = {
    'asset.title': agentCatalogTitle(p),
    'asset.reference': String(asset.id),
    'asset.price': formatPrice(p.price, currency),
    'asset.pricePerSquareMeter': p.price && p.area ? formatPrice(p.price / p.area, currency) : '',
    'asset.location': agentCatalogZone(p),
    'asset.city': p.city || '',
    'asset.propertyType': typeLabel(p.propertyType),
    'asset.bedrooms': p.bedrooms != null ? String(p.bedrooms) : '',
    'asset.bathrooms': p.bathrooms != null ? String(p.bathrooms) : '',
    'asset.builtArea': p.area != null ? `${p.area} m²` : '',
    'asset.description': '',
    'asset.publicUrl': '',
    'asset.qrCode': '',
    'tenant.website': tenant.website,
    'tenant.legalText': tenant.legalText,
    'tenant.phone': tenant.phone,
    'tenant.whatsapp': tenant.whatsapp,
    'tenant.email': tenant.email,
    'tenant.primaryColor': tenant.primaryColor,
    'tenant.secondaryColor': tenant.secondaryColor,
  }

  const images: Record<string, string | null> = {
    'asset.mainImage': cover,
    'asset.masterPlanImage': null,
    'asset.locationMapImage': null,
    'tenant.logo': tenant.logo,
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
