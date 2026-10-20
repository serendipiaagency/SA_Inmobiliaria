import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'
import { toPublicProperties } from '../../utils/propertyPrivacy'
import { livePropertyCond } from '../../utils/properties/trash'
import { buildPublicSearchFor, publicCatalogComparator, type PublicMergeRow, type PublicSearchFns } from '../../utils/properties/publicSearch'
import { inJsonList } from '../../utils/sqlChunks'
import { orderPropertyTypes } from '../../../utils/propertySheet'
import { SITUATION_KEYS, type SortKey } from '../../../utils/searchState'
import { demoReferenceFor, referenceRankSql } from '../../demo/reference'
import type { PropertyKind } from '../../utils/matching/service'

/** Los dos catálogos de Property Core que la web pública muestra juntos: obra nueva y 2ª mano. */
const KINDS = ['developer', 'agent'] as const
const FNS: Record<PropertyKind, PublicSearchFns> = { developer: buildPublicSearchFor('developer'), agent: buildPublicSearchFor('agent') }

/** Tope de propiedades por petición del mapa público (`view=map`). */
const MAP_MAX_PER_PAGE = 300
/** Tope duro de filas que se traen para mezclar: ningún catálogo público pagina tan hondo. */
const MERGE_HARD_CAP = 5000

/**
 * Property Search de la web pública: listado, recuento real y facetas, con los
 * DOS catálogos de Property Core a la vez — obra nueva (developer_properties) y
 * segunda mano (agent_properties).
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
 *   price_drop | ppm2_asc | ppm2_desc — cada catálogo se ordena en la base de
 *   datos y los dos se mezclan en memoria con el MISMO criterio
 *   (publicCatalogComparator), que da el mismo resultado que un único ORDER BY.
 * Params: page, perPage, countOnly, ids (favoritos/comparar), view=map (hasta
 *   300 por página), facets=types|filters.
 *
 * La 2ª mano es siempre «segunda mano» en el eje obra-nueva/2ª-mano; una
 * propiedad de 2ª mano vendida (`status='sold'`) no se anuncia. Cada fila lleva
 * `catalog` ('developer'|'agent') para que la tarjeta construya el enlace a su
 * ficha. La proyección pública sale por catálogo (toPublicProperties con su
 * `catalog`), así que ni la obra nueva ni la 2ª mano filtran campos internos.
 *
 * Cuenta demo: sus propiedades de referencia (server/demo/reference.ts) de los
 * dos catálogos salen marcadas (`demoReference`, para el marco dorado) y, con el
 * orden por defecto («Relevancia»), primeras; un orden elegido, los filtros y la
 * paginación se respetan. Ninguna otra empresa recibe la marca ni cambia de orden.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const maxPerPage = String(query.view || '') === 'map' ? MAP_MAX_PER_PAGE : 48
  const perPage = Math.min(maxPerPage, Math.max(1, parseInt(String(query.perPage || '12'), 10) || 12))
  const countOnly = String(query.countOnly || '') === '1'

  const orgId = resolvePublicOrgId(event)

  // Favoritos/comparar: por id exacto, saltándose el tope de página (y para los
  // dos catálogos: los ids guardados no distinguen catálogo todavía).
  const idList = String(query.ids || '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 200)

  const facetMode = String(query.facets || '')

  // Condiciones, orden y referencia de la demo por catálogo.
  const perKind = await Promise.all(
    KINDS.map(async (kind) => {
      const table = FNS[kind].table
      const search = await FNS[kind].buildConds(db, orgId, query)
      const conds = [...search.conds]
      if (idList.length) conds.push(inJsonList(table.id, idList))
      const reference = await demoReferenceFor(db, orgId, kind)
      return { kind, table, where: and(...conds), sort: search.sort, reference }
    }),
  )
  const sort = perKind[0]!.sort as SortKey
  const demo = !!perKind[0]!.reference // la cuenta demo tiene referencia en los dos catálogos

  // Recuento real: la suma de los dos catálogos.
  const counts = await Promise.all(perKind.map((pk) => db.select({ count: sql<number>`count(*)` }).from(pk.table).where(pk.where as any)))
  const total = counts.reduce((acc, rows) => acc + (rows[0]?.count ?? 0), 0)

  // Facetas (FASE 27 / #109): sobre la misma base que el listado (agencia del
  // host, fuera de la papelera y, en 2ª mano, no vendida) y SIN el resto de
  // filtros, unidas de los dos catálogos.
  const facets = facetMode === 'types' || facetMode === 'filters' ? await buildFacets(db, orgId, facetMode) : undefined

  if (countOnly) return { rows: [], total, page, perPage, ...(facets ? { facets } : {}) }

  // Filas de cada catálogo, YA ORDENADAS por SQL con el criterio elegido. El
  // SELECT trae sólo la propiedad (`project`) y el nombre del promotor: los
  // valores numéricos del orden para mezclar se calculan en JS a partir de la
  // fila, porque mezclar una tabla y muchos campos `sql` en el mismo SELECT
  // desalinea el parseo de la fila anidada en Drizzle. La bajada de precio de
  // obra nueva es lo único que necesita la base de datos (su historial), y se
  // trae aparte en una sola consulta por lote.
  const limit = idList.length ? MERGE_HARD_CAP : Math.min(page * perPage, MERGE_HARD_CAP)
  type Tagged = { kind: PropertyKind; project: any; developerName: string | null; demoReference: boolean; merge: PublicMergeRow }
  const raw: { kind: PropertyKind; ref: { refs: string[] } | null; project: any; developerName: string | null }[] = []
  for (const pk of perKind) {
    const T = pk.table
    let qb: any = db
      .select({ project: T, ...(pk.kind === 'developer' ? { developerName: schema.developers.name } : {}) })
      .from(T)
    if (pk.kind === 'developer') qb = qb.leftJoin(schema.developers, eq(T.developerId, schema.developers.id))
    qb = qb
      .where(pk.where as any)
      .orderBy(...(pk.reference && !sort ? [referenceRankSql(T.agencyReference, pk.reference.refs)] : []), ...FNS[pk.kind].order(sort))
      .limit(limit)
    for (const r of (await qb) as any[]) raw.push({ kind: pk.kind, ref: pk.reference, project: r.project, developerName: r.developerName ?? null })
  }

  // Bajada de precio de obra nueva (sólo cuando se ordena por ella): el precio
  // de referencia más alto de su historial, por lote.
  const dropMax = new Map<number, number>()
  if (sort === 'price_drop') {
    const devIds = raw.filter((r) => r.kind === 'developer').map((r) => r.project.id)
    if (devIds.length) {
      const rows = (await db
        .select({ pid: schema.priceHistory.developerPropertyId, mx: sql<number>`max(${schema.priceHistory.price})`, mxPrev: sql<number>`max(${schema.priceHistory.previousPrice})` })
        .from(schema.priceHistory)
        .where(inArray(schema.priceHistory.developerPropertyId, devIds))
        .groupBy(schema.priceHistory.developerPropertyId)) as { pid: number; mx: number | null; mxPrev: number | null }[]
      for (const r of rows) dropMax.set(r.pid, Math.max(Number(r.mx) || 0, Number(r.mxPrev) || 0))
    }
  }

  const dropOf = (project: any, kind: PropertyKind): number | null => {
    const price = Number(project.price) || 0
    if (price <= 0) return null
    const ref = Math.max(Number(project.priceOld) || 0, kind === 'developer' ? dropMax.get(project.id) ?? 0 : 0)
    return ref > price ? (ref - price) / ref : null
  }

  const tagged: Tagged[] = raw.map(({ kind, ref, project, developerName }) => {
    const price = project.price == null ? null : Number(project.price)
    const area = Number(project.area) || 0
    const idx = ref && project.agencyReference ? ref.refs.indexOf(project.agencyReference) : -1
    return {
      kind,
      project,
      developerName,
      demoReference: idx >= 0,
      merge: {
        id: project.id,
        // El puesto en la demo (0,1,… y el resto al final), igual que referenceRankSql; sólo cuenta en «Relevancia».
        demoRank: ref ? (idx >= 0 ? idx : ref.refs.length) : 0,
        price,
        published: project.publishedAt || project.createdAt || null,
        ppm2: price != null && price > 0 && area > 0 ? price / area : null,
        exclusive: Number(project.isExclusive) || 0,
        drop: dropOf(project, kind),
      },
    }
  })

  // Mezcla: el mismo orden que un único ORDER BY sobre la unión (ver publicCatalogComparator).
  tagged.sort((a, b) => publicCatalogComparator(sort, demo && !sort)(a.merge, b.merge))
  const pageRows = idList.length ? tagged : tagged.slice((page - 1) * perPage, (page - 1) * perPage + perPage)

  // Fotos y proyección pública POR CATÁLOGO (cada uno con su `catalog`, para no
  // filtrar campos internos), reinterpoladas al orden de la mezcla.
  const publicByKey = new Map<string, any>()
  for (const kind of KINDS) {
    const group = pageRows.filter((t) => t.kind === kind)
    if (!group.length) continue
    const withPhotos = await attachPhotos(
      db,
      group.map((t) => ({ ...t.project, ...(kind === 'developer' ? { developerName: t.developerName } : {}) })),
      5,
      kind,
    )
    const projected = toPublicProperties(withPhotos, { catalog: kind })
    group.forEach((t, i) => publicByKey.set(`${kind}:${t.project.id}`, { ...projected[i], catalog: kind, ...(demo ? { demoReference: t.demoReference } : {}) }))
  }
  const rows = pageRows.map((t) => publicByKey.get(`${t.kind}:${t.project.id}`))

  return { rows, total, page, perPage, ...(facets ? { facets } : {}) }
})

/**
 * Facetas unidas de los dos catálogos: los tipos publicados (y cuántos de
 * cada), y en modo `filters` los municipios, zonas, códigos postales, estados
 * y situaciones. Sobre la base del listado, sin el resto de filtros.
 */
async function buildFacets(db: any, orgId: number, facetMode: string) {
  // La subconsulta de la ficha ampliada, con su tabla escrita a mano y su
  // property_kind (si no, `id`/`organization_id` serían los de property_details).
  const detailFor = (kind: PropertyKind, col: 'municipality' | 'neighborhood' | 'listing_situation'): SQL<string | null> => {
    const name = kind === 'agent' ? sql.raw('"agent_properties"') : sql.raw('"developer_properties"')
    return sql<string | null>`(select pd.${sql.raw(col)} from property_details pd where pd.organization_id = ${name}."organization_id" and pd.property_kind = ${kind} and pd.property_id = ${name}."id" limit 1)`
  }
  const baseFor = (kind: PropertyKind) => {
    const T = FNS[kind].table
    const conds: SQL[] = [eq(T.organizationId, orgId), livePropertyCond(T)]
    if (kind === 'agent') conds.push(sql`${T.status} <> 'sold'`)
    return and(...conds)
  }

  // Tipos publicados y su recuento, sumando los dos catálogos.
  const typeSet = new Set<string>()
  const typeCounts: Record<string, number> = {}
  for (const kind of KINDS) {
    const T = FNS[kind].table
    const base = baseFor(kind)
    for (const r of (await db.selectDistinct({ type: T.propertyType }).from(T).where(base)) as { type: string | null }[]) {
      if (r.type) typeSet.add(String(r.type))
    }
    for (const r of (await db.select({ type: T.propertyType, n: sql<number>`count(*)` }).from(T).where(base).groupBy(T.propertyType)) as { type: string | null; n: number }[]) {
      if (r.type) typeCounts[String(r.type).trim()] = (typeCounts[String(r.type).trim()] ?? 0) + Number(r.n)
    }
  }

  // Distintos de una columna (o de una subconsulta de la ficha) unidos de los
  // dos catálogos, sin repetir (sin tildes/mayúsculas) y en orden alfabético.
  const distinct = async (colFor: (kind: PropertyKind) => any): Promise<string[]> => {
    const seen = new Map<string, string>()
    for (const kind of KINDS) {
      const T = FNS[kind].table
      for (const r of (await db.selectDistinct({ v: colFor(kind) }).from(T).where(baseFor(kind))) as { v: string | null }[]) {
        const v = r.v == null ? '' : String(r.v).trim()
        if (v && !seen.has(v.toLocaleLowerCase('es'))) seen.set(v.toLocaleLowerCase('es'), v)
      }
    }
    return [...seen.values()].sort((x, y) => x.localeCompare(y, 'es'))
  }

  return {
    types: orderPropertyTypes([...typeSet]),
    typeCounts,
    ...(facetMode === 'filters'
      ? {
          // La columna de la propiedad y la de su ficha ampliada, igual que los filtros `municipality`/`neighborhood`.
          municipalities: [...new Set([...(await distinct((k) => FNS[k].table.city as any)), ...(await distinct((k) => detailFor(k, 'municipality')))])].sort((x, y) => x.localeCompare(y, 'es')),
          neighborhoods: [...new Set([...(await distinct((k) => FNS[k].table.community as any)), ...(await distinct((k) => detailFor(k, 'neighborhood')))])].sort((x, y) => x.localeCompare(y, 'es')),
          postalCodes: await distinct((k) => FNS[k].table.postalCode as any),
          statuses: await distinct((k) => FNS[k].table.status as any),
          situations: (await distinct((k) => detailFor(k, 'listing_situation'))).filter((v) => (SITUATION_KEYS as readonly string[]).includes(v)),
        }
      : {}),
  }
}
