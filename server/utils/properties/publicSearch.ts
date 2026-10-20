import { and, asc, desc, eq, getTableName, gte, inArray, isNull, like, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { schema } from '../db'
import { organizationCurrency } from '../currency'
import { priceInAgencyCurrencySql } from './searchService'
import { livePropertyCond } from './trash'
import { geoConds, parseGeoFilters, publicCoordsSql } from './geoSearch'
import { inJsonList } from '../sqlChunks'
import { pointInPolygon, polygonBounds, type GeoPolygon } from '../../../utils/maps/geo'
import { locationVariants } from './locationIndex'
import { locationCondById } from '../geo/locations'
import { normalizePostalCode } from '../../../utils/publicSearch'
import type { PropertyKind } from '../matching/service'
import {
  firstString,
  orderedRange,
  parseAmount,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseOperation,
  parseRentalTerms,
  parseSituations,
  parseSort,
  parseTypes,
  subtypeParent,
  type LocationSelection,
  type SortKey,
} from '../../../utils/searchState'

/**
 * Property Search de la web pública: los filtros y la ordenación de
 * /api/public/properties, en un solo sitio. Lo usan el catálogo (y su mapa),
 * el buscador del Hero —que manda a él—, /mapa y las alertas de búsquedas
 * guardadas (server/tasks/marketing/saved-search-alerts.ts), así que una
 * búsqueda significa lo mismo en todas partes. La URL se lee con
 * utils/searchState.ts, igual que en el navegador.
 *
 * Siempre: la organización del host y nada de la papelera. Todo se filtra y
 * se ordena en la base de datos, antes de paginar.
 *
 * El MISMO buscador sirve para los dos catálogos de Property Core: obra nueva
 * (developer_properties) y segunda mano (agent_properties). `buildPublicSearchFor(kind)`
 * cierra sobre la tabla y el `property_kind` que tocan, porque agent_properties
 * tiene paridad de columnas (Cola 11, migraciones 0098/0099). La obra nueva
 * conserva exactamente su comportamiento anterior a través de los envoltorios
 * de abajo (`buildPublicSearch`, `publicSearchOrder`…), para que el resto de la
 * plataforma no cambie.
 */

const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const GOOD_VIEWS = ['sea', 'mountain', 'city', 'golf', 'park', 'river', 'lake', 'open']

const inList = (column: SQL, values: string[]) => sql`${column} in (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`

export interface PublicSearch {
  conds: SQL[]
  sort: SortKey
}

/** Las funciones de búsqueda pública de un catálogo (obra nueva o segunda mano). */
export interface PublicSearchFns {
  kind: PropertyKind
  table: typeof schema.developerProperties
  buildConds(db: any, orgId: number, query: Record<string, unknown>): Promise<PublicSearch>
  order(sort: SortKey): SQL[]
  newBuildSql: SQL
  pricePerM2Sql: SQL
  priceDropSql: SQL
  /** Las columnas numéricas que calcula el SQL para cada orden, para poder mezclar dos catálogos en memoria con el mismo criterio. */
  sortSelectors(sort: SortKey): Record<string, SQL>
}

/**
 * Construye las piezas de búsqueda pública para un catálogo. Cierra sobre su
 * tabla, su nombre (para las subconsultas correlacionadas) y su `property_kind`.
 * La tabla de 2ª mano tiene paridad de columnas, así que se trata con el mismo
 * tipo que la de obra nueva para acceder a las columnas; las diferencias reales
 * (sin `developer_id`, sin `price_history`, estado `sold`) se tratan aparte.
 */
export function buildPublicSearchFor(kind: PropertyKind): PublicSearchFns {
  const table = (kind === 'agent' ? schema.agentProperties : schema.developerProperties) as typeof schema.developerProperties
  const P = table
  // Dentro de una subconsulta, la propiedad con su tabla escrita: si no, `id` y
  // `organization_id` serían los de la tabla de la subconsulta.
  const name = sql.identifier(getTableName(table as any))
  const P_ID = sql`${name}.id`
  const P_ORG = sql`${name}.organization_id`

  /** ¿La ficha ampliada (property_details) de esta propiedad cumple `cond`? */
  function details(cond: SQL): SQL {
    return sql`exists (select 1 from property_details pd where pd.organization_id = ${P_ORG} and pd.property_kind = ${kind} and pd.property_id = ${P_ID} and (${cond}))`
  }
  /** …y la ficha económica y legal (sólo columnas públicas). */
  function legal(cond: SQL): SQL {
    return sql`exists (select 1 from property_legal_economics le where le.organization_id = ${P_ORG} and le.property_kind = ${kind} and le.property_id = ${P_ID} and (${cond}))`
  }

  /** Obra nueva: en lanzamiento o en construcción, o del tipo «Promoción». Un estado vacío es segunda mano. (En 2ª mano siempre es falso: su estado es available|sold.) */
  const newBuildSql = sql`(coalesce(${P.status}, '') in ('new', 'under_construction') or coalesce(${P.propertyType}, '') = 'Development')`

  /** Cada característica, sobre sus campos estructurados de Property Core. */
  const FEATURE_SQL: Record<string, () => SQL> = {
    terrace: () => or(eq(P.hasTerrace, 1), details(sql`pd.terraces_count > 0`))!,
    balcony: () => details(sql`pd.has_balcony = 1 or pd.balconies_count > 0`),
    garden: () => or(eq(P.hasGarden, 1), details(sql`pd.has_private_garden = 1 or pd.has_community_garden = 1`))!,
    patio: () => details(sql`pd.has_patio = 1`),
    views: () => details(sql.raw(`pd.views in (${GOOD_VIEWS.map((v) => `'${v}'`).join(', ')})`)),
    elevator: () => eq(P.hasElevator, 1),
    accessible: () => eq(P.accessible, 1),
    concierge: () => details(sql`pd.has_concierge = 1 or pd.has_doorman = 1`),
    communal: () =>
      details(sql`pd.has_community_pool = 1 or pd.has_community_garden = 1 or pd.has_gym = 1 or pd.has_paddle = 1 or pd.has_tennis = 1 or pd.has_playground = 1 or pd.has_coworking = 1 or pd.has_social_room = 1`),
    garage: () => or(eq(P.hasGarage, 1), sql`coalesce(${P.garageSpaces}, 0) > 0`)!,
    storeroom: () => or(sql`coalesce(${P.storageArea}, 0) > 0`, details(sql`pd.storerooms_count > 0`))!,
    pool: () => or(eq(P.hasPool, 1), details(sql`pd.has_private_pool = 1 or pd.has_community_pool = 1`))!,
    heating: () => details(sql`(pd.heating is not null and pd.heating <> 'none') or pd.has_underfloor_heating = 1`),
    airConditioning: () => details(sql`pd.has_air_conditioning = 1`),
    furnished: () => eq(P.furnished, 'yes'),
    pets: () => eq(P.petsAllowed, 1),
    expensesIncluded: () => legal(sql`le.rent_expenses_included = 1`),
  }

  /** Una ubicación elegida → su condición: por identificador, su ámbito real (server/utils/geo/locations.ts); por texto, todas las variantes guardadas de ese nombre. */
  async function locationCond(db: any, orgId: number, sel: LocationSelection): Promise<SQL | null> {
    if (sel.id) return locationCondById(db, orgId, sel.id)
    if (sel.kind === 'zone') return sql`0`
    if (sel.kind === 'postalCode') {
      // Código postal: por prefijo, como siempre («330» = todo Oviedo).
      const cp = normalizePostalCode(sel.value)
      return cp ? like(P.postalCode, `${cp}%`) : null
    }
    // El nombre elegido y las demás formas en que está guardado (locationIndex.ts).
    const variants = await locationVariants(db, orgId, sel.kind, sel.value)
    // Sin nombre: no coincide con ninguna (nunca «todas»).
    if (!variants.length) return sql`0`
    if (sel.kind === 'municipality') return or(inList(sql`${P.city}`, variants), details(inList(sql`pd.municipality`, variants)))!
    if (sel.kind === 'neighborhood') return or(inList(sql`${P.community}`, variants), details(inList(sql`pd.neighborhood`, variants)))!
    if (sel.kind === 'province') return details(inList(sql`pd.province`, variants))
    if (sel.kind === 'region') return details(inList(sql`pd.region`, variants))
    return and(inList(sql`${P.street}`, variants), sql`coalesce(${P.locationPrivacy}, 'exact') = 'exact'`)!
  }

  /**
   * Zona dibujada (Parte II del buscador): SQL acota por la caja de la zona y
   * aquí se decide, punto a punto y con las coordenadas QUE SE PUBLICAN, qué
   * propiedades vivas de la agencia caen dentro (trazado de rayo,
   * utils/maps/geo.ts). Los ids van en un solo parámetro (`inJsonList`); sin
   * ninguno dentro, la condición es falsa (nunca «todas»).
   */
  async function polygonIdsCond(db: any, orgId: number, coords: { lat: SQL; lng: SQL }, polygon: GeoPolygon): Promise<SQL> {
    const b = polygonBounds(polygon)
    const rows: { id: number; lat: number | null; lng: number | null }[] = await db
      .select({ id: P.id, lat: coords.lat, lng: coords.lng })
      .from(P)
      .where(
        and(
          eq(P.organizationId, orgId),
          livePropertyCond(P),
          sql`${coords.lat} between ${b.south} and ${b.north}`,
          sql`${coords.lng} between ${b.west} and ${b.east}`,
        ),
      )
      .limit(5000)
    const ids = rows.filter((r) => r.lat != null && r.lng != null && pointInPolygon({ lat: Number(r.lat), lng: Number(r.lng) }, polygon)).map((r) => r.id)
    return ids.length ? inJsonList(P.id, ids) : sql`0`
  }

  /** Las condiciones de una búsqueda pública (incluidas la organización y la papelera) y su orden. */
  async function buildConds(db: any, orgId: number, query: Record<string, unknown>): Promise<PublicSearch> {
    const conds: SQL[] = [eq(P.organizationId, orgId), livePropertyCond(P)]
    // En 2ª mano, una propiedad vendida no se anuncia en la web pública.
    if (kind === 'agent') conds.push(ne(P.status, 'sold'))

    // Texto libre: nombre, zona, calle, CP, ciudad, referencias y la ubicación de la ficha ampliada.
    const q = firstString(query.q).slice(0, 120)
    if (q) {
      const v = `%${q}%`
      conds.push(
        or(
          like(P.name, v),
          like(P.community, v),
          like(P.street, v),
          like(P.postalCode, v),
          like(P.slug, v),
          like(P.city, v),
          like(P.reference, v),
          like(P.agencyReference, v),
          details(sql`pd.municipality like ${v} or pd.neighborhood like ${v} or pd.province like ${v} or pd.commercial_code like ${v}`),
        )!,
      )
    }

    // Operación: «venta» es lo que no está en alquiler (una promoción sin
    // operación indicada es una venta, como siempre se ha publicado la obra nueva).
    const operation = parseOperation(query.operacion)
    if (operation === 'venta') conds.push(or(isNull(P.transactionType), eq(P.transactionType, 'sale'))!)
    else if (operation === 'alquiler') conds.push(eq(P.transactionType, 'rent'))

    // Ubicación: varias a la vez, unidas (Oviedo + Gijón + Avilés).
    const locations = parseLocations(query)
    if (locations.length) {
      const parts = (await Promise.all(locations.map((l) => locationCond(db, orgId, l)))).filter((c): c is SQL => !!c)
      if (parts.length) conds.push(or(...parts)!)
    }
    // Enlaces antiguos: ciudad, zona y calle por texto.
    if (firstString(query.city)) conds.push(like(P.city, `%${firstString(query.city)}%`))
    if (firstString(query.community)) conds.push(like(P.community, `%${firstString(query.community)}%`))
    if (firstString(query.street)) conds.push(like(P.street, `%${firstString(query.street)}%`))

    // Zona del mapa, radio y zona dibujada, sobre las coordenadas que se publican.
    const coords = publicCoordsSql(P)
    const geo = parseGeoFilters(query)
    conds.push(...(geoConds(coords.lat, coords.lng, geo) as SQL[]))
    if (geo.polygon) conds.push(await polygonIdsCond(db, orgId, coords, geo.polygon))

    // Precio (en la moneda base de la agencia) y superficie construida: rangos
    // coherentes; con un límite, la propiedad sin dato no entra.
    const [minPrice, maxPrice] = orderedRange(parseAmount(query.minPrice), parseAmount(query.maxPrice))
    const priceCol: SQL | typeof P.price = minPrice || maxPrice ? priceInAgencyCurrencySql(P, await organizationCurrency(db, orgId)) : P.price
    if (minPrice) conds.push(gte(priceCol as any, minPrice))
    if (maxPrice) conds.push(lte(priceCol as any, maxPrice))
    const [minArea, maxArea] = orderedRange(parseAmount(query.minArea, 1e6), parseAmount(query.maxArea, 1e6))
    if (minArea) conds.push(gte(P.area, minArea))
    if (maxArea) conds.push(lte(P.area, maxArea))

    const bedrooms = parseAmount(query.bedrooms, 50)
    const bathrooms = parseAmount(query.bathrooms, 50)
    if (bedrooms) conds.push(gte(P.bedrooms, bedrooms))
    if (bathrooms) conds.push(gte(P.bathrooms, bathrooms))

    // Tipo y subtipo, varios a la vez. Un subtipo elegido acota su tipo; un
    // tipo sin subtipos elegidos entra entero.
    const { types, subtypes } = parseTypes(query)
    if (types.length || subtypes.length) {
      const byParent = new Map<string, string[]>()
      for (const t of types) byParent.set(t, byParent.get(t) ?? [])
      for (const s of subtypes) {
        const parent = subtypeParent(s)!
        byParent.set(parent, [...(byParent.get(parent) ?? []), s])
      }
      const parts = [...byParent].map(([type, subs]) => (subs.length ? and(eq(P.propertyType, type), details(inList(sql`pd.subtype`, subs)))! : eq(P.propertyType, type)))
      conds.push(or(...parts)!)
    }

    // Estado: obra nueva / segunda mano y, aparte, el estado de conservación.
    const estado = parseEstado(query)
    const axisNew = estado.filter((k) => k === 'obra_nueva' || k === 'segunda_mano')
    if (axisNew.length === 1) conds.push(axisNew[0] === 'obra_nueva' ? newBuildSql : sql`not ${newBuildSql}`)
    const conservation: SQL[] = []
    if (estado.includes('a_estrenar')) conservation.push(eq(P.condition, 'new'))
    // «Reformado»: el estado `renovated` de la ficha y, como siempre, la casilla «Reformado» de la ficha ampliada.
    if (estado.includes('reformado')) conservation.push(eq(P.condition, 'renovated'), details(sql`pd.is_renovated = 1`))
    if (estado.includes('buen_estado')) conservation.push(inArray(P.condition, ['good', 'excellent']))
    if (estado.includes('para_reformar')) conservation.push(inArray(P.condition, ['to_renovate', 'to_reform']))
    if (conservation.length) conds.push(or(...conservation)!)
    // Enlaces anteriores: estado comercial y `new=1` (sólo obra nueva: en 2ª mano el estado no es ese eje).
    if (kind === 'developer') {
      const status = firstString(query.status)
      if (['new', 'under_construction', 'ready'].includes(status)) conds.push(eq(P.status, status))
      if (firstString(query.new) === '1') conds.push(eq(P.status, 'new'))
    }
    const condition = firstString(query.condition)
    if (condition) conds.push(eq(P.condition, condition))

    // Situación de la vivienda: sólo lo que la agencia anuncia.
    const situations = parseSituations(query)
    if (situations.length) conds.push(details(inList(sql`pd.listing_situation`, situations)))

    // Modalidad de alquiler: sin indicar cuenta como larga estancia (la modalidad por defecto).
    const terms = parseRentalTerms(query)
    if (terms.length === 1) conds.push(terms[0] === 'seasonal' ? details(sql`pd.rental_term = 'seasonal'`) : sql`not ${details(sql`pd.rental_term = 'seasonal'`)}`)

    for (const f of parseFeatures(query)) conds.push(FEATURE_SQL[f]!())

    const orientation = firstString(query.orientation)
    if (/^(N|S|E|W|NE|NW|SE|SW)$/.test(orientation)) conds.push(eq(P.orientation, orientation))
    const energy = firstString(query.energy).toUpperCase()
    if (ENERGY_ORDER.includes(energy)) conds.push(inArray(P.energyRating, ENERGY_ORDER.slice(0, ENERGY_ORDER.indexOf(energy) + 1)))
    const minYear = parseAmount(query.minYear, 3000)
    if (minYear) conds.push(gte(P.yearBuilt, minYear))
    // Inversión: rentabilidad bruta declarada en la ficha, desde un mínimo (%).
    const minYield = Number(firstString(query.minYield))
    if (Number.isFinite(minYield) && minYield > 0 && minYield <= 100) conds.push(gte(P.rentalYield, minYield))
    // El promotor sólo existe en obra nueva.
    if (kind === 'developer') {
      const developerId = parseAmount(query.developerId)
      if (developerId) conds.push(eq(P.developerId, developerId))
    }

    return { conds, sort: parseSort(query.sort) }
  }

  // -------------------------------------------------------------------------
  // Ordenación
  // -------------------------------------------------------------------------

  /** Fecha real de publicación; sin ella, la de alta (nunca la última edición). */
  const PUBLISHED = sql`coalesce(${P.publishedAt}, ${P.createdAt})`
  const NO_PRICE = sql`(${P.price} is null or ${P.price} <= 0)`
  /** €/m² como pricePerSquareMeter() (utils/propertySheet.ts): precio entre superficie construida, ambos > 0. */
  const pricePerM2Sql = sql`case when ${P.price} > 0 and ${P.area} > 0 then ${P.price} * 1.0 / ${P.area} end`
  /**
   * Bajada real: frente al precio más alto verificable que tuvo. En obra nueva,
   * el historial de precios (cada precio y cada «precio anterior» registrado) o
   * `price_old`; en 2ª mano no hay historial propio, así que sólo `price_old`.
   * Sólo cuenta si ese precio era MAYOR que el actual; si no, no ha bajado.
   */
  const priceDropSql =
    kind === 'developer'
      ? sql`case when ${P.price} > 0 then (
  select case when ref > ${P.price} then (ref - ${P.price}) * 1.0 / ref end
  from (select max(coalesce(${P.priceOld}, 0),
                   coalesce((select max(ph.price) from price_history ph where ph.developer_property_id = ${P_ID}), 0),
                   coalesce((select max(ph.previous_price) from price_history ph where ph.developer_property_id = ${P_ID}), 0)) as ref)
) end`
      : sql`case when ${P.price} > 0 then (
  select case when ref > ${P.price} then (ref - ${P.price}) * 1.0 / ref end
  from (select coalesce(${P.priceOld}, 0) as ref)
) end`

  /**
   * El ORDER BY de cada una de las ocho ordenaciones. Siempre termina en el id:
   * dos propiedades empatadas salen siempre en el mismo orden y la paginación
   * no repite ni salta ninguna. Lo que no tiene el dato (sin precio, sin
   * superficie, sin bajada) va al final, nunca primero.
   *
   * Relevancia: no hay puntuación inventada. Exclusivas primero y, dentro de
   * eso, las publicadas más recientemente.
   */
  function order(sort: SortKey): SQL[] {
    switch (sort) {
      case 'price_asc':
        return [asc(NO_PRICE), asc(P.price), desc(P.id)]
      case 'price_desc':
        return [asc(NO_PRICE), desc(P.price), desc(P.id)]
      case 'newest':
        return [desc(PUBLISHED), desc(P.id)]
      case 'oldest':
        return [asc(PUBLISHED), asc(P.id)]
      case 'price_drop':
        return [sql`(${priceDropSql}) is null`, sql`(${priceDropSql}) desc`, desc(P.id)]
      case 'ppm2_asc':
        return [sql`(${pricePerM2Sql}) is null`, sql`(${pricePerM2Sql}) asc`, desc(P.id)]
      case 'ppm2_desc':
        return [sql`(${pricePerM2Sql}) is null`, sql`(${pricePerM2Sql}) desc`, desc(P.id)]
      default:
        return [sql`coalesce(${P.isExclusive}, 0) desc`, desc(PUBLISHED), desc(P.id)]
    }
  }

  /**
   * Las columnas numéricas que calcula el SQL para cada orden. Se usan para
   * mezclar dos catálogos en memoria con EXACTAMENTE el mismo criterio que el
   * ORDER BY (incluida la bajada de precio, que JS no puede recalcular).
   */
  function sortSelectors(sort: SortKey): Record<string, SQL> {
    switch (sort) {
      case 'price_asc':
      case 'price_desc':
        return { price: sql<number | null>`${P.price}` }
      case 'newest':
      case 'oldest':
        return { published: sql<string>`${PUBLISHED}` }
      case 'price_drop':
        return { drop: sql<number | null>`(${priceDropSql})` }
      case 'ppm2_asc':
      case 'ppm2_desc':
        return { ppm2: sql<number | null>`(${pricePerM2Sql})` }
      default:
        return { exclusive: sql<number>`coalesce(${P.isExclusive}, 0)`, published: sql<string>`${PUBLISHED}` }
    }
  }

  return { kind, table, buildConds, order, newBuildSql, pricePerM2Sql, priceDropSql, sortSelectors }
}

// ---------------------------------------------------------------------------
// Envoltorios de obra nueva: el comportamiento histórico, intacto, para todo
// lo que ya importaba este módulo (zones.ts, saved-search-alerts.ts,
// publicCompany.ts y las pruebas), que sigue siendo sólo obra nueva.
// ---------------------------------------------------------------------------

const developer = buildPublicSearchFor('developer')

export const buildPublicSearch = developer.buildConds
export const publicSearchOrder = developer.order
export const NEW_BUILD_SQL = developer.newBuildSql
export const PRICE_PER_M2_SQL = developer.pricePerM2Sql
export const PRICE_DROP_SQL = developer.priceDropSql

// ---------------------------------------------------------------------------
// Mezcla en memoria de los dos catálogos
// ---------------------------------------------------------------------------

/** Una fila lista para mezclar: su id, su puesto en la demo y las columnas numéricas que calculó el SQL para el orden elegido (`sortSelectors`). */
export interface PublicMergeRow {
  id: number
  demoRank: number
  price?: number | null
  published?: string | null
  drop?: number | null
  ppm2?: number | null
  exclusive?: number | null
}

const num = (x: unknown): number | null => (x == null ? null : Number(x))
const pricePresent = (x: unknown): boolean => x != null && Number(x) > 0
/** id como desempate final: desc salvo en «Antiguos» (asc), igual que el ORDER BY. */
const byIdDesc = (a: PublicMergeRow, b: PublicMergeRow) => b.id - a.id
/** «lo que no tiene el dato, al final»: devuelve ±1 si sólo uno es nulo, 0 si ninguno o ambos. */
const missingLast = (a: number | null, b: number | null) => (a == null) === (b == null) ? 0 : a == null ? 1 : -1

/**
 * El comparador que reproduce EXACTAMENTE `publicSearchOrder` pero sobre dos
 * catálogos ya ordenados por SQL (cada uno con los mismos criterios). Mezclar
 * dos listas, cada una ordenada por los mismos campos, y reordenar con este
 * comparador da el mismo resultado que un único ORDER BY sobre la unión. Los
 * valores (precio, bajada, €/m², fecha, exclusividad) los calcula el SQL
 * (`sortSelectors`), así JS nunca recalcula la bajada (que depende del
 * historial de precios).
 *
 * `demoActive` sólo en «Relevancia» (sin orden elegido): las de referencia de
 * la demo primero, por su puesto (`referenceRankSql`).
 */
export function publicCatalogComparator(sort: SortKey, demoActive: boolean): (a: PublicMergeRow, b: PublicMergeRow) => number {
  const inf = Number.POSITIVE_INFINITY
  return (a, b) => {
    if (demoActive) {
      const d = a.demoRank - b.demoRank
      if (d) return d
    }
    switch (sort) {
      case 'price_asc': {
        const pa = pricePresent(a.price), pb = pricePresent(b.price)
        if (pa !== pb) return pa ? -1 : 1
        const d = (num(a.price) ?? -inf) - (num(b.price) ?? -inf)
        return d || byIdDesc(a, b)
      }
      case 'price_desc': {
        const pa = pricePresent(a.price), pb = pricePresent(b.price)
        if (pa !== pb) return pa ? -1 : 1
        const d = (num(b.price) ?? -inf) - (num(a.price) ?? -inf)
        return d || byIdDesc(a, b)
      }
      case 'newest':
        return String(b.published ?? '').localeCompare(String(a.published ?? '')) || byIdDesc(a, b)
      case 'oldest':
        return String(a.published ?? '').localeCompare(String(b.published ?? '')) || a.id - b.id
      case 'price_drop':
        return missingLast(num(a.drop), num(b.drop)) || (num(b.drop) ?? 0) - (num(a.drop) ?? 0) || byIdDesc(a, b)
      case 'ppm2_asc':
        return missingLast(num(a.ppm2), num(b.ppm2)) || (num(a.ppm2) ?? 0) - (num(b.ppm2) ?? 0) || byIdDesc(a, b)
      case 'ppm2_desc':
        return missingLast(num(a.ppm2), num(b.ppm2)) || (num(b.ppm2) ?? 0) - (num(a.ppm2) ?? 0) || byIdDesc(a, b)
      default:
        return (
          (num(b.exclusive) ?? 0) - (num(a.exclusive) ?? 0) ||
          String(b.published ?? '').localeCompare(String(a.published ?? '')) ||
          byIdDesc(a, b)
        )
    }
  }
}
