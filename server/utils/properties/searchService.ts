import { and, asc, desc, eq, gte, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { schema, useDb } from '../db'
import { tablesFor, type PropertyKind } from '../matching/service'

/**
 * Property Search Service (FASE 27) — el filtro profesional único sobre
 * Property Core, compartido por las tres lentes que hoy consultan
 * inmuebles: el listado admin (`[resource]/index.get.ts`), la búsqueda
 * ligera cross-catálogo (`searchPropertiesCompact`, usada por Calendar) y el
 * prefiltro de Matching (`matching/service.ts`, vía `tablesFor` reexportado
 * de aquí en vez de redeclarado). §51 del megaprompt: "UNA SOLA BÚSQUEDA" —
 * nunca dos motores de query paralelos para el mismo catálogo.
 *
 * `developer_properties` y `agent_properties` no comparten tabla base pero sí
 * comparten, desde Property Core (migración 0068), las columnas que este
 * filtro usa — así que un único `PropertySearchFilters` sirve para los dos,
 * con `buildPropertyFilterConds(kind, filters)` resolviendo a la tabla
 * correcta.
 */
export interface PropertySearchFilters {
  priceMin?: number
  priceMax?: number
  country?: string
  city?: string
  district?: string
  postalCode?: string
  propertyType?: string
  transactionType?: string
  status?: string
  bedroomsMin?: number
  bathroomsMin?: number
  areaMin?: number
  areaMax?: number
  /** Exclusividad de mandato — sin filtro en ningún listado antes de FASE 27. */
  isExclusive?: boolean
  /** Estado de publicación — sin filtro en ningún listado antes de FASE 27. */
  published?: 'published' | 'unpublished'
  /** Fecha de captación (rango) — sin filtro en ningún listado antes de FASE 27. */
  capturedFrom?: string
  capturedTo?: string
  /** Fecha de última actualización (rango) — sin filtro en ningún listado antes de FASE 27. */
  updatedFrom?: string
  updatedTo?: string
}

/** La tabla Drizzle de cada catálogo — mismo mapeo que `matching/service.ts` (tablesFor), reexportado en vez de redeclarado para no tener una tercera forma de resolver "kind -> tabla". */
export function propertyTableFor(kind: PropertyKind) {
  return tablesFor(kind).property
}

/**
 * Construye las condiciones WHERE del filtro profesional para un catálogo.
 * Único lugar donde "precioMin" se traduce a `gte(t.price, ...)`: antes esto
 * vivía duplicado (developer-properties / properties) en
 * `[resource]/index.get.ts`, con el mismo bug esperando a diverger la
 * primera vez que alguien tocara sólo una de las dos copias.
 */
export function buildPropertyFilterConds(kind: PropertyKind, filters: PropertySearchFilters): SQL[] {
  const t = propertyTableFor(kind) as any
  const conds: SQL[] = []
  if (filters.priceMin != null) conds.push(gte(t.price, filters.priceMin))
  if (filters.priceMax != null) conds.push(lte(t.price, filters.priceMax))
  if (filters.country) conds.push(like(t.country, `%${filters.country}%`))
  if (filters.city) conds.push(like(t.city, `%${filters.city}%`))
  if (filters.district) conds.push(like(t.district, `%${filters.district}%`))
  if (filters.postalCode) conds.push(like(t.postalCode, `%${filters.postalCode}%`))
  if (filters.propertyType) conds.push(eq(t.propertyType, filters.propertyType))
  // Las dos tablas tienen transaction_type desde la migración 0068 (en
  // developer_properties con default 'sale'); antes sólo `properties` lo
  // filtraba porque obra nueva se asumía venta implícita.
  if (filters.transactionType) conds.push(eq(t.transactionType, filters.transactionType))
  if (filters.status) conds.push(eq(t.status, filters.status))
  if (filters.bedroomsMin != null) conds.push(gte(t.bedrooms, filters.bedroomsMin))
  if (filters.bathroomsMin != null) conds.push(gte(t.bathrooms, filters.bathroomsMin))
  if (filters.areaMin != null) conds.push(gte(t.area, filters.areaMin))
  if (filters.areaMax != null) conds.push(lte(t.area, filters.areaMax))
  if (filters.isExclusive != null) conds.push(eq(t.isExclusive, filters.isExclusive ? 1 : 0))
  if (filters.published === 'published') conds.push(sql`${t.publishedAt} is not null`)
  if (filters.published === 'unpublished') conds.push(isNull(t.publishedAt))
  if (filters.capturedFrom) conds.push(gte(t.captureDate, filters.capturedFrom))
  if (filters.capturedTo) conds.push(lte(t.captureDate, endOfDay(filters.capturedTo)))
  if (filters.updatedFrom) conds.push(gte(t.updatedAt, filters.updatedFrom))
  if (filters.updatedTo) conds.push(lte(t.updatedAt, endOfDay(filters.updatedTo)))
  return conds
}

/**
 * `capturedTo`/`updatedTo` llegan de un `<input type="date">` como
 * `"2026-09-24"` (10 caracteres), comparados contra columnas que a veces
 * llevan hora (`"2026-09-24T10:00:00"`). En comparación de texto, el prefijo
 * corto SIEMPRE ordena por debajo del más largo, así que un `lte` con la
 * fecha pelada excluiría cualquier fila actualizada ese mismo día después de
 * medianoche — justo el caso más común. Rellenar hasta el final del día lo
 * hace inclusivo de verdad.
 */
function endOfDay(v: string): string {
  return v.length === 10 ? `${v}T23:59:59` : v
}

/** Traduce una query string HTTP a `PropertySearchFilters` — los mismos nombres de parámetro en los dos catálogos (megaprompt §52). */
export function parsePropertyFilters(query: Record<string, unknown>): PropertySearchFilters {
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : undefined)
  const str = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v) : undefined)
  const bool = (v: unknown) => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : undefined)
  const published = query.published === 'published' || query.published === 'unpublished' ? (query.published as 'published' | 'unpublished') : undefined
  return {
    priceMin: num(query.priceMin),
    priceMax: num(query.priceMax),
    country: str(query.country),
    city: str(query.city),
    district: str(query.district),
    postalCode: str(query.postalCode),
    propertyType: str(query.propertyType),
    transactionType: str(query.transactionType),
    status: str(query.status),
    bedroomsMin: num(query.bedroomsMin),
    bathroomsMin: num(query.bathroomsMin),
    areaMin: num(query.areaMin),
    areaMax: num(query.areaMax),
    isExclusive: bool(query.isExclusive),
    published,
    capturedFrom: str(query.capturedFrom),
    capturedTo: str(query.capturedTo),
    updatedFrom: str(query.updatedFrom),
    updatedTo: str(query.updatedTo),
  }
}

/** Mapas de orden del listado admin — únicos consumidores que ordenan por catálogo/columna así (matching puntúa en memoria; la búsqueda compacta ordena por nombre). */
export const DEVELOPER_PROPERTY_SORTS: Record<string, SQL> = {
  newest: desc(schema.developerProperties.createdAt),
  oldest: asc(schema.developerProperties.createdAt),
  price_desc: desc(schema.developerProperties.price),
  price_asc: asc(schema.developerProperties.price),
  name_asc: asc(schema.developerProperties.name),
  name_desc: desc(schema.developerProperties.name),
}

export const PROPERTIES_SORTS: Record<string, SQL> = {
  newest: desc(schema.agentProperties.createdAt),
  oldest: asc(schema.agentProperties.createdAt),
  price_desc: desc(schema.agentProperties.price),
  price_asc: asc(schema.agentProperties.price),
}

export interface PropertySearchRow {
  id: number
  kind: PropertyKind
  name: string
  subtitle: string | null
  price: number | null
}

const agentDisplayName = sql<string>`coalesce(${schema.agentProperties.reference}, ${schema.agentProperties.street} || ' ' || coalesce(${schema.agentProperties.streetNumber}, ''), 'Sin nombre')`

/**
 * Búsqueda ligera por texto sobre los dos catálogos a la vez — usada por el
 * selector de inmueble de Calendar (y cualquier picker futuro que necesite
 * "un inmueble cualquiera, buscado por nombre/zona" sin las columnas
 * completas del listado admin). Antes era SQL crudo contra D1 en
 * `properties/search.ts` (ahora retirado); comparte aquí el mismo
 * `useDb(event)` Drizzle que el resto de `server/utils`, sin motor paralelo.
 */
export async function searchPropertiesCompact(event: H3Event, orgId: number, q: string, limit = 20): Promise<PropertySearchRow[]> {
  const db = useDb(event)
  const needle = `%${q.trim()}%`
  const perKindLimit = Math.max(1, Math.min(limit, 50))

  const [developerRows, agentRows] = await Promise.all([
    db
      .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, subtitle: schema.developerProperties.community, price: schema.developerProperties.price })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.organizationId, orgId), or(like(schema.developerProperties.name, needle), like(schema.developerProperties.community, needle))))
      .orderBy(asc(schema.developerProperties.name))
      .limit(perKindLimit),
    db
      .select({ id: schema.agentProperties.id, name: agentDisplayName, subtitle: schema.agentProperties.city, price: schema.agentProperties.price })
      .from(schema.agentProperties)
      .where(
        and(
          eq(schema.agentProperties.organizationId, orgId),
          or(like(schema.agentProperties.reference, needle), like(schema.agentProperties.street, needle), like(schema.agentProperties.city, needle)),
        ),
      )
      .orderBy(agentDisplayName)
      .limit(perKindLimit),
  ])

  const developer: PropertySearchRow[] = developerRows.map((r) => ({ ...r, kind: 'developer' as const }))
  const agent: PropertySearchRow[] = agentRows.map((r) => ({ ...r, kind: 'agent' as const }))
  return [...developer, ...agent].slice(0, limit)
}
