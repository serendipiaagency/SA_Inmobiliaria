import { and, asc, desc, eq, getTableName, gte, isNull, like, lte, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb } from '../db'
import { tablesFor, type PropertyKind } from '../matching/service'
import { livePropertyCond } from './trash'
import { geoConds, parseGeoFilters, type GeoFilter } from './geoSearch'
import { parseTagIds, tagFilterConds } from '../tags/service'
import { customFieldFilterConds, parseCustomFieldFilters, type CustomFieldFilter } from '../customFields/service'
import { inJsonList } from '../sqlChunks'
import { PROPERTY_AMENITY_KEYS } from '../../../utils/propertySheet'
import { COMMERCIAL_STATUS_NONE, isCommercialStatus } from '../../../utils/propertyCommercialStatus'
import { addDaysToIsoDate, parsePropertyDate } from '../../../utils/propertyDates'

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
  /** Las 5 de la fila (las de las Domain Tools) y, desde el cierre D1p, piscina privada / comunitaria y jardín privado de la ficha ampliada. */
  features?: (PropertyFeature | PropertyDetailFeature)[]
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
  /**
   * Cierre D1p: estado comercial común (`property_details.commercial_status`),
   * cualquiera de los indicados; `none` = sin estado comercial indicado.
   */
  commercialStatuses?: string[]
  /**
   * Cierre D1p: exclusiva caducada (`expired`) o que caduca en los próximos 30
   * días (`expiring`, hoy incluido) a fecha de `today` — el mismo criterio que
   * el aviso del resumen de la ficha (`exclusivityState`), leyendo también las
   * fechas guardadas en formato antiguo.
   */
  exclusivity?: { state: 'expired' | 'expiring'; today: string }
  /** Cierre D1p: «Más características» — sí/no de la ficha ampliada que debe tener todas (`PROPERTY_AMENITY_KEYS`). */
  amenities?: string[]
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

/**
 * Cierre D1p: la ficha ampliada distingue piscina y jardín privados y
 * comunitarios. Se ofrecen como características propias en el filtro…
 */
export const PROPERTY_DETAIL_FEATURE_KEYS = {
  privatePool: 'hasPrivatePool',
  communityPool: 'hasCommunityPool',
  privateGarden: 'hasPrivateGarden',
} as const
export type PropertyDetailFeature = keyof typeof PROPERTY_DETAIL_FEATURE_KEYS

/**
 * …y «piscina» y «jardín» a secas cuentan cualquiera de los tres: la casilla
 * genérica de la fila, la privada o la comunitaria. Mismo criterio que el
 * matching (`FEATURE_SOURCES.anyOf`, utils/buyerRequirementCatalog.ts).
 */
export const PROPERTY_FEATURE_DETAIL_ALTERNATIVES: Partial<Record<PropertyFeature, string[]>> = {
  pool: ['hasPrivatePool', 'hasCommunityPool'],
  garden: ['hasPrivateGarden', 'hasCommunityGarden'],
}

/**
 * `pd.<columna> = 1` para una característica de la ficha ampliada. La columna
 * sale SIEMPRE del esquema (`schema.propertyDetails`) a partir de una clave ya
 * validada contra el catálogo — nunca de texto del cliente —, por eso puede ir
 * como SQL literal (y no ocupa ninguno de los 100 parámetros de D1).
 */
function detailFlagSql(key: string): SQL {
  const col = (schema.propertyDetails as any)[key]
  if (!col?.name || !/^[a-z_]+$/.test(col.name)) throw new Error(`Característica de la ficha ampliada desconocida: ${key}`)
  return sql.raw(`pd.${col.name} = 1`)
}

/**
 * Una fecha guardada como texto (`capture_date`, `exclusive_until`…) leída
 * como `AAAA-MM-DD` en SQL, con los mismos formatos que `parsePropertyDate`
 * (utils/propertyDates.ts): ISO (con o sin hora) y día primero con `/`, `-` o
 * `.` (`15/03/2025`, `5-3-2025`), o `aaaa/mm/dd`. Lo que no es una fecha da
 * NULL y no entra en ningún rango. Sin funciones de fecha de SQLite: sólo
 * `trim`/`replace`/`substr`/`GLOB`, que D1 tiene, y sin parámetros.
 */
export function normalizedDateSql(col: AnyColumn | SQL): SQL {
  const raw = sql`trim(${col})`
  const s = sql`replace(replace(trim(${col}), '.', '/'), '-', '/')`
  return sql`(case
    when ${raw} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' then substr(${raw}, 1, 10)
    when ${s} glob '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]' then substr(${s}, 7, 4) || '-' || substr(${s}, 4, 2) || '-' || substr(${s}, 1, 2)
    when ${s} glob '[0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]' then substr(${s}, 6, 4) || '-' || substr(${s}, 3, 2) || '-0' || substr(${s}, 1, 1)
    when ${s} glob '[0-9][0-9]/[0-9]/[0-9][0-9][0-9][0-9]' then substr(${s}, 6, 4) || '-0' || substr(${s}, 4, 1) || '-' || substr(${s}, 1, 2)
    when ${s} glob '[0-9]/[0-9]/[0-9][0-9][0-9][0-9]' then substr(${s}, 5, 4) || '-0' || substr(${s}, 3, 1) || '-0' || substr(${s}, 1, 1)
    when ${s} glob '[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]' then substr(${s}, 1, 4) || '-' || substr(${s}, 6, 2) || '-' || substr(${s}, 9, 2)
    else null end)`
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
 *
 * Papelera: estas condiciones NO deciden si una propiedad borrada entra o
 * no. Quien llama añade `livePropertyCond()` (properties/trash.ts) — o, en
 * la vista Papelera del listado admin, lo contrario. Así el mismo filtro
 * sirve para las dos vistas sin contradecirse.
 */
export function buildPropertyFilterConds(kind: PropertyKind, filters: PropertySearchFilters): SQL[] {
  const t = propertyTableFor(kind) as any
  const conds: SQL[] = []
  // Toda subconsulta se correlaciona con el id, el catálogo y la ORGANIZACIÓN
  // de la propiedad: un id de oficina, contacto, etiqueta o campo de otra
  // agencia no coincide con nada.
  const details = (cond: SQL) =>
    sql`exists (select 1 from property_details pd where pd.organization_id = ${t.organizationId} and pd.property_kind = ${kind} and pd.property_id = ${t.id} and ${cond})`
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
    // Cierre D1p: también las referencias externa y de agencia y el código
    // comercial (ficha ampliada) — buscar «por referencia» es buscar por
    // cualquiera de las que la agencia maneja.
    const cols = kind === 'developer' ? [t.name, t.reference, t.externalReference, t.agencyReference] : [t.reference, t.externalReference, t.agencyReference, t.street, t.location]
    conds.push(or(...cols.map((c: any) => like(c, `%${filters.text}%`)), details(sql`pd.commercial_code like ${`%${filters.text}%`}`))!)
  }
  if (filters.isExclusive != null) conds.push(eq(t.isExclusive, filters.isExclusive ? 1 : 0))
  if (filters.published === 'published') conds.push(sql`${t.publishedAt} is not null`)
  if (filters.published === 'unpublished') conds.push(isNull(t.publishedAt))
  // Cierre D1p: la fecha de captación es texto y hay fichas con «15/03/2025»;
  // se compara como fecha de verdad (normalizada a AAAA-MM-DD), no como texto.
  // `parsePropertyFilters` ya dejó los extremos en AAAA-MM-DD.
  if (filters.capturedFrom) conds.push(sql`${normalizedDateSql(t.captureDate)} >= ${filters.capturedFrom}`)
  if (filters.capturedTo) conds.push(sql`${normalizedDateSql(t.captureDate)} <= ${filters.capturedTo.slice(0, 10)}`)
  if (filters.updatedFrom) conds.push(gte(t.updatedAt, filters.updatedFrom))
  if (filters.updatedTo) conds.push(lte(t.updatedAt, endOfDay(filters.updatedTo)))
  if (filters.zones?.length) {
    conds.push(or(...filters.zones.flatMap((z) => [like(t.city, `%${z}%`), like(t.district, `%${z}%`)]))!)
  }
  if (filters.propertyTypes?.length) conds.push(or(...filters.propertyTypes.map((pt) => eq(t.propertyType, pt)))!)
  for (const f of filters.features || []) {
    if (f in PROPERTY_DETAIL_FEATURE_KEYS) {
      conds.push(details(detailFlagSql(PROPERTY_DETAIL_FEATURE_KEYS[f as PropertyDetailFeature])))
      continue
    }
    const own = eq(t[PROPERTY_FEATURE_COLUMNS[f as PropertyFeature]], 1)
    const alternatives = PROPERTY_FEATURE_DETAIL_ALTERNATIVES[f as PropertyFeature]
    conds.push(alternatives ? or(own, details(sql`(${sql.join(alternatives.map(detailFlagSql), sql` or `)})`))! : own)
  }
  // «Más características» (cierre D1p): todas en UNA subconsulta, sin parámetros por característica.
  if (filters.amenities?.length) conds.push(details(sql.join(filters.amenities.map(detailFlagSql), sql` and `)))
  // Estado comercial común (cierre D1p). Los valores van como un único
  // parámetro JSON; «sin indicar» es no tener ficha ampliada o tenerla vacía.
  if (filters.commercialStatuses?.length) {
    const values = filters.commercialStatuses.filter((v) => v !== COMMERCIAL_STATUS_NONE)
    const parts: SQL[] = []
    if (values.length) parts.push(details(inJsonList(sql`pd.commercial_status`, values)))
    if (filters.commercialStatuses.includes(COMMERCIAL_STATUS_NONE)) parts.push(sql`not ${details(sql`coalesce(pd.commercial_status, '') <> ''`)}`)
    conds.push(parts.length === 1 ? parts[0] : or(...parts)!)
  }
  // Exclusiva caducada / a punto de caducar (cierre D1p), con la fecha de fin normalizada.
  if (filters.exclusivity) {
    const until = normalizedDateSql(t.exclusiveUntil)
    const { state, today } = filters.exclusivity
    conds.push(eq(t.isExclusive, 1))
    if (state === 'expired') conds.push(sql`${until} < ${today}`)
    else conds.push(sql`${until} >= ${today} and ${until} <= ${addDaysToIsoDate(today, 30)}`)
  }

  // --- Bloque N7b ---------------------------------------------------------
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
    // propiedad está en un portal, y el filtro lo dice devolviendo cero. El
    // panel no lo ofrece en 2ª mano ni lo manda (cierre D1p: tampoco lo
    // arrastra desde un enlace o una vista guardada).
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
 * Búsqueda de texto libre del listado admin (`?q=`) y de «seleccionar todos
 * los filtrados» de las acciones masivas — UNA sola condición para las dos
 * (cierre D1p). Busca en las columnas que declara el recurso
 * (`searchFields` de adminResources.ts: referencias interna, externa y de
 * agencia, nombre, calle, zona…), en el código comercial de la ficha ampliada
 * y, si es un número, en el id («Ref. #123» del listado).
 */
export function propertyTextSearchCond(kind: PropertyKind, q: string, searchFields: string[]): SQL {
  const t = propertyTableFor(kind) as any
  const needle = `%${q}%`
  const parts: SQL[] = searchFields.filter((f) => t[f]).map((f) => like(t[f], needle))
  parts.push(sql`exists (select 1 from property_details pd where pd.organization_id = ${t.organizationId} and pd.property_kind = ${kind} and pd.property_id = ${t.id} and pd.commercial_code like ${needle})`)
  if (/^\d+$/.test(q) && q.length <= 12) parts.push(eq(t.id, parseInt(q, 10)))
  return or(...parts)!
}

/**
 * `updatedTo` llega de un `<input type="date">` como
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
  const list = (v: unknown) =>
    String(Array.isArray(v) ? v.join(',') : (v ?? ''))
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
  const features = list(query.features).filter((f): f is PropertyFeature | PropertyDetailFeature => f in PROPERTY_FEATURE_COLUMNS || f in PROPERTY_DETAIL_FEATURE_KEYS)
  const tagIds = parseTagIds(query.tags)
  const customFields = parseCustomFieldFilters(query)
  const geo = parseGeoFilters(query)
  // Cierre D1p. Igual que la búsqueda geográfica, un valor que no se entiende
  // es un 422 y nunca se ignora: ignorarlo devolvería todas las propiedades.
  const commercialStatuses = [...new Set(list(query.commercialStatus))]
  const badStatus = commercialStatuses.find((v) => v !== COMMERCIAL_STATUS_NONE && !isCommercialStatus(v))
  if (badStatus) throw createError({ statusCode: 422, statusMessage: `Estado comercial no válido: ${badStatus.slice(0, 40)}` })
  const amenities = [...new Set(list(query.amenities))]
  const badAmenity = amenities.find((k) => !PROPERTY_AMENITY_KEYS.includes(k))
  if (badAmenity) throw createError({ statusCode: 422, statusMessage: `Característica no válida: ${badAmenity.slice(0, 40)}` })
  const exclusivityState = str(query.exclusivity)
  if (exclusivityState && exclusivityState !== 'expired' && exclusivityState !== 'expiring') {
    throw createError({ statusCode: 422, statusMessage: 'Vencimiento de la exclusiva no válido (expired o expiring)' })
  }
  /** Fecha de captación «desde»/«hasta»: AAAA-MM-DD (o un formato antiguo que se entienda); otra cosa, 422. */
  const captured = (v: unknown, label: string) => {
    const raw = str(v)
    if (!raw) return undefined
    const day = parsePropertyDate(raw)
    if (!day) throw createError({ statusCode: 422, statusMessage: `Fecha de captación «${label}» no válida (AAAA-MM-DD)` })
    return day
  }
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
    capturedFrom: captured(query.capturedFrom, 'desde'),
    capturedTo: captured(query.capturedTo, 'hasta'),
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
    commercialStatuses: commercialStatuses.length ? commercialStatuses : undefined,
    amenities: amenities.length ? amenities : undefined,
    exclusivity: exclusivityState ? { state: exclusivityState as 'expired' | 'expiring', today: new Date().toISOString().slice(0, 10) } : undefined,
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
 * Exportación CSV (§79) del listado de propiedades. Lee la misma consulta que
 * el listado (mismas condiciones, mismas columnas ya autorizadas), así que
 * nunca puede sacar un dato que el usuario no pudiera ya ver paginando.
 *
 * Cierre D1p: sin el tope de 2.000 filas de antes. Como la de leads (bloque
 * N7b, `exportLeadRows`), recorre TODO el resultado filtrado por lotes de
 * `PROPERTY_EXPORT_BATCH`: cada lote es una consulta pequeña y del mismo
 * tamaño (los mismos parámetros que una página del listado), así que crecer
 * en propiedades no hace crecer ninguna consulta. El orden lleva `id` de
 * desempate para que ninguna fila se repita o se salte entre lotes.
 */
export const PROPERTY_EXPORT_BATCH = 500

/**
 * El estado comercial común (ficha ampliada) como columna de un listado:
 * subconsulta correlacionada por organización, catálogo e id. La tabla se
 * nombra a mano porque Drizzle escribe las columnas SIN tabla en la lista de
 * un SELECT de una sola tabla, y dentro de la subconsulta `id` sería el de
 * `property_details`.
 */
export function commercialStatusColumnSql(kind: PropertyKind): SQL<string | null> {
  const name = sql.identifier(getTableName(propertyTableFor(kind) as any))
  return sql<string | null>`(select pd.commercial_status from property_details pd where pd.organization_id = ${name}.organization_id and pd.property_kind = ${kind} and pd.property_id = ${name}.id)`
}

/** Las columnas del CSV de cada catálogo (más el estado comercial común de la ficha ampliada). */
function exportColumns(kind: PropertyKind) {
  const t = propertyTableFor(kind) as any
  const commercialStatus = commercialStatusColumnSql(kind)
  if (kind === 'developer') {
    return {
      id: t.id,
      reference: t.reference,
      name: t.name,
      slug: t.slug,
      status: t.status,
      commercialStatus,
      transactionType: t.transactionType,
      price: t.price,
      propertyType: t.propertyType,
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      area: t.area,
      community: t.community,
      city: t.city,
      country: t.country,
      isExclusive: t.isExclusive,
      publishedAt: t.publishedAt,
      updatedAt: t.updatedAt,
    }
  }
  return {
    id: t.id,
    reference: t.reference,
    slug: t.slug,
    propertyType: t.propertyType,
    transactionType: t.transactionType,
    status: t.status,
    commercialStatus,
    price: t.price,
    area: t.area,
    bedrooms: t.bedrooms,
    bathrooms: t.bathrooms,
    city: t.city,
    district: t.district,
    country: t.country,
    isExclusive: t.isExclusive,
    publishedAt: t.publishedAt,
    updatedAt: t.updatedAt,
  }
}

export async function exportPropertyRows(db: any, kind: PropertyKind, where: SQL | undefined, sort: SQL, batchSize = PROPERTY_EXPORT_BATCH): Promise<Record<string, unknown>[]> {
  const t = propertyTableFor(kind) as any
  const columns = exportColumns(kind)
  const out: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += batchSize) {
    const batch = await db.select(columns).from(t).where(where).orderBy(sort, asc(t.id)).limit(batchSize).offset(offset)
    out.push(...batch)
    if (batch.length < batchSize) break
  }
  return out
}

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
          // Cierre D1p: también por referencia (interna, de agencia o externa), como el listado.
          or(
            like(schema.developerProperties.name, needle),
            like(schema.developerProperties.community, needle),
            like(schema.developerProperties.reference, needle),
            like(schema.developerProperties.agencyReference, needle),
            like(schema.developerProperties.externalReference, needle),
          ),
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
          or(
            like(schema.agentProperties.reference, needle),
            like(schema.agentProperties.agencyReference, needle),
            like(schema.agentProperties.externalReference, needle),
            like(schema.agentProperties.street, needle),
            like(schema.agentProperties.city, needle),
          ),
        ),
      )
      .orderBy(agentDisplayName)
      .limit(perKindLimit),
  ])

  const developer: PropertySearchRow[] = developerRows.map((r) => ({ ...r, kind: 'developer' as const }))
  const agent: PropertySearchRow[] = agentRows.map((r) => ({ ...r, kind: 'agent' as const }))
  return [...developer, ...agent].slice(0, limit)
}
