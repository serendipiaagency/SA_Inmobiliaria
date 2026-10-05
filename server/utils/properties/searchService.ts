import { and, asc, desc, eq, gte, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { schema, useDb } from '../db'
import { tablesFor, type PropertyKind } from '../matching/service'
import { livePropertyCond } from './trash'
import { geoConds, parseGeoFilters, type GeoFilter } from './geoSearch'
import { parseTagIds, tagFilterConds } from '../tags/service'
import { customFieldFilterConds, parseCustomFieldFilters, type CustomFieldFilter } from '../customFields/service'

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
  /** Superficie de parcela (plot_area) — la de Suelo según el PropertySchemaRegistry, que no tiene `area` (FASE 31 §9). */
  plotAreaMin?: number
  plotAreaMax?: number
  /** Texto libre sobre los campos que identifican una propiedad: nombre y referencia en obra nueva; referencia, calle y ubicación en 2ª mano (FASE 31 — «Villa Mediterránea»). */
  text?: string
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
  /**
   * FASE 31 (search_properties de la Domain Tools API): varias zonas a la
   * vez (ciudad o distrito, «Chamberí o Salamanca»), varios tipos, y
   * características que DEBEN tener (sólo las que existen como columna en
   * los dos catálogos). Lo que no se pide no se filtra: «sin garaje» nunca
   * se deduce de no mencionarlo (§8).
   */
  zones?: string[]
  propertyTypes?: string[]
  features?: PropertyFeature[]
  /**
   * Bloque N7b (FASE 27): subtipo y oficina (ficha ampliada,
   * `property_details`), comercial asignado (`agentId`, «none» = sin
   * comercial), propietario (PropertyContact con papel propietario o
   * copropietario: por texto o por id de contacto) y portal (un trabajo de
   * publicación en ese canal — sólo existe en obra nueva).
   */
  subtype?: string
  agentId?: number | 'none'
  officeId?: number
  owner?: string
  ownerContactId?: number
  portal?: string
  /** FASE 2: barrio (o urbanización) y municipio (o localidad) — los de la ficha ampliada y los antiguos. */
  neighborhood?: string
  municipality?: string
  /** FASE 0: etiquetas (todas las indicadas) y campos personalizados. */
  tagIds?: number[]
  customFields?: CustomFieldFilter[]
  /** FASE 2: zona visible del mapa (bounding box) y/o radio alrededor de unas coordenadas. */
  geo?: GeoFilter
}

/**
 * Estados de un trabajo de publicación que cuentan como «está (o va a estar)
 * en ese portal»: programado, en cola, publicándose, publicado o
 * reintentando. Un trabajo cancelado, fallido u omitido no.
 */
export const PORTAL_ACTIVE_JOB_STATUSES = ['pending', 'queued', 'running', 'success', 'retrying', 'paused'] as const

export const PROPERTY_FEATURE_COLUMNS = {
  terrace: 'hasTerrace',
  pool: 'hasPool',
  garage: 'hasGarage',
  elevator: 'hasElevator',
  garden: 'hasGarden',
} as const
export type PropertyFeature = keyof typeof PROPERTY_FEATURE_COLUMNS

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
 *
 * Papelera: estas condiciones NO deciden si una propiedad borrada entra o
 * no. Quien llama añade `livePropertyCond()` (properties/trash.ts) — o, en
 * la vista Papelera del listado admin, lo contrario. Así el mismo filtro
 * sirve para las dos vistas sin contradecirse.
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
  if (filters.plotAreaMin != null) conds.push(gte(t.plotArea, filters.plotAreaMin))
  if (filters.plotAreaMax != null) conds.push(lte(t.plotArea, filters.plotAreaMax))
  if (filters.text) {
    const cols = kind === 'developer' ? [t.name, t.reference] : [t.reference, t.street, t.location]
    conds.push(or(...cols.map((c: any) => like(c, `%${filters.text}%`)))!)
  }
  if (filters.isExclusive != null) conds.push(eq(t.isExclusive, filters.isExclusive ? 1 : 0))
  if (filters.published === 'published') conds.push(sql`${t.publishedAt} is not null`)
  if (filters.published === 'unpublished') conds.push(isNull(t.publishedAt))
  if (filters.capturedFrom) conds.push(gte(t.captureDate, filters.capturedFrom))
  if (filters.capturedTo) conds.push(lte(t.captureDate, endOfDay(filters.capturedTo)))
  if (filters.updatedFrom) conds.push(gte(t.updatedAt, filters.updatedFrom))
  if (filters.updatedTo) conds.push(lte(t.updatedAt, endOfDay(filters.updatedTo)))
  if (filters.zones?.length) {
    conds.push(or(...filters.zones.flatMap((z) => [like(t.city, `%${z}%`), like(t.district, `%${z}%`)]))!)
  }
  if (filters.propertyTypes?.length) conds.push(or(...filters.propertyTypes.map((pt) => eq(t.propertyType, pt)))!)
  for (const f of filters.features || []) conds.push(eq(t[PROPERTY_FEATURE_COLUMNS[f]], 1))

  // --- Bloque N7b ---------------------------------------------------------
  // Toda subconsulta se correlaciona con el id, el catálogo y la ORGANIZACIÓN
  // de la propiedad: un id de oficina, contacto, etiqueta o campo de otra
  // agencia no coincide con nada.
  const details = (cond: SQL) =>
    sql`exists (select 1 from property_details pd where pd.organization_id = ${t.organizationId} and pd.property_kind = ${kind} and pd.property_id = ${t.id} and ${cond})`
  if (filters.subtype) conds.push(details(sql`pd.subtype = ${filters.subtype}`))
  if (filters.officeId) conds.push(details(sql`pd.office_id = ${filters.officeId}`))
  if (filters.agentId === 'none') conds.push(isNull(t.agentId))
  else if (filters.agentId) conds.push(eq(t.agentId, filters.agentId))
  if (filters.neighborhood) conds.push(or(like(t.community, `%${filters.neighborhood}%`), details(sql`pd.neighborhood like ${`%${filters.neighborhood}%`}`))!)
  if (filters.municipality) conds.push(or(like(t.city, `%${filters.municipality}%`), details(sql`pd.municipality like ${`%${filters.municipality}%`}`))!)
  if (filters.owner || filters.ownerContactId) {
    const who = filters.ownerContactId
      ? sql`pc.contact_id = ${filters.ownerContactId}`
      : sql`(c.name like ${`%${filters.owner}%`} or c.email like ${`%${filters.owner}%`} or c.phone like ${`%${filters.owner}%`})`
    conds.push(sql`exists (select 1 from property_contacts pc
      join contacts c on c.id = pc.contact_id and c.organization_id = pc.organization_id
      where pc.organization_id = ${t.organizationId} and pc.property_kind = ${kind} and pc.property_id = ${t.id}
        and pc.deleted_at is null and pc.role in ('owner', 'co_owner') and ${who})`)
  }
  if (filters.portal) {
    // La publicación multicanal sólo programa obra nueva
    // (publication_schedules.developer_property_id): en 2ª mano ninguna
    // propiedad está en un portal, y el filtro lo dice devolviendo cero.
    if (kind === 'developer') {
      conds.push(sql`exists (select 1 from publication_jobs j
        join publication_schedules ps on ps.id = j.schedule_id and ps.organization_id = j.organization_id
        where j.organization_id = ${t.organizationId} and ps.developer_property_id = ${t.id}
          and j.channel_key = ${filters.portal} and j.action = 'publish'
          and j.status in (select value from json_each(${JSON.stringify(PORTAL_ACTIVE_JOB_STATUSES)})))`)
    } else {
      conds.push(sql`0 = 1`)
    }
  }
  if (filters.tagIds?.length) conds.push(...tagFilterConds(kind, t.id, t.organizationId, filters.tagIds))
  if (filters.customFields?.length) conds.push(...customFieldFilterConds(kind, t, filters.customFields))
  conds.push(...geoConds(t.lat, t.lng, filters.geo))
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
  const posInt = (v: unknown) => {
    const n = Number(v)
    return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined
  }
  const features = String(query.features ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter((f): f is PropertyFeature => f in PROPERTY_FEATURE_COLUMNS)
  const tagIds = parseTagIds(query.tags)
  const customFields = parseCustomFieldFilters(query)
  const geo = parseGeoFilters(query)
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
    features: features.length ? [...new Set(features)] : undefined,
    subtype: str(query.subtype),
    agentId: query.agentId === 'none' ? 'none' : posInt(query.agentId),
    officeId: posInt(query.officeId),
    owner: str(query.owner)?.slice(0, 120),
    ownerContactId: posInt(query.ownerId),
    portal: str(query.portal),
    neighborhood: str(query.neighborhood),
    municipality: str(query.municipality),
    // Sin filtro, `undefined` (no una lista o un objeto vacíos), como el resto.
    tagIds: tagIds.length ? tagIds : undefined,
    customFields: customFields.length ? customFields : undefined,
    geo: geo.bbox || geo.radius ? geo : undefined,
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
  /** Portada (developer_properties) o foto principal (agent_properties) — mismo campo de imagen que ya usa cada ficha. */
  image: string | null
  bedrooms: number | null
}

/**
 * Tope de filas de una exportación CSV (§79) — export lee la misma
 * consulta que el listado (mismas condiciones, mismas columnas ya
 * autorizadas), así que nunca puede filtrar un dato que el usuario no
 * pudiera ya ver paginando; el límite es sólo para no dejar una petición
 * sin paginar crecer sin tope sobre una organización con miles de filas.
 */
export const PROPERTY_EXPORT_MAX_ROWS = 2000

/** Serializa filas ya autorizadas a CSV — sin librería, el escapado es el único caso a cubrir: comas, comillas y saltos de línea. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))]
  return lines.join('\n')
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
      .select({
        id: schema.developerProperties.id,
        name: schema.developerProperties.name,
        subtitle: schema.developerProperties.community,
        price: schema.developerProperties.price,
        image: schema.developerProperties.coverImage,
        bedrooms: schema.developerProperties.bedrooms,
      })
      .from(schema.developerProperties)
      .where(
        and(
          eq(schema.developerProperties.organizationId, orgId),
          // Un selector de inmueble (Calendar, Comunicaciones) nunca ofrece uno de la papelera.
          livePropertyCond(schema.developerProperties),
          or(like(schema.developerProperties.name, needle), like(schema.developerProperties.community, needle)),
        ),
      )
      .orderBy(asc(schema.developerProperties.name))
      .limit(perKindLimit),
    db
      .select({
        id: schema.agentProperties.id,
        name: agentDisplayName,
        subtitle: schema.agentProperties.city,
        price: schema.agentProperties.price,
        image: schema.agentProperties.mainImage,
        bedrooms: schema.agentProperties.bedrooms,
      })
      .from(schema.agentProperties)
      .where(
        and(
          eq(schema.agentProperties.organizationId, orgId),
          livePropertyCond(schema.agentProperties),
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
