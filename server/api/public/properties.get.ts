import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'
import { toPublicProperties } from '../../utils/propertyPrivacy'
import { livePropertyCond } from '../../utils/properties/trash'
import { geoConds, parseGeoFilters, publicCoordsSql } from '../../utils/properties/geoSearch'
import { inJsonList } from '../../utils/sqlChunks'
import { orderPropertyTypes } from '../../../utils/propertySheet'
import { normalizePostalCode } from '../../../utils/publicSearch'

const P = schema.developerProperties

const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/** Tope de propiedades por petición del mapa público (`view=map`). */
const MAP_MAX_PER_PAGE = 300

/**
 * Off-plan project search with advanced filters + live count.
 *
 * Filters: q, community, street, postalCode, status, developerId, minPrice, maxPrice,
 *   minArea, maxArea, bedrooms (min), bathrooms (min), type, new, orientation, minYear,
 *   energy (max letter), condition, furnished, and boolean features: elevator, pool,
 *   garage, terrace, garden, pets, accessible.
 * FASE 2: city, municipality, neighborhood; north/south/east/west (zona
 *   visible del mapa) y lat/lng/radiusKm (radio).
 * Params: sort (price_asc|price_desc|newest), page, perPage, countOnly,
 *   view=map (hasta 300 por página, para el mapa), facets=types (los tipos que
 *   la agencia tiene publicados, para los filtros de la web) o facets=filters
 *   (además municipios, zonas, códigos postales y estados: el panel del catálogo).
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  // El mapa público (`view=map`, pages/mapa.vue) pide más de una página de
  // tarjetas: hasta MAP_MAX_PER_PAGE. El listado normal sigue en 48.
  const maxPerPage = String(query.view || '') === 'map' ? MAP_MAX_PER_PAGE : 48
  const perPage = Math.min(maxPerPage, Math.max(1, parseInt(String(query.perPage || '12'), 10) || 12))
  const countOnly = String(query.countOnly || '') === '1'

  // `or()`/`and()` are typed to return `SQL | undefined` (they can, with
  // zero real conditions) even though every call site here always passes
  // at least one — `conds` has to accept that possibility to hold their
  // result, and `and(...conds)` below already filters out `undefined` entries.
  // Nada de la papelera en la web pública (tampoco al pedir ids concretos de favoritos/comparar).
  const orgId = resolvePublicOrgId(event)
  const conds: (SQL<unknown> | undefined)[] = [eq(P.organizationId, orgId), livePropertyCond(P)]
  const q = String(query.q || '').trim()
  if (q)
    conds.push(
      or(
        like(P.name, `%${q}%`),
        like(P.community, `%${q}%`),
        like(P.street, `%${q}%`),
        like(P.postalCode, `%${q}%`),
        like(P.slug, `%${q}%`),
      ),
    )
  if (query.community) conds.push(like(P.community, `%${String(query.community)}%`))
  if (query.street) conds.push(like(P.street, `%${String(query.street)}%`))
  // Código postal (FASE 2): por prefijo, que es como se escribe uno a medias
  // («280» = el centro de Madrid); el código completo coincide igual.
  const postalCode = normalizePostalCode(query.postalCode)
  if (postalCode) conds.push(like(P.postalCode, `${postalCode}%`))
  if (query.status) conds.push(eq(P.status, String(query.status)))
  if (String(query.new || '') === '1') conds.push(eq(P.status, 'new'))
  // Obra nueva / segunda mano (Hero › Más filtros, catálogo): una promoción en
  // lanzamiento o en construcción, o un inmueble del tipo «Promoción»
  // (utils/propertyFacts.ts lo rotula igual). Lo demás es segunda mano — sin
  // mirar de qué módulo del panel viene.
  // (coalesce: un estado o tipo vacío es segunda mano, no «desconocido» que el NOT dejaría fuera.)
  const newBuild = sql`(coalesce(${P.status}, '') in ('new', 'under_construction') or coalesce(${P.propertyType}, '') = 'Development')`
  if (query.obra === 'nueva') conds.push(newBuild)
  else if (query.obra === 'segunda') conds.push(sql`not (${newBuild})`)
  // Inversión: rentabilidad bruta declarada en la ficha, desde un mínimo (%).
  const minYield = Number(query.minYield)
  if (Number.isFinite(minYield) && minYield > 0 && minYield <= 100) conds.push(gte(P.rentalYield, minYield))
  // Operación (enlace «Comprar Propiedad» de la cabecera, utils/siteNav.ts):
  // «venta» es lo que no está en alquiler — una promoción sin operación
  // indicada es una venta, como siempre se ha publicado la obra nueva.
  if (query.operacion === 'venta') conds.push(or(isNull(P.transactionType), eq(P.transactionType, 'sale'))!)
  else if (query.operacion === 'alquiler') conds.push(eq(P.transactionType, 'rent'))
  if (query.developerId) conds.push(eq(P.developerId, Number(query.developerId)))
  if (query.type) conds.push(eq(P.propertyType, String(query.type)))
  if (query.orientation) conds.push(eq(P.orientation, String(query.orientation)))
  if (query.condition) conds.push(eq(P.condition, String(query.condition)))
  if (query.furnished) conds.push(eq(P.furnished, String(query.furnished)))
  // FASE 2 (bloque N7b): localidad/municipio y barrio. Municipio y barrio
  // también se buscan en la ficha ampliada (property_details), acotada a la
  // misma organización que la propiedad.
  if (query.city) conds.push(like(P.city, `%${String(query.city)}%`))
  if (query.municipality) {
    const v = `%${String(query.municipality)}%`
    conds.push(or(like(P.city, v), sql`exists (select 1 from property_details pd where pd.organization_id = ${P.organizationId} and pd.property_kind = 'developer' and pd.property_id = ${P.id} and pd.municipality like ${v})`))
  }
  if (query.neighborhood) {
    const v = `%${String(query.neighborhood)}%`
    conds.push(or(like(P.community, v), sql`exists (select 1 from property_details pd where pd.organization_id = ${P.organizationId} and pd.property_kind = 'developer' and pd.property_id = ${P.id} and pd.neighborhood like ${v})`))
  }
  // Zona visible del mapa (north/south/east/west) y radio (lat/lng/radiusKm).
  // Sobre las coordenadas QUE SE PUBLICAN: si la ubicación es aproximada, las
  // redondeadas (toPublicProperty) — buscar por zona nunca afina más que el
  // pin que ya se enseña.
  // La cuadrícula es la de `approximateGridDegrees()` (radio de privacidad, mínimo 0,001°).
  const publicCoords = publicCoordsSql(P)
  conds.push(...geoConds(publicCoords.lat, publicCoords.lng, parseGeoFilters(query)))

  // Fetch by exact ids (favorites/compare) — bypasses the normal page size
  // cap so a saved item never silently disappears once the catalog grows
  // past the default 48-item page.
  const idList = String(query.ids || '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 200)
  // Un solo parámetro (JSON): hasta 200 favoritos no caben en los 100 de D1.
  if (idList.length) conds.push(inJsonList(P.id, idList))

  const minPrice = Number(query.minPrice)
  const maxPrice = Number(query.maxPrice)
  if (minPrice > 0) conds.push(gte(P.price, minPrice))
  if (maxPrice > 0) conds.push(lte(P.price, maxPrice))

  const minArea = Number(query.minArea)
  const maxArea = Number(query.maxArea)
  if (minArea > 0) conds.push(gte(P.area, minArea))
  if (maxArea > 0) conds.push(lte(P.area, maxArea))

  const bedrooms = Number(query.bedrooms)
  const bathrooms = Number(query.bathrooms)
  if (bedrooms > 0) conds.push(gte(P.bedrooms, bedrooms))
  if (bathrooms > 0) conds.push(gte(P.bathrooms, bathrooms))

  const minYear = Number(query.minYear)
  if (minYear > 0) conds.push(gte(P.yearBuilt, minYear))

  // Energy: "energy=B" means B or better (A, B)
  const energy = String(query.energy || '').toUpperCase()
  if (ENERGY_ORDER.includes(energy)) {
    const allowed = ENERGY_ORDER.slice(0, ENERGY_ORDER.indexOf(energy) + 1)
    conds.push(sql`${P.energyRating} in (${sql.join(allowed.map((a) => sql`${a}`), sql`, `)})`)
  }

  const bools: [string, any][] = [
    ['elevator', P.hasElevator],
    ['pool', P.hasPool],
    ['garage', P.hasGarage],
    ['terrace', P.hasTerrace],
    ['garden', P.hasGarden],
    ['pets', P.petsAllowed],
    ['accessible', P.accessible],
  ]
  // Piscina y jardín cuentan también la privada y la comunitaria de la ficha
  // ampliada, como en el listado del panel y en el matching (cierre D1p).
  const detailAlternatives: Record<string, string> = {
    pool: 'pd.has_private_pool = 1 or pd.has_community_pool = 1',
    garden: 'pd.has_private_garden = 1 or pd.has_community_garden = 1',
  }
  for (const [key, col] of bools) {
    if (String(query[key] || '') !== '1') continue
    const alt = detailAlternatives[key]
    conds.push(
      alt
        ? or(eq(col, 1), sql`exists (select 1 from property_details pd where pd.organization_id = ${P.organizationId} and pd.property_kind = 'developer' and pd.property_id = ${P.id} and (${sql.raw(alt)}))`)!
        : eq(col, 1),
    )
  }

  const where = conds.length ? and(...conds) : undefined

  // `facets=types` (FASE 27): los tipos que esta agencia tiene publicados, en
  // el orden del catálogo común, para que el modal de filtros y el buscador de
  // la portada sólo ofrezcan lo que existe. Sobre la misma base que el
  // listado (agencia del host + fuera de la papelera) y SIN el resto de
  // filtros: la lista no encoge según se filtra.
  // `facets=filters` (panel de filtros del catálogo, #109): además, los
  // municipios, zonas, códigos postales y estados que hay publicados, para
  // que los selectores sólo ofrezcan lo que existe. Columnas públicas de la
  // propiedad (la privacidad de la ubicación quita número, portal y planta,
  // nunca ciudad, zona ni código postal).
  const facetMode = String(query.facets || '')
  const base = and(eq(P.organizationId, orgId), livePropertyCond(P))
  // Las mismas columnas que miran los filtros `municipality` y `neighborhood`
  // de arriba: la de la propiedad y la de su ficha ampliada. Si no, una
  // propiedad con el municipio sólo en la ficha filtraría bien pero su
  // municipio no saldría como opción. Las columnas de la propiedad van con su
  // tabla escrita a mano: en la lista del `select` Drizzle las pone sin ella,
  // y dentro de la subconsulta `organization_id` e `id` serían las de la
  // propia ficha ampliada (nunca coincidían y la opción no salía).
  const detail = (col: 'municipality' | 'neighborhood') =>
    sql<string | null>`(select pd.${sql.raw(col)} from property_details pd where pd.organization_id = "developer_properties"."organization_id" and pd.property_kind = 'developer' and pd.property_id = "developer_properties"."id" limit 1)`
  const distinct = async (...cols: any[]): Promise<string[]> => {
    const seen = new Map<string, string>()
    for (const col of cols) {
      for (const r of (await db.selectDistinct({ v: col }).from(P).where(base)) as { v: string | null }[]) {
        const v = r.v == null ? '' : String(r.v).trim()
        if (v && !seen.has(v.toLocaleLowerCase('es'))) seen.set(v.toLocaleLowerCase('es'), v)
      }
    }
    return [...seen.values()].sort((x, y) => x.localeCompare(y, 'es'))
  }
  const facets =
    facetMode === 'types' || facetMode === 'filters'
      ? {
          types: orderPropertyTypes((await db.selectDistinct({ type: P.propertyType }).from(P).where(base)).map((r: { type: string | null }) => r.type)),
          ...(facetMode === 'filters'
            ? {
                municipalities: await distinct(P.city, detail('municipality')),
                neighborhoods: await distinct(P.community, detail('neighborhood')),
                postalCodes: await distinct(P.postalCode),
                statuses: await distinct(P.status),
              }
            : {}),
        }
      : undefined

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(P).where(where as any)
  const total = countRows[0]?.count ?? 0

  // Always the same response shape (rows: [] for countOnly, never an
  // omitted field) — a union return type here is exactly what forces every
  // caller to type-guard before touching `.rows`/`.perPage` for no runtime
  // benefit, since countOnly callers already know to ignore `rows`.
  if (countOnly) return { rows: [], total, page, perPage, ...(facets ? { facets } : {}) }

  const sortKey = String(query.sort || '')
  const orderBy =
    sortKey === 'price_asc'
      ? asc(P.price)
      : sortKey === 'price_desc'
        ? desc(P.price)
        : desc(P.id)

  const baseQuery = db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    .where(where as any)
    .orderBy(orderBy)
  const rows = idList.length ? await baseQuery : await baseQuery.limit(perPage).offset((page - 1) * perPage)

  const merged = rows.map((r) => ({ ...r.project, developerName: r.developerName }))
  const withPhotos = await attachPhotos(db, merged)

  return { rows: toPublicProperties(withPhotos), total, page, perPage, ...(facets ? { facets } : {}) }
})
