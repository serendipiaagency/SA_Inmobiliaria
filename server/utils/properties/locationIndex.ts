import { and, eq, getTableName, sql } from 'drizzle-orm'
import { schema } from '../db'
import { livePropertyCond } from './trash'
import { normalizeText, type LocationKind } from '../../../utils/searchState'
import { PROPERTY_KINDS, type PropertyKind } from '../matching/service'

/**
 * Las ubicaciones REALES de las propiedades publicadas de una agencia, por
 * tipo (provincia, municipio, barrio o zona, código postal, calle), con su
 * contexto geográfico y cuántas propiedades hay en cada una. De aquí salen las
 * sugerencias del buscador (/api/public/location-suggest) y, con los mismos
 * valores, el filtro (publicSearch.ts): lo que se sugiere es exactamente lo que
 * después se encuentra. Nada inventado: sin propiedades publicadas en un sitio,
 * ese sitio no existe aquí.
 *
 * Cuenta los DOS catálogos de Property Core: obra nueva (developer_properties)
 * y 2ª mano (agent_properties), para que una ubicación con sólo propiedades de
 * 2ª mano también se sugiera y se encuentre.
 *
 * Se agrupa sin tildes ni mayúsculas («Oviedo», «OVIEDO» → una entrada con sus
 * dos variantes guardadas). La calle sólo sale de propiedades con ubicación
 * exacta: la de una publicada como aproximada no se puede buscar.
 */

const PROPERTY_TABLES: Record<PropertyKind, typeof schema.developerProperties> = {
  developer: schema.developerProperties,
  agent: schema.agentProperties as unknown as typeof schema.developerProperties,
}

/** Niveles que salen del inventario (la comunidad autónoma y las zonas de la agencia no: el catálogo y las zonas van aparte). */
export type InventoryLocationKind = Exclude<LocationKind, 'zone' | 'region'>
export const INVENTORY_LOCATION_KINDS: InventoryLocationKind[] = ['province', 'municipality', 'neighborhood', 'postalCode', 'street']

export interface LocationEntry {
  kind: InventoryLocationKind
  key: string
  /** El nombre que se enseña: la variante guardada más frecuente. */
  value: string
  /** Todas las formas en que está guardado (lo que el filtro busca). */
  variants: string[]
  /** «Asturias» para un municipio, «Oviedo» para un barrio, un CP o una calle. */
  context: string | null
  count: number
}

interface Acc {
  kind: InventoryLocationKind
  key: string
  variants: Map<string, number>
  contexts: Map<string, number>
  ids: Set<string>
}

// Por organización, en este aislado, mientras sus propiedades no cambien:
// cada consulta compara una huella barata (cuántas hay y cuándo cambió la
// última, también en la ficha ampliada) y sólo recalcula el índice si es otra.
// Así, mientras se escribe en el buscador no se recorre todo en cada tecla, y
// una propiedad recién publicada se sugiere al momento, no al cabo de un rato.
const cache = new Map<number, { stamp: string; entries: LocationEntry[] }>()

export function forgetLocationIndex(orgId?: number) {
  if (orgId == null) cache.clear()
  else cache.delete(orgId)
}

async function indexStamp(db: any, orgId: number): Promise<string> {
  const parts: unknown[] = []
  for (const kind of PROPERTY_KINDS) {
    const P = PROPERTY_TABLES[kind]
    const [row] = (await db
      .select({
        n: sql<number>`count(*)`,
        ids: sql<number>`coalesce(sum(${P.id}), 0)`,
        at: sql<string | null>`max(${P.updatedAt})`,
        details: sql<string | null>`(select max(pd.updated_at) || ':' || count(*) from property_details pd where pd.organization_id = ${orgId} and pd.property_kind = ${kind})`,
      })
      .from(P)
      .where(and(eq(P.organizationId, orgId), livePropertyCond(P)))) as Array<Record<string, unknown>>
    parts.push(row?.n, row?.ids, row?.at, row?.details)
  }
  return parts.join('|')
}

/** Las ubicaciones de un catálogo: su columna propia y la de su ficha ampliada. */
async function catalogLocationRows(db: any, orgId: number, kind: PropertyKind): Promise<Array<Record<string, string | number | null>>> {
  const P = PROPERTY_TABLES[kind]
  const name = sql.identifier(getTableName(P as any))
  const detail = (col: string) => sql<string | null>`(select pd.${sql.raw(col)} from property_details pd where pd.organization_id = ${name}.organization_id and pd.property_kind = ${kind} and pd.property_id = ${name}.id limit 1)`
  return (await db
    .select({
      id: P.id,
      city: P.city,
      community: P.community,
      postalCode: P.postalCode,
      street: sql<string | null>`case when coalesce(${P.locationPrivacy}, 'exact') = 'exact' then ${P.street} end`,
      region: detail('region'),
      province: detail('province'),
      municipality: detail('municipality'),
      neighborhood: detail('neighborhood'),
    })
    .from(P)
    .where(and(eq(P.organizationId, orgId), livePropertyCond(P)))) as Array<Record<string, string | number | null>>
}

export async function locationIndex(db: any, orgId: number): Promise<LocationEntry[]> {
  const stamp = await indexStamp(db, orgId)
  const hit = cache.get(orgId)
  if (hit && hit.stamp === stamp) return hit.entries
  // Los dos catálogos a la vez. Los ids de agrupación/recuento llevan el
  // catálogo como prefijo para que un id de obra nueva y uno de 2ª mano no se
  // confundan al contar cuántas propiedades hay en una ubicación.
  const rows: Array<Record<string, string | number | null>> = []
  for (const kind of PROPERTY_KINDS) {
    for (const r of await catalogLocationRows(db, orgId, kind)) rows.push({ ...r, id: `${kind}:${r.id}` as unknown as string })
  }

  const acc = new Map<string, Acc>()
  const add = (kind: InventoryLocationKind, raw: unknown, context: unknown, id: string) => {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) return
    const key = normalizeText(value)
    const k = `${kind}:${key}`
    const a = acc.get(k) ?? { kind, key, variants: new Map(), contexts: new Map(), ids: new Set<string>() }
    a.variants.set(value, (a.variants.get(value) ?? 0) + 1)
    const ctx = typeof context === 'string' ? context.trim() : ''
    if (ctx && normalizeText(ctx) !== key) a.contexts.set(ctx, (a.contexts.get(ctx) ?? 0) + 1)
    a.ids.add(id)
    acc.set(k, a)
  }
  for (const r of rows) {
    const id = String(r.id)
    const municipality = (r.municipality || r.city) as string | null
    add('province', r.province, r.region, id)
    // Las dos columnas que mira el filtro de municipio, y las dos del de barrio.
    add('municipality', r.city, r.province, id)
    add('municipality', r.municipality, r.province, id)
    add('neighborhood', r.community, municipality, id)
    add('neighborhood', r.neighborhood, municipality, id)
    add('postalCode', typeof r.postalCode === 'string' ? r.postalCode.replace(/\s+/g, '').toUpperCase() : null, municipality, id)
    add('street', r.street, municipality, id)
  }

  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0]?.[0] ?? null
  const entries: LocationEntry[] = [...acc.values()].map((a) => ({
    kind: a.kind,
    key: a.key,
    value: top(a.variants)!,
    variants: [...a.variants.keys()],
    context: top(a.contexts),
    count: a.ids.size,
  }))
  entries.sort((x, y) => INVENTORY_LOCATION_KINDS.indexOf(x.kind) - INVENTORY_LOCATION_KINDS.indexOf(y.kind) || y.count - x.count || x.value.localeCompare(y.value, 'es'))
  cache.set(orgId, { stamp, entries })
  return entries
}

/**
 * Las formas guardadas de una ubicación elegida: la elegida tal cual y las
 * demás variantes del índice («Gijón», «GIJON»…). La elegida va siempre, así
 * que el filtro nunca depende de que el índice esté al día.
 */
export async function locationVariants(db: any, orgId: number, kind: LocationKind, value: string): Promise<string[]> {
  if (kind === 'zone' || kind === 'region') return [value.trim()].filter(Boolean)
  const key = normalizeText(value)
  const known = (await locationIndex(db, orgId)).find((e) => e.kind === kind && e.key === key)?.variants ?? []
  return [...new Set([value.trim(), ...known].filter(Boolean))]
}

/**
 * Sugerencias para lo escrito: sin tildes ni mayúsculas, coincidencias
 * parciales; primero las que empiezan por lo escrito y las que más
 * propiedades tienen. Sin texto, las zonas con más propiedades.
 */
export function suggestLocations(entries: LocationEntry[], q: string, perKind = 6): LocationEntry[] {
  const needle = normalizeText(q)
  const out: LocationEntry[] = []
  for (const kind of INVENTORY_LOCATION_KINDS) {
    const list = entries.filter((e) => e.kind === kind)
    if (!needle) {
      // Sin texto: municipios y barrios con más propiedades (lo útil para empezar).
      if (kind === 'municipality' || kind === 'neighborhood') out.push(...[...list].sort((a, b) => b.count - a.count).slice(0, 5))
      continue
    }
    const matches = list
      .filter((e) => e.key.includes(needle) || e.variants.some((v) => normalizeText(v).includes(needle)))
      .map((e) => ({ e, starts: e.key.startsWith(needle) || e.key.split(/[\s-]/).some((w) => w.startsWith(needle)) }))
      .sort((a, b) => Number(b.starts) - Number(a.starts) || b.e.count - a.e.count || a.e.value.localeCompare(b.e.value, 'es'))
      .slice(0, perKind)
      .map((m) => m.e)
    out.push(...matches)
  }
  return out
}
