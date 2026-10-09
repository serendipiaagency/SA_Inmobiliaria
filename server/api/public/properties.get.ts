import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'
import { toPublicProperties } from '../../utils/propertyPrivacy'
import { livePropertyCond } from '../../utils/properties/trash'
import { buildPublicSearch, publicSearchOrder } from '../../utils/properties/publicSearch'
import { inJsonList } from '../../utils/sqlChunks'
import { orderPropertyTypes } from '../../../utils/propertySheet'
import { SITUATION_KEYS } from '../../../utils/searchState'

const P = schema.developerProperties

/** Tope de propiedades por petición del mapa público (`view=map`). */
const MAP_MAX_PER_PAGE = 300

/**
 * Property Search de la web pública: listado, recuento real y facetas.
 *
 * Los filtros y la ordenación son los de server/utils/properties/publicSearch.ts
 * (el mismo módulo que usan las alertas de búsquedas guardadas), leídos con
 * utils/searchState.ts — exactamente como los lee el navegador:
 *   q, operacion (venta|alquiler), province/municipality/neighborhood/postalCode/street
 *   (varios, unión), north/south/east/west, lat/lng/radiusKm, minPrice/maxPrice,
 *   minArea/maxArea, bedrooms, bathrooms (mínimos), type/subtype (varios),
 *   estado (obra_nueva, segunda_mano, a_estrenar, reformado, buen_estado,
 *   para_reformar), situacion, rentalTerm, características (=1), orientation,
 *   energy, minYear, minYield, developerId; y los de enlaces anteriores
 *   (city, community, street, status, new, obra, condition, furnished).
 * Orden: sort = '' (relevancia) | price_asc | price_desc | newest | oldest |
 *   price_drop | ppm2_asc | ppm2_desc — siempre en la base de datos, antes de paginar.
 * Params: page, perPage, countOnly, ids (favoritos/comparar), view=map (hasta
 *   300 por página), facets=types|filters.
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

  const orgId = resolvePublicOrgId(event)
  const search = await buildPublicSearch(db, orgId, query)
  const conds = [...search.conds]

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

  const where = and(...conds)

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
  const detail = (col: 'municipality' | 'neighborhood' | 'listing_situation') =>
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
                // Situación de la vivienda: el grupo sólo sale si alguna propiedad publicada la anuncia.
                situations: (await distinct(detail('listing_situation'))).filter((v) => (SITUATION_KEYS as readonly string[]).includes(v)),
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

  const baseQuery = db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    .where(where as any)
    .orderBy(...publicSearchOrder(search.sort))
  const rows = idList.length ? await baseQuery : await baseQuery.limit(perPage).offset((page - 1) * perPage)

  const merged = rows.map((r) => ({ ...r.project, developerName: r.developerName }))
  const withPhotos = await attachPhotos(db, merged)

  return { rows: toPublicProperties(withPhotos), total, page, perPage, ...(facets ? { facets } : {}) }
})
