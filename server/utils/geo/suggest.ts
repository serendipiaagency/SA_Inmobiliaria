import { and, eq, isNull } from 'drizzle-orm'
import { schema } from '../db'
import { locationIndex, suggestLocations, type LocationEntry } from '../properties/locationIndex'
import { zoneCount, zoneTree, type ZoneRow } from '../zones'
import { geoIndex, geoNeedle, loadGeoCatalog, searchGeo, type GeoMatch, type GeoPlace } from './catalog'
import { LOCATION_DISPLAY_ORDER, normalizeText, type LocationKind } from '../../../utils/searchState'

/**
 * Sugerencias del campo «Ubicación» (Hero y panel de Propiedades) para una
 * agencia: el catálogo geográfico de España (entidades reales, con id),
 * fundido con el inventario real de la agencia (cuántas propiedades hay en
 * cada sitio; calles y nombres que sólo existen en sus fichas) y con sus zonas
 * administrables. Nada inventado: una entidad del catálogo se sugiere aunque
 * la agencia no tenga nada allí (`count` null); una calle sólo si hay
 * propiedades en ella.
 *
 * Ranking (determinista): calidad de la coincidencia (exacta > prefijo >
 * prefijo de palabra > contiene > aproximada) → contexto de la agencia (sus
 * municipios y provincias con inventario van antes, pero NO se excluye nada)
 * → nivel geográfico → población. Luego se enseña por grupos
 * (LOCATION_DISPLAY_ORDER) con un tope por grupo.
 */
export interface LocationSuggestion {
  /** Entidad real (catálogo o zona) o null si es un nombre del inventario sin entidad conocida (p. ej. una calle). */
  id: string | null
  kind: LocationKind
  value: string
  context: string | null
  /** Propiedades publicadas de la agencia en ese sitio; null si no se sabe (entidad sin inventario). */
  count: number | null
  source: 'catalog' | 'inventory' | 'zone'
  lat?: number
  lng?: number
  /** Ids que la contienen (para avisar de redundancias al elegir). */
  parents?: string[]
  /** Puntuación interna del ranking (mayor es mejor); se quita antes de responder. */
  rank?: number
}

export interface SuggestOptions {
  limit?: number
  perKind?: number
  /** Ids destacados por la agencia (Constructor), para el estado vacío. */
  featured?: string[]
}

const PER_KIND_DEFAULT = 6

interface AgencyContext {
  entries: LocationEntry[]
  /** Claves normalizadas de municipios y provincias con inventario. */
  municipalityKeys: Map<string, LocationEntry>
  provinceKeys: Map<string, LocationEntry>
  neighborhoodKeys: Map<string, LocationEntry[]>
  postalCodes: Map<string, LocationEntry>
  /** Provincias (ids del catálogo) donde la agencia tiene inventario, deducidas de sus municipios. */
  provinceIds: Set<string>
  /** Propiedades por provincia y por comunidad (ids del catálogo), sumando las de sus municipios con inventario. */
  provinceSums: Map<string, number>
  regionSums: Map<string, number>
}

function placeKeyMatches(place: GeoPlace, key: string): boolean {
  return place.keys.includes(key)
}

// El contexto se deriva del índice de inventario (cacheado con su sello en
// locationIndex.ts): mientras ese índice sea el mismo objeto, el contexto también.
const contextCache = new WeakMap<LocationEntry[], AgencyContext>()

async function agencyContext(db: any, orgId: number): Promise<AgencyContext> {
  await loadGeoCatalog()
  const entries = await locationIndex(db, orgId)
  const cached = contextCache.get(entries)
  if (cached) return cached
  const ctx = buildAgencyContext(entries)
  contextCache.set(entries, ctx)
  return ctx
}

function buildAgencyContext(entries: LocationEntry[]): AgencyContext {
  const municipalityKeys = new Map<string, LocationEntry>()
  const provinceKeys = new Map<string, LocationEntry>()
  const neighborhoodKeys = new Map<string, LocationEntry[]>()
  const postalCodes = new Map<string, LocationEntry>()
  for (const e of entries) {
    if (e.kind === 'municipality') municipalityKeys.set(e.key, e)
    else if (e.kind === 'province') provinceKeys.set(e.key, e)
    else if (e.kind === 'neighborhood') neighborhoodKeys.set(e.key, [...(neighborhoodKeys.get(e.key) ?? []), e])
    else if (e.kind === 'postalCode') postalCodes.set(e.key, e)
  }
  const provinceIds = new Set<string>()
  const provinceSums = new Map<string, number>()
  const regionSums = new Map<string, number>()
  // Cada municipio del inventario suma una vez (al primer municipio del
  // catálogo con ese nombre): así una provincia o comunidad enseña cuántas
  // propiedades tiene aunque las fichas no lleven la provincia escrita.
  const summed = new Set<string>()
  const { places } = geoIndex()
  for (const p of places) {
    if (p.kind === 'municipality') {
      const key = p.keys.find((k) => municipalityKeys.has(k))
      if (!key) continue
      if (p.provinceId) provinceIds.add(p.provinceId)
      if (summed.has(key)) continue
      summed.add(key)
      const n = municipalityKeys.get(key)!.count
      if (p.provinceId) provinceSums.set(p.provinceId, (provinceSums.get(p.provinceId) ?? 0) + n)
      if (p.regionId) regionSums.set(p.regionId, (regionSums.get(p.regionId) ?? 0) + n)
    }
    if (p.kind === 'province' && p.keys.some((k) => provinceKeys.has(k))) provinceIds.add(p.id)
  }
  return { entries, municipalityKeys, provinceKeys, neighborhoodKeys, postalCodes, provinceIds, provinceSums, regionSums }
}

/** Cuántas propiedades tiene la agencia en una entidad del catálogo, si su nombre coincide con el inventario. */
function inventoryCount(ctx: AgencyContext, place: GeoPlace): number | null {
  if (place.kind === 'municipality') for (const k of place.keys) if (ctx.municipalityKeys.has(k)) return ctx.municipalityKeys.get(k)!.count
  if (place.kind === 'province' || place.kind === 'region') {
    // Lo escrito en las fichas (pd.province) o, si es mayor, la suma de sus
    // municipios con inventario: el mayor de los dos, nunca los dos sumados.
    const text = place.kind === 'province' ? (place.keys.map((k) => ctx.provinceKeys.get(k)?.count).find((n) => n != null) ?? null) : null
    const sum = (place.kind === 'province' ? ctx.provinceSums : ctx.regionSums).get(place.id) ?? 0
    return text == null && !sum ? null : Math.max(text ?? 0, sum)
  }
  if (place.kind === 'postalCode') return ctx.postalCodes.get(place.name)?.count ?? null
  if (place.kind === 'locality') {
    const mun = place.municipalityId ? geoIndex().byId.get(place.municipalityId) : null
    for (const k of place.keys) {
      const list = ctx.neighborhoodKeys.get(k) ?? []
      const hit = list.find((e) => !e.context || !mun || mun.keys.includes(normalizeText(e.context))) ?? list[0]
      if (hit) return hit.count
    }
  }
  return null
}

const kindOf = (place: GeoPlace): LocationKind => (place.kind === 'locality' ? 'neighborhood' : place.kind)

function fromPlace(ctx: AgencyContext, m: GeoMatch): LocationSuggestion {
  const count = inventoryCount(ctx, m.place)
  const parents = [m.place.municipalityId, m.place.provinceId, m.place.regionId].filter((x): x is string => !!x && x !== m.place.id)
  return { id: m.place.id, kind: kindOf(m.place), value: m.place.name, context: m.place.context, count, source: count != null ? 'inventory' : 'catalog', lat: m.place.lat, lng: m.place.lng, parents, rank: m.score }
}

/** Cómo casa lo escrito con un nombre del inventario o de una zona, en la misma escala que el catálogo (exacta > prefijo > prefijo de palabra > contiene). */
function textRank(needle: string, name: string, count: number | null): number {
  const key = normalizeText(name)
  const tier = key === needle ? 5 : key.startsWith(needle) ? 4 : key.split(/[\s-]+/).some((w) => w.startsWith(needle)) ? 3 : needle.length >= 3 && key.includes(needle) ? 2 : 0
  return tier * 1_000_000 + Math.min(999, count ?? 0)
}

async function agencyZones(db: any, orgId: number): Promise<{ rows: ZoneRow[]; tree: ReturnType<typeof zoneTree> }> {
  const Z = schema.zones
  const rows: ZoneRow[] = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  return { rows, tree: zoneTree(rows) }
}

function zoneSuggestion(z: ZoneRow, tree: ReturnType<typeof zoneTree>, entries: LocationEntry[]): LocationSuggestion {
  const parent = z.parentId != null ? tree.byId.get(z.parentId) : undefined
  return { id: `zone:${z.id}`, kind: 'zone', value: z.name, context: parent?.name ?? null, count: zoneCount(z, tree, entries), source: 'zone', lat: z.lat ?? undefined, lng: z.lng ?? undefined }
}

/** Las de inventario que no tienen entidad en el catálogo (calles, nombres propios de la agencia). */
function inventoryOnly(entries: LocationEntry[], taken: Set<string>, needle: string): LocationSuggestion[] {
  const out: LocationSuggestion[] = []
  for (const e of entries) {
    const k = `${e.kind}:${e.key}`
    if (taken.has(k)) continue
    taken.add(k)
    out.push({ id: null, kind: e.kind, value: e.value, context: e.context, count: e.count, source: 'inventory', rank: textRank(needle, e.value, e.count) })
  }
  return out
}

/**
 * Agrupar por nivel, con tope por grupo y total. Los grupos van por su mejor
 * coincidencia (el grupo con la exacta, primero: «somio» enseña el barrio
 * Somió antes que el municipio Somiedo) y, a igualdad, en el orden de
 * presentación. Dentro de cada grupo, por puntuación.
 */
function arrange(items: LocationSuggestion[], limit: number, perKind: number): LocationSuggestion[] {
  const groups = LOCATION_DISPLAY_ORDER.map((kind, order) => {
    const list = items.filter((i) => i.kind === kind).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)).slice(0, perKind)
    return { order, list, best: list[0]?.rank ?? -1 }
  }).filter((g) => g.list.length)
  groups.sort((a, b) => b.best - a.best || a.order - b.order)
  return groups.flatMap((g) => g.list).slice(0, limit).map(({ rank: _rank, ...rest }) => rest)
}

/**
 * Sin texto: lo útil para empezar — las ubicaciones destacadas por la agencia,
 * sus municipios y barrios con más propiedades y sus zonas publicadas. Nunca
 * «populares» inventados: todo viene del inventario o de lo que la agencia
 * configuró.
 */
export async function defaultLocationSuggestions(db: any, orgId: number, opts: SuggestOptions = {}): Promise<LocationSuggestion[]> {
  const ctx = await agencyContext(db, orgId)
  const zones = await agencyZones(db, orgId)
  const items: LocationSuggestion[] = []
  const taken = new Set<string>()
  const { byId } = geoIndex()
  for (const id of (opts.featured ?? []).slice(0, 8)) {
    const place = byId.get(id)
    if (place) {
      items.push({ ...fromPlace(ctx, { place, tier: 5, score: 0 }), rank: 9_000_000 })
      taken.add(`${kindOf(place)}:${place.keys[0]}`)
    } else if (id.startsWith('zone:')) {
      const z = zones.rows.find((r) => `zone:${r.id}` === id)
      if (z) items.push(zoneSuggestion(z, zones.tree, ctx.entries))
    }
  }
  // Municipios y barrios con más propiedades, con su entidad del catálogo si la hay.
  for (const e of suggestLocations(ctx.entries, '')) {
    const k = `${e.kind}:${e.key}`
    if (taken.has(k)) continue
    taken.add(k)
    const place = matchInventoryEntry(e)
    items.push(place ? { ...fromPlace(ctx, { place, tier: 5, score: 0 }), count: e.count, source: 'inventory', rank: e.count } : { id: null, kind: e.kind, value: e.value, context: e.context, count: e.count, source: 'inventory', rank: e.count })
  }
  for (const z of zones.rows.filter((r) => r.homePriority > 0).sort((a, b) => b.homePriority - a.homePriority).slice(0, 6)) {
    if (!items.some((i) => i.id === `zone:${z.id}`)) items.push(zoneSuggestion(z, zones.tree, ctx.entries))
  }
  return arrange(items, opts.limit ?? 14, opts.perKind ?? PER_KIND_DEFAULT)
}

/** La entidad del catálogo que corresponde a una entrada del inventario (mismo nombre normalizado; en barrios, dentro del mismo municipio). */
function matchInventoryEntry(e: LocationEntry): GeoPlace | null {
  const { places } = geoIndex()
  if (e.kind === 'municipality') return places.find((p) => p.kind === 'municipality' && placeKeyMatches(p, e.key)) ?? null
  if (e.kind === 'province') return places.find((p) => p.kind === 'province' && placeKeyMatches(p, e.key)) ?? null
  if (e.kind === 'postalCode') return places.find((p) => p.kind === 'postalCode' && p.name === e.value) ?? null
  if (e.kind === 'neighborhood') {
    const ctxKey = e.context ? normalizeText(e.context) : null
    const candidates = places.filter((p) => p.kind === 'locality' && placeKeyMatches(p, e.key))
    if (!candidates.length) return null
    if (ctxKey) {
      const inMun = candidates.find((p) => {
        const mun = p.municipalityId ? geoIndex().byId.get(p.municipalityId) : null
        return mun?.keys.includes(ctxKey)
      })
      if (inMun) return inMun
    }
    return candidates.length === 1 ? candidates[0]! : null
  }
  return null
}

/** Sugerencias para lo escrito. */
export async function suggestLocationsFor(db: any, orgId: number, q: string, opts: SuggestOptions = {}): Promise<LocationSuggestion[]> {
  const needle = geoNeedle(q)
  if (!needle) return defaultLocationSuggestions(db, orgId, opts)
  const ctx = await agencyContext(db, orgId)
  const zones = await agencyZones(db, orgId)
  const limit = opts.limit ?? 14
  const perKind = opts.perKind ?? PER_KIND_DEFAULT

  // 1. Catálogo, con el contexto de la agencia como empujón (sólo reordena).
  const boost = (p: GeoPlace) => {
    if (p.kind === 'municipality' && p.keys.some((k) => ctx.municipalityKeys.has(k))) return 4
    if (p.kind === 'province' && p.keys.some((k) => ctx.provinceKeys.has(k))) return 4
    if (p.provinceId && ctx.provinceIds.has(p.provinceId)) return 2
    return 0
  }
  const matches = searchGeo(needle, { limit: 40, boost })
  const items: LocationSuggestion[] = matches.map((m) => fromPlace(ctx, m))
  const taken = new Set(items.map((i) => `${i.kind}:${normalizeText(i.value)}`))
  for (const i of items) for (const part of i.value.split('/')) taken.add(`${i.kind}:${normalizeText(part)}`)

  // 2. Inventario: lo que sólo existe en las fichas (calles, nombres propios) y lo que el catálogo no tiene.
  const inv = suggestLocations(ctx.entries, needle, perKind).filter((e) => !taken.has(`${e.kind}:${e.key}`))
  for (const s of inventoryOnly(inv, taken, needle)) items.push(s)

  // 3. Zonas de la agencia.
  for (const z of zones.rows) {
    const rank = textRank(needle, z.name, null)
    if (rank > 0) items.push({ ...zoneSuggestion(z, zones.tree, ctx.entries), rank })
  }
  return arrange(items, limit, perKind)
}
