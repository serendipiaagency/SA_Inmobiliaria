import { and, eq, getTableName, isNull, like, or, sql, type SQL } from 'drizzle-orm'
import { schema } from '../db'
import { inJsonList } from '../sqlChunks'
import { locationVariants } from '../properties/locationIndex'
import { zoneMatch, zoneTree, type ZoneRow } from '../zones'
import { geoMunicipalitiesOf, geoPlace, geoIndex, loadGeoCatalog, type GeoPlace } from './catalog'
import { normalizePostalCode } from '../../../utils/publicSearch'
import { locationKindOfId, type LocationSelection } from '../../../utils/searchState'
import type { PropertyKind } from '../matching/service'

/**
 * Una ubicación elegida POR IDENTIFICADOR (entidad del catálogo de España o
 * zona de la agencia) → su condición SQL sobre las propiedades publicadas, y
 * su resolución a nombre y contexto para enseñarla. Cada nivel busca en su
 * ámbito real:
 *
 *  - municipio: su nombre (y cooficiales, y las formas guardadas en el
 *    inventario) en ciudad/municipio de la ficha, o un código postal suyo;
 *  - provincia: su nombre en la ficha ampliada, cualquiera de sus municipios
 *    en ciudad/municipio, o un CP que empiece por su código INE;
 *  - comunidad: su nombre o el de sus provincias en la ficha, o un CP de ellas;
 *  - localidad/barrio: su nombre en zona/barrio, dentro de su municipio;
 *  - código postal: exacto;
 *  - zona de la agencia: lo que la zona declara (municipio y/o barrio), sólo
 *    si la zona es de ESTA agencia (una zona ajena no encuentra nada).
 */

const NONE = sql`0`

/**
 * El catálogo (obra nueva o 2ª mano) sobre el que se construye la condición de
 * ubicación: su tabla (`P`) y su ficha ampliada (`details`). Antes esto estaba
 * fijado a `developer_properties`, así que en cuanto una búsqueda pública traía
 * una ubicación POR IDENTIFICADOR (`loc=es:mun:…`) el recuento/listado del
 * catálogo de 2ª mano (`agent_properties`) rompía con
 * «no such column: developer_properties.city» — el endpoint consulta los dos
 * catálogos, así que fallaba toda búsqueda por ubicación. La condición se
 * construye ahora con la tabla y el `property_kind` del catálogo en curso, igual
 * que el resto de filtros públicos (server/utils/properties/publicSearch.ts).
 */
interface LocationScope {
  P: typeof schema.developerProperties
  details: (cond: SQL) => SQL
}
function scopeFor(kind: PropertyKind): LocationScope {
  const P = (kind === 'agent' ? schema.agentProperties : schema.developerProperties) as typeof schema.developerProperties
  const name = sql.identifier(getTableName(P as any))
  const details = (cond: SQL): SQL =>
    sql`exists (select 1 from property_details pd where pd.organization_id = ${name}.organization_id and pd.property_kind = ${kind} and pd.property_id = ${name}.id and (${cond}))`
  return { P, details }
}

/** Las formas con las que se busca un nombre del catálogo: el nombre, sus cooficiales («Gijón/Xixón» → las dos) y las variantes guardadas en el inventario. */
async function namesOf(db: any, orgId: number, kind: 'municipality' | 'neighborhood' | 'province' | 'region', place: GeoPlace): Promise<string[]> {
  const parts = [place.name, ...place.name.split('/').map((s) => s.trim())].filter(Boolean)
  const out = new Set<string>(parts)
  if (kind !== 'region') for (const p of parts) for (const v of await locationVariants(db, orgId, kind, p)) out.add(v)
  return [...out]
}

function postalCodesOf(ine: string): string[] {
  return geoIndex().places.filter((p) => p.kind === 'postalCode' && p.ine.includes(ine)).map((p) => p.name)
}

async function municipalityCond(db: any, orgId: number, place: GeoPlace, { P, details }: LocationScope): Promise<SQL> {
  const names = await namesOf(db, orgId, 'municipality', place)
  const cps = place.ine[0] ? postalCodesOf(place.ine[0]) : []
  const parts: SQL[] = [inJsonList(P.city, names), details(inJsonList(sql`pd.municipality`, names))]
  if (cps.length) parts.push(inJsonList(P.postalCode, cps))
  return or(...parts)!
}

async function provinceCond(db: any, orgId: number, place: GeoPlace, { P, details }: LocationScope): Promise<SQL> {
  const names = await namesOf(db, orgId, 'province', place)
  const munNames = geoMunicipalitiesOf(place.id).flatMap((m) => [m.name, ...m.name.split('/').map((s) => s.trim())])
  const parts: SQL[] = [details(inJsonList(sql`pd.province`, names)), inJsonList(P.city, munNames), details(inJsonList(sql`pd.municipality`, munNames))]
  if (place.ine[0]) parts.push(like(P.postalCode, `${place.ine[0]}%`))
  return or(...parts)!
}

async function regionCond(db: any, orgId: number, place: GeoPlace, { P, details }: LocationScope): Promise<SQL> {
  const names = await namesOf(db, orgId, 'region', place)
  const provinces = geoIndex().places.filter((p) => p.kind === 'province' && p.regionId === place.id)
  const provNames = provinces.flatMap((p) => [p.name, ...p.name.split('/').map((s) => s.trim())])
  // Sus municipios (hasta ~800 en Andalucía): un solo parámetro JSON, nunca el tope de 100 de D1.
  const munNames = provinces.flatMap((p) => geoMunicipalitiesOf(p.id)).flatMap((m) => [m.name, ...m.name.split('/').map((s) => s.trim())])
  const parts: SQL[] = [details(inJsonList(sql`pd.region`, names)), details(inJsonList(sql`pd.province`, provNames)), inJsonList(P.city, munNames), details(inJsonList(sql`pd.municipality`, munNames))]
  const ines = provinces.map((p) => p.ine[0]).filter((x): x is string => !!x)
  if (ines.length) parts.push(inJsonList(sql`substr(${P.postalCode}, 1, 2)`, ines))
  return or(...parts)!
}

async function localityCond(db: any, orgId: number, place: GeoPlace, scope: LocationScope): Promise<SQL> {
  const { P, details } = scope
  const names = await namesOf(db, orgId, 'neighborhood', place)
  const inPlace = or(inJsonList(P.community, names), details(inJsonList(sql`pd.neighborhood`, names)))!
  const mun = place.municipalityId ? geoPlace(place.municipalityId) : null
  // Dentro de su municipio (otra agencia puede tener un «Centro» en cada ciudad), salvo que la ficha no diga municipio.
  if (!mun) return inPlace
  const munNames = await namesOf(db, orgId, 'municipality', mun)
  const noMunicipality = sql`(${P.city} is null or ${P.city} = '')`
  return and(inPlace, or(inJsonList(P.city, munNames), details(inJsonList(sql`pd.municipality`, munNames)), noMunicipality)!)!
}

function postalCodeCond(place: GeoPlace, { P }: LocationScope): SQL {
  const cp = normalizePostalCode(place.name)
  return cp ? eq(P.postalCode, cp) : NONE
}

async function zoneOf(db: any, orgId: number, id: string): Promise<{ zone: ZoneRow; tree: ReturnType<typeof zoneTree> } | null> {
  const zoneId = Number(id.slice('zone:'.length))
  if (!Number.isInteger(zoneId) || zoneId <= 0) return null
  const Z = schema.zones
  const rows: ZoneRow[] = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  const zone = rows.find((z) => z.id === zoneId)
  return zone ? { zone, tree: zoneTree(rows) } : null
}

async function zoneCond(db: any, orgId: number, id: string, { P, details }: LocationScope): Promise<SQL> {
  const z = await zoneOf(db, orgId, id)
  if (!z) return NONE
  const m = zoneMatch(z.zone, z.tree)
  const parts: SQL[] = []
  if (m.municipality) {
    const names = await locationVariants(db, orgId, 'municipality', m.municipality)
    parts.push(or(inJsonList(P.city, names), details(inJsonList(sql`pd.municipality`, names)))!)
  }
  if (m.neighborhood) {
    const names = await locationVariants(db, orgId, 'neighborhood', m.neighborhood)
    parts.push(or(inJsonList(P.community, names), details(inJsonList(sql`pd.neighborhood`, names)))!)
  }
  if (!parts.length) return NONE
  return and(...parts)!
}

/**
 * La condición de una ubicación elegida por identificador, sobre el catálogo
 * `kind` (obra nueva o 2ª mano); `0` (nada) si el id no existe o no es de esta
 * agencia. El catálogo es imprescindible: cada uno vive en su tabla
 * (`developer_properties` / `agent_properties`), y una condición escrita para
 * una no es válida sobre la otra.
 */
export async function locationCondById(db: any, orgId: number, id: string, kind: PropertyKind): Promise<SQL> {
  const level = locationKindOfId(id)
  if (!level) return NONE
  const scope = scopeFor(kind)
  if (level === 'zone') return zoneCond(db, orgId, id, scope)
  await loadGeoCatalog()
  const place = geoPlace(id)
  if (!place) return NONE
  if (place.kind === 'municipality') return municipalityCond(db, orgId, place, scope)
  if (place.kind === 'province') return provinceCond(db, orgId, place, scope)
  if (place.kind === 'region') return regionCond(db, orgId, place, scope)
  if (place.kind === 'locality') return localityCond(db, orgId, place, scope)
  return postalCodeCond(place, scope)
}

/** Los ids que contienen a una entidad (municipio → provincia y comunidad; barrio → municipio…), para las redundancias. */
export function geoParents(id: string): string[] {
  const place = geoPlace(id)
  if (!place) return []
  return [place.municipalityId, place.provinceId, place.regionId].filter((x): x is string => !!x && x !== id)
}

/** Nombre y contexto de cada id (catálogo o zona de esta agencia); los que no existen se omiten. */
export async function resolveLocationIds(db: any, orgId: number, ids: string[]): Promise<LocationSelection[]> {
  await loadGeoCatalog()
  const out: LocationSelection[] = []
  let zones: { rows: ZoneRow[]; tree: ReturnType<typeof zoneTree> } | null = null
  for (const id of ids.slice(0, 20)) {
    const kind = locationKindOfId(id)
    if (!kind) continue
    if (kind === 'zone') {
      if (!zones) {
        const Z = schema.zones
        const rows: ZoneRow[] = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
        zones = { rows, tree: zoneTree(rows) }
      }
      const zone = zones.rows.find((z) => z.id === Number(id.slice('zone:'.length)))
      if (!zone) continue
      const parent = zone.parentId != null ? zones.tree.byId.get(zone.parentId) : undefined
      out.push({ kind, value: zone.name, id, context: parent?.name ?? null })
      continue
    }
    const place = geoPlace(id)
    if (place) out.push({ kind, value: place.name, id, context: place.context, parents: geoParents(id) })
  }
  return out
}
