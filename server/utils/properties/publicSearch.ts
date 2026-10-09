import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import { schema } from '../db'
import { livePropertyCond } from './trash'
import { geoConds, parseGeoFilters, publicCoordsSql } from './geoSearch'
import { locationVariants } from './locationIndex'
import { normalizePostalCode } from '../../../utils/publicSearch'
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
 */

const P = schema.developerProperties
// Dentro de una subconsulta, la propiedad con su tabla escrita: si no, `id` y
// `organization_id` serían los de la tabla de la subconsulta.
const P_ID = sql.raw('"developer_properties"."id"')
const P_ORG = sql.raw('"developer_properties"."organization_id"')

/** ¿La ficha ampliada (property_details) de esta propiedad cumple `cond`? */
function details(cond: SQL): SQL {
  return sql`exists (select 1 from property_details pd where pd.organization_id = ${P_ORG} and pd.property_kind = 'developer' and pd.property_id = ${P_ID} and (${cond}))`
}
/** …y la ficha económica y legal (sólo columnas públicas). */
function legal(cond: SQL): SQL {
  return sql`exists (select 1 from property_legal_economics le where le.organization_id = ${P_ORG} and le.property_kind = 'developer' and le.property_id = ${P_ID} and (${cond}))`
}
const inList = (column: SQL, values: string[]) => sql`${column} in (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`

/** Obra nueva: en lanzamiento o en construcción, o del tipo «Promoción». Un estado vacío es segunda mano. */
export const NEW_BUILD_SQL = sql`(coalesce(${P.status}, '') in ('new', 'under_construction') or coalesce(${P.propertyType}, '') = 'Development')`

const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const GOOD_VIEWS = ['sea', 'mountain', 'city', 'golf', 'park', 'river', 'lake', 'open']

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

/** Una ubicación elegida → su condición (todas las variantes guardadas de ese nombre). */
async function locationCond(db: any, orgId: number, sel: LocationSelection): Promise<SQL | null> {
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
  return and(inList(sql`${P.street}`, variants), sql`coalesce(${P.locationPrivacy}, 'exact') = 'exact'`)!
}

export interface PublicSearch {
  conds: SQL[]
  sort: SortKey
}

/** Las condiciones de una búsqueda pública (incluidas la organización y la papelera) y su orden. */
export async function buildPublicSearch(db: any, orgId: number, query: Record<string, unknown>): Promise<PublicSearch> {
  const conds: SQL[] = [eq(P.organizationId, orgId), livePropertyCond(P)]

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

  // Zona del mapa y radio, sobre las coordenadas que se publican.
  const coords = publicCoordsSql(P)
  conds.push(...(geoConds(coords.lat, coords.lng, parseGeoFilters(query)) as SQL[]))

  // Precio (en la moneda base de la agencia) y superficie construida: rangos
  // coherentes; con un límite, la propiedad sin dato no entra.
  const [minPrice, maxPrice] = orderedRange(parseAmount(query.minPrice), parseAmount(query.maxPrice))
  if (minPrice) conds.push(gte(P.price, minPrice))
  if (maxPrice) conds.push(lte(P.price, maxPrice))
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
  if (axisNew.length === 1) conds.push(axisNew[0] === 'obra_nueva' ? NEW_BUILD_SQL : sql`not ${NEW_BUILD_SQL}`)
  const conservation: SQL[] = []
  if (estado.includes('a_estrenar')) conservation.push(eq(P.condition, 'new'))
  if (estado.includes('reformado')) conservation.push(details(sql`pd.is_renovated = 1`))
  if (estado.includes('buen_estado')) conservation.push(inArray(P.condition, ['good', 'excellent']))
  if (estado.includes('para_reformar')) conservation.push(inArray(P.condition, ['to_renovate', 'to_reform']))
  if (conservation.length) conds.push(or(...conservation)!)
  // Enlaces anteriores: estado comercial y `new=1`.
  const status = firstString(query.status)
  if (['new', 'under_construction', 'ready'].includes(status)) conds.push(eq(P.status, status))
  if (firstString(query.new) === '1') conds.push(eq(P.status, 'new'))
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
  const developerId = parseAmount(query.developerId)
  if (developerId) conds.push(eq(P.developerId, developerId))

  return { conds, sort: parseSort(query.sort) }
}

// ---------------------------------------------------------------------------
// Ordenación
// ---------------------------------------------------------------------------

/** Fecha real de publicación; sin ella, la de alta (nunca la última edición). */
const PUBLISHED = sql`coalesce(${P.publishedAt}, ${P.createdAt})`
const NO_PRICE = sql`(${P.price} is null or ${P.price} <= 0)`
/** €/m² como pricePerSquareMeter() (utils/propertySheet.ts): precio entre superficie construida, ambos > 0. */
export const PRICE_PER_M2_SQL = sql`case when ${P.price} > 0 and ${P.area} > 0 then ${P.price} * 1.0 / ${P.area} end`
/**
 * Bajada real: frente al precio más alto verificable que tuvo (historial de
 * precios: cada precio y cada «precio anterior» registrado; o `price_old`).
 * Sólo cuenta si ese precio era MAYOR que el actual; si no, no ha bajado.
 */
export const PRICE_DROP_SQL = sql`case when ${P.price} > 0 then (
  select case when ref > ${P.price} then (ref - ${P.price}) * 1.0 / ref end
  from (select max(coalesce(${P.priceOld}, 0),
                   coalesce((select max(ph.price) from price_history ph where ph.developer_property_id = ${P_ID}), 0),
                   coalesce((select max(ph.previous_price) from price_history ph where ph.developer_property_id = ${P_ID}), 0)) as ref)
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
export function publicSearchOrder(sort: SortKey): SQL[] {
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
      return [sql`(${PRICE_DROP_SQL}) is null`, sql`(${PRICE_DROP_SQL}) desc`, desc(P.id)]
    case 'ppm2_asc':
      return [sql`(${PRICE_PER_M2_SQL}) is null`, sql`(${PRICE_PER_M2_SQL}) asc`, desc(P.id)]
    case 'ppm2_desc':
      return [sql`(${PRICE_PER_M2_SQL}) is null`, sql`(${PRICE_PER_M2_SQL}) desc`, desc(P.id)]
    default:
      return [sql`coalesce(${P.isExclusive}, 0) desc`, desc(PUBLISHED), desc(P.id)]
  }
}
