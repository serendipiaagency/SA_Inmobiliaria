import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { getPropertySchemaFor, portalFields, projectWithFields, type PropertyCatalog } from '../propertySchema/registry'
import { loadPropertySheet } from '../properties/extendedSheet'
import { listPublicGallery, listPublicPropertyMedia } from '../properties/media'
import { redactLocation } from '../propertyPrivacy'

/**
 * Lo que se le entrega a un portal o a un feed al publicar una propiedad
 * (FASE 26 + FASE 7, bloque N7a). Es la única forma de los datos que ve un
 * adaptador de canal (`PublishContext.listing`):
 *
 *  - **campos**: SÓLO los `portalFields` del esquema que resuelve la
 *    propiedad (catálogo + tipo) en el PropertySchemaRegistry, de la fila y de
 *    la ficha ampliada juntas. Nada que el registro no declare para portales:
 *    ni referencias internas, ni mandato, ni legal, ni comisiones, ni precio
 *    mínimo, ni oficina o equipo;
 *  - **ubicación**: con la misma privacidad que la web (aproximada /
 *    sin número);
 *  - **fotos y multimedia**: sólo lo publicable, no privado y no oculto, en
 *    su orden.
 *
 * Ningún canal tiene hoy un adaptador real (docs/publication-channels.md):
 * esto define y prueba el contrato para cuando exista, sin inventar el
 * formato de ningún portal.
 */

export interface PortalListing {
  kind: PropertyCatalog
  id: number
  slug: string | null
  propertyType: string | null
  /** Esquema del registro con el que se proyectó (p. ej. «Obra nueva · Garaje / Trastero»). */
  schemaLabel: string
  fields: Record<string, unknown>
  images: { url: string; title: string | null; alt: string | null; caption: string | null; language: string | null }[]
  media: { mediaType: string; url: string; title: string | null; alt: string | null; caption: string | null; language: string | null; isMain: boolean }[]
}

function mediaUrlOf(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `/api/media/${value.replace(/^\/api\/media\//, '')}`
}

/** El listado de una propiedad viva de esta agencia, o `null` si no existe, es de otra agencia o está en la papelera. */
export async function buildPortalListing(db: any, orgId: number, kind: PropertyCatalog, propertyId: number): Promise<PortalListing | null> {
  const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.id, propertyId), eq(t.organizationId, orgId)))
    .limit(1)
  if (!row || row.deletedAt) return null
  const sheet = await loadPropertySheet(db, orgId, kind, propertyId)
  const sch = getPropertySchemaFor(kind, row.propertyType ?? null)
  const merged = { ...row, ...sheet }
  const projected = redactLocation(projectWithFields(merged, kind, portalFields(sch), { onlyDeclared: true }) as Record<string, unknown>, row.locationPrivacy)
  // Sólo lo que tiene valor: un portal no necesita saber qué campos están vacíos.
  const fields = Object.fromEntries(Object.entries(projected).filter(([, v]) => v !== null && v !== undefined && v !== ''))

  const gallery = (await listPublicGallery(db, kind, [propertyId])).get(propertyId) || []
  const cover = kind === 'developer' ? row.coverImage : row.mainImage
  const seen = new Set<string>()
  const images: PortalListing['images'] = []
  if (cover) {
    seen.add(String(cover))
    images.push({ url: mediaUrlOf(String(cover)), title: null, alt: null, caption: null, language: null })
  }
  for (const g of gallery) {
    if (seen.has(g.image)) continue
    seen.add(g.image)
    images.push({ url: mediaUrlOf(g.image), title: g.title, alt: g.alt, caption: g.caption, language: g.language })
  }
  const media = (await listPublicPropertyMedia(db, orgId, kind, propertyId)).map((m) => ({
    mediaType: m.mediaType,
    url: m.url,
    title: m.title,
    alt: m.alt,
    caption: m.caption,
    language: m.language,
    isMain: m.isMain,
  }))

  return {
    kind,
    id: row.id,
    slug: row.slug ?? null,
    propertyType: row.propertyType ?? null,
    schemaLabel: sch.label,
    fields,
    images,
    media,
  }
}
