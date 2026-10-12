import { and, desc, eq, isNull } from 'drizzle-orm'
import { schema } from './db'
import { attachPhotos } from './photos'
import { toPublicProperties } from './propertyPrivacy'
import { locationIndex, type LocationEntry } from './properties/locationIndex'
import { buildPublicSearch, publicSearchOrder } from './properties/publicSearch'
import { normalizeText } from '../../utils/searchState'

/**
 * Zonas (migración 0095, docs/zonas.md): la jerarquía editorial región →
 * municipio → localidad/barrio de una inmobiliaria, y cómo se relaciona con
 * su catálogo. Aquí no se consulta la tabla: las rutas pasan las filas de SU
 * organización (ya filtradas por `organizationId`) y estas funciones las
 * ordenan, les calculan la ruta pública, el recuento real de propiedades y
 * las propiedades que enseñan.
 */
export type ZoneRow = typeof schema.zones.$inferSelect

export type ZoneKind = 'region' | 'municipality' | 'locality' | 'neighborhood'
export const ZONE_KINDS: ZoneKind[] = ['region', 'municipality', 'locality', 'neighborhood']
export const ZONE_KIND_LABEL: Record<ZoneKind, string> = { region: 'Región', municipality: 'Municipio', locality: 'Localidad', neighborhood: 'Barrio' }

/** Etiquetas de las agrupaciones del directorio; cualquier otro valor se enseña capitalizado. */
export const ZONE_AREA_LABEL: Record<string, string> = {
  ciudades: 'Principales ciudades',
  oriente: 'Oriente',
  centro: 'Centro',
  occidente: 'Occidente',
}

export interface ZoneSection {
  title: string
  text: string
}
export interface ZoneFaq {
  q: string
  a: string
}

export interface ZoneCard {
  id: number
  slug: string
  path: string
  name: string
  kind: ZoneKind
  area: string | null
  areaLabel: string | null
  subtitle: string | null
  image: string | null
  /** Propiedades publicadas que el catálogo enseñaría con el filtro de la zona. */
  count: number
  catalogUrl: string
  /** Hay guía que leer (intro); si no, la tarjeta enlaza al catálogo filtrado. */
  hasGuide: boolean
  parent: { name: string; path: string } | null
  childrenCount: number
}

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

export interface ZoneTree {
  rows: ZoneRow[]
  byId: Map<number, ZoneRow>
  children: Map<number | null, ZoneRow[]>
}

const byOrder = (a: ZoneRow, b: ZoneRow) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')

export function zoneTree(rows: ZoneRow[]): ZoneTree {
  const byId = new Map<number, ZoneRow>()
  const children = new Map<number | null, ZoneRow[]>()
  for (const r of rows) byId.set(r.id, r)
  for (const r of rows) {
    const key = r.parentId ?? null
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(r)
  }
  for (const list of children.values()) list.sort(byOrder)
  return { rows, byId, children }
}

/** Slugs desde la región hasta la zona: ['asturias', 'gijon', 'somio']. */
export function zoneSegments(zone: ZoneRow, tree: ZoneTree): string[] {
  const segs: string[] = []
  let cur: ZoneRow | undefined = zone
  const seen = new Set<number>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    segs.unshift(cur.slug)
    cur = cur.parentId != null ? tree.byId.get(cur.parentId) : undefined
  }
  return segs
}

export const zonePath = (zone: ZoneRow, tree: ZoneTree) => `/zonas/${zoneSegments(zone, tree).join('/')}`

/** La zona que corresponde a una ruta (['asturias', 'gijon']), si existe en el árbol. */
export function resolveZonePath(tree: ZoneTree, segments: string[]): ZoneRow | null {
  let parent: number | null = null
  let found: ZoneRow | null = null
  for (const seg of segments) {
    const list: ZoneRow[] = tree.children.get(parent) || []
    found = list.find((z: ZoneRow) => z.slug === seg) || null
    if (!found) return null
    parent = found.id
  }
  return found
}

/** Municipio y barrio con los que la zona filtra el catálogo (heredados del padre cuando faltan). */
export function zoneMatch(zone: ZoneRow, tree: ZoneTree): { municipality: string | null; neighborhood: string | null } {
  let municipality: string | null = zone.matchMunicipality || null
  let neighborhood: string | null = zone.matchNeighborhood || null
  if (zone.kind === 'municipality') municipality = municipality || zone.name
  if (zone.kind === 'locality' || zone.kind === 'neighborhood') {
    neighborhood = neighborhood || zone.name
    if (!municipality) {
      let p = zone.parentId != null ? tree.byId.get(zone.parentId) : undefined
      while (p && !municipality) {
        if (p.matchMunicipality) municipality = p.matchMunicipality
        else if (p.kind === 'municipality') municipality = p.name
        p = p.parentId != null ? tree.byId.get(p.parentId) : undefined
      }
    }
  }
  return { municipality, neighborhood }
}

export function zoneCatalogUrl(zone: ZoneRow, tree: ZoneTree): string {
  const m = zoneMatch(zone, tree)
  const params = new URLSearchParams()
  params.set('operacion', 'venta')
  if (m.municipality) params.set('municipality', m.municipality)
  if (m.neighborhood) params.set('neighborhood', m.neighborhood)
  return `/propiedades?${params.toString()}`
}

/**
 * Propiedades publicadas de la zona según el índice real del catálogo
 * (server/utils/properties/locationIndex.ts): nunca una cifra escrita a mano.
 * Un barrio cuenta sus propiedades dentro de su municipio; un municipio, las
 * suyas; una región, la suma de sus municipios.
 */
export function zoneCount(zone: ZoneRow, tree: ZoneTree, entries: LocationEntry[]): number {
  if (zone.kind === 'region') {
    return (tree.children.get(zone.id) || []).reduce((s, z) => s + zoneCount(z, tree, entries), 0)
  }
  const m = zoneMatch(zone, tree)
  if (m.neighborhood) {
    const e = entries.find((x) => x.kind === 'neighborhood' && x.key === normalizeText(m.neighborhood!))
    if (!e) return 0
    if (m.municipality && e.context && normalizeText(e.context) !== normalizeText(m.municipality)) return 0
    return e.count
  }
  if (m.municipality) return entries.find((x) => x.kind === 'municipality' && x.key === normalizeText(m.municipality!))?.count ?? 0
  return 0
}

export function zoneAreaLabel(area: string | null | undefined): string | null {
  if (!area) return null
  return ZONE_AREA_LABEL[area] || area.charAt(0).toUpperCase() + area.slice(1)
}

export function toZoneCard(zone: ZoneRow, tree: ZoneTree, entries: LocationEntry[]): ZoneCard {
  const parent = zone.parentId != null ? tree.byId.get(zone.parentId) : undefined
  return {
    id: zone.id,
    slug: zone.slug,
    path: zonePath(zone, tree),
    name: zone.name,
    kind: zone.kind as ZoneKind,
    area: zone.area,
    areaLabel: zoneAreaLabel(zone.area),
    subtitle: zone.subtitle,
    image: zone.image,
    count: zoneCount(zone, tree, entries),
    catalogUrl: zoneCatalogUrl(zone, tree),
    hasGuide: Boolean(zone.intro && zone.intro.trim()),
    parent: parent ? { name: parent.name, path: zonePath(parent, tree) } : null,
    childrenCount: (tree.children.get(zone.id) || []).length,
  }
}

/** La zona publicada que mejor describe una propiedad: su barrio si tiene guía; si no, su municipio. */
export function zoneForLocation(tree: ZoneTree, municipality: string | null, neighborhood: string | null): ZoneRow | null {
  const mKey = municipality ? normalizeText(municipality) : ''
  const nKey = neighborhood ? normalizeText(neighborhood) : ''
  let best: ZoneRow | null = null
  for (const z of tree.rows) {
    const m = zoneMatch(z, tree)
    if (nKey && (z.kind === 'neighborhood' || z.kind === 'locality') && m.neighborhood && normalizeText(m.neighborhood) === nKey) {
      if (!mKey || !m.municipality || normalizeText(m.municipality) === mKey) return z
    }
    if (mKey && z.kind === 'municipality' && m.municipality && normalizeText(m.municipality) === mKey) best = best || z
  }
  return best
}

/** Las propiedades que enseña la guía: el catálogo real con el filtro de la zona (misma búsqueda que /propiedades). */
export async function zoneProperties(db: any, orgId: number, zone: ZoneRow, tree: ZoneTree, limit = 6) {
  const m = zoneMatch(zone, tree)
  if (!m.municipality && !m.neighborhood) return []
  const query: Record<string, string> = m.neighborhood ? { neighborhood: m.neighborhood } : { municipality: m.municipality! }
  const search = await buildPublicSearch(db, orgId, query)
  const P = schema.developerProperties
  const rows: Array<typeof P.$inferSelect> = await db
    .select()
    .from(P)
    .where(and(...search.conds))
    .orderBy(...publicSearchOrder(search.sort), desc(P.id))
    .limit(m.neighborhood ? 40 : limit)
  // Un barrio dentro de su municipio: «Centro» de Oviedo no es «Centro» de Avilés.
  const filtered = m.neighborhood && m.municipality ? rows.filter((r) => !r.city || normalizeText(String(r.city)) === normalizeText(m.municipality!)) : rows
  return toPublicProperties(await attachPhotos(db, filtered.slice(0, limit)))
}

export { locationIndex }

/** Las zonas del bloque «Zonas» de la portada: publicadas, con prioridad > 0, de mayor a menor (máx. 12), con su ruta y su enlace al catálogo. */
export async function homeZones(db: any, orgId: number): Promise<ZoneCard[]> {
  const Z = schema.zones
  const rows: ZoneRow[] = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  if (!rows.length) return []
  const tree = zoneTree(rows)
  const entries = await locationIndex(db, orgId)
  return rows
    .filter((z) => z.homePriority > 0)
    .sort((a, b) => b.homePriority - a.homePriority || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
    .slice(0, 12)
    .map((z) => toZoneCard(z, tree, entries))
}
