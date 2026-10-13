import { normalizeText } from '../../../utils/searchState'

/**
 * Catálogo geográfico de España del buscador público, compartido por todas
 * las agencias: comunidades autónomas, provincias, municipios (código INE),
 * localidades y barrios, y códigos postales, con sus coordenadas. Sale de
 * `public/geo/es.json`, generado por `scripts/geo/build-es.mjs` a partir de
 * GeoNames (CC-BY 4.0). Es un dato de referencia inmutable.
 *
 * Dónde vive: como fichero estático de la web (binding `ASSETS` del Worker),
 * NO dentro del bundle del script — son ~2 MB (≈700 KB comprimidos) que
 * sumados al Worker lo acercarían al límite de tamaño de Cloudflare. Se lee
 * una vez por aislado, al primer uso (`loadGeoCatalog()`), y se indexa en
 * memoria; en Node (servidor de desarrollo, pruebas) se lee del disco.
 *
 * Lo que hace: encontrar una entidad real a partir de lo escrito, tolerando
 * texto parcial, prefijos, mayúsculas, tildes, variantes cooficiales
 * («Xixón» → Gijón) y errores tipográficos razonables, con un ranking
 * determinista. Lo que NO hace: inventar sitios, ni decidir si tienen
 * inventario (eso lo dicen las propiedades de cada agencia).
 */

export type GeoKind = 'region' | 'province' | 'municipality' | 'locality' | 'postalCode'

export interface GeoPlace {
  /** Identificador estable y canónico: es:ccaa:34, es:prov:33, es:mun:33024, es:loc:3108732, es:cp:33201. */
  id: string
  kind: GeoKind
  /** Nombre que se enseña (oficial; con las cooficiales tras «/»). */
  name: string
  /** «Asturias» para un municipio, «Gijón/Xixón» para un barrio, «Principado de Asturias» para una provincia… */
  context: string | null
  lat: number
  lng: number
  population: number
  /** Jerarquía: ids de la provincia y la comunidad, y del municipio en localidades y CP. */
  regionId: string | null
  provinceId: string | null
  municipalityId: string | null
  /** Códigos INE del municipio (localidad, CP y municipio) o de la provincia. */
  ine: string[]
  /** Formas normalizadas por las que se encuentra (nombre y cooficiales). */
  keys: string[]
}

type Raw = {
  source: string
  generatedAt: string
  regions: [string, string, number, number, number, string[]][]
  provinces: [string, string | null, string, string, number, number, number, string[]][]
  municipalities: [string, string, string, number, number, number, string[]][]
  localities: [number, string, string, string, number, number, number][]
  postalCodes: [string, string[], number, number][]
}

/** Ruta pública del catálogo (fichero estático de la web). */
export const GEO_ASSET_PATH = '/geo/es.json'
const GEO_SOURCE_DEFAULT = 'GeoNames (https://www.geonames.org/), licencia CC-BY 4.0'

let raw: Raw | null = null
let loading: Promise<void> | null = null

/** Atribución de la fuente (GeoNames, CC-BY 4.0) y fecha de generación del catálogo cargado. */
export function geoSource(): string {
  return raw?.source ?? GEO_SOURCE_DEFAULT
}
export function geoGeneratedAt(): string | null {
  return raw?.generatedAt ?? null
}
export function geoCatalogLoaded(): boolean {
  return raw !== null
}

/** Fija el catálogo ya leído (pruebas, o quien lo tenga a mano): sin red ni disco. */
export function setGeoCatalog(data: unknown): void {
  raw = data as Raw
  index = null
}

async function readRaw(): Promise<Raw> {
  // Worker (producción, `wrangler dev`): el fichero estático de la web, por el
  // binding de assets que Nitro deja en `globalThis.__env__`.
  const env = (globalThis as any).__env__
  const assets = env?.ASSETS
  if (assets && typeof assets.fetch === 'function') {
    const res: Response = await assets.fetch(new Request(`https://assets.local${GEO_ASSET_PATH}`))
    if (!res.ok) throw new Error(`Catálogo geográfico no disponible (${res.status})`)
    return (await res.json()) as Raw
  }
  // Node (servidor de desarrollo sin Worker, pruebas unitarias): del disco. El
  // especificador va en una variable para que el bundler del Worker no lo
  // resuelva: esta rama nunca corre allí.
  const fsModule = 'node:fs/promises'
  const pathModule = 'node:path'
  const [fs, path] = await Promise.all([import(/* @vite-ignore */ fsModule), import(/* @vite-ignore */ pathModule)])
  const file = path.join(process.cwd(), 'public', ...GEO_ASSET_PATH.split('/').filter(Boolean))
  return JSON.parse(await fs.readFile(file, 'utf8')) as Raw
}

/**
 * Carga el catálogo si aún no está (una vez por aislado; las llamadas
 * simultáneas comparten la misma lectura). Todo lo que use `geoIndex()`,
 * `geoPlace()` o `searchGeo()` tiene que haber esperado esto antes.
 */
export async function loadGeoCatalog(): Promise<void> {
  if (raw) return
  if (!loading) {
    loading = readRaw()
      .then((data) => {
        raw = data
        index = null
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

/** Peso de cada nivel a igualdad de coincidencia: municipios primero, luego localidades, provincias y comunidades. */
const KIND_WEIGHT: Record<GeoKind, number> = { municipality: 5, locality: 4, province: 3, region: 2, postalCode: 1 }
export const GEO_KINDS: GeoKind[] = ['municipality', 'locality', 'province', 'region', 'postalCode']

interface Index {
  places: GeoPlace[]
  byId: Map<string, GeoPlace>
  /** Municipios por provincia (código INE de dos cifras). */
  municipalitiesByProvince: Map<string, GeoPlace[]>
  /** Por las dos primeras letras de cada palabra de cada clave: los candidatos a exacta, prefijo y prefijo de palabra, sin recorrer el catálogo entero. */
  byWordStart: Map<string, GeoPlace[]>
  /** Por las dos primeras letras de cada clave entera: los candidatos a coincidencia aproximada. */
  byKeyStart: Map<string, GeoPlace[]>
  /** Las palabras de cada clave, calculadas una vez. */
  wordsOf: Map<string, string[]>
}

let index: Index | null = null

function keysOf(name: string, variants: string[]): string[] {
  const out = new Set<string>()
  const add = (s: string) => {
    const n = normalizeText(s).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
    if (n) out.add(n)
  }
  add(name)
  for (const v of variants) add(v)
  // «Castilla-La Mancha» también con espacio.
  if (name.includes('-')) add(name.replace(/-/g, ' '))
  return [...out]
}

function buildIndex(): Index {
  if (!raw) throw new Error('Catálogo geográfico sin cargar: hay que esperar a loadGeoCatalog() antes de usarlo')
  const data = raw
  const places: GeoPlace[] = []
  const regionById = new Map<string, GeoPlace>()
  for (const [id, name, lat, lng, pop, alt] of data.regions) {
    const p: GeoPlace = { id: `es:ccaa:${id}`, kind: 'region', name, context: 'España', lat, lng, population: pop, regionId: null, provinceId: null, municipalityId: null, ine: [], keys: keysOf(name, alt) }
    p.regionId = p.id
    regionById.set(id, p)
    places.push(p)
  }
  const provinceByLetter = new Map<string, GeoPlace>()
  const provinceByIne = new Map<string, GeoPlace>()
  for (const [letter, ine, regionCode, name, lat, lng, pop, alt] of data.provinces) {
    const region = regionById.get(regionCode) ?? null
    const p: GeoPlace = { id: `es:prov:${ine ?? letter}`, kind: 'province', name, context: region?.name ?? 'España', lat, lng, population: pop, regionId: region?.id ?? null, provinceId: null, municipalityId: null, ine: ine ? [ine] : [], keys: keysOf(name, alt) }
    p.provinceId = p.id
    provinceByLetter.set(letter, p)
    if (ine) provinceByIne.set(ine, p)
    places.push(p)
  }
  const municipalityByIne = new Map<string, GeoPlace>()
  const municipalitiesByProvince = new Map<string, GeoPlace[]>()
  for (const [ine, letter, name, lat, lng, pop, alt] of data.municipalities) {
    const prov = provinceByLetter.get(letter) ?? null
    const p: GeoPlace = { id: `es:mun:${ine}`, kind: 'municipality', name, context: prov?.name ?? null, lat, lng, population: pop, regionId: prov?.regionId ?? null, provinceId: prov?.id ?? null, municipalityId: null, ine: [ine], keys: keysOf(name, alt) }
    p.municipalityId = p.id
    municipalityByIne.set(ine, p)
    const ine2 = ine.slice(0, 2)
    municipalitiesByProvince.set(ine2, [...(municipalitiesByProvince.get(ine2) ?? []), p])
    places.push(p)
  }
  for (const [id, name, ine, , lat, lng, pop] of data.localities) {
    const mun = municipalityByIne.get(ine)
    if (!mun) continue
    places.push({ id: `es:loc:${id}`, kind: 'locality', name, context: mun.name, lat, lng, population: pop, regionId: mun.regionId, provinceId: mun.provinceId, municipalityId: mun.id, ine: [ine], keys: keysOf(name, []) })
  }
  for (const [cp, ines, lat, lng] of data.postalCodes) {
    const muns = ines.map((i) => municipalityByIne.get(i)).filter((m): m is GeoPlace => !!m)
    const prov = provinceByIne.get(cp.slice(0, 2)) ?? null
    const first = muns[0] ?? null
    places.push({
      id: `es:cp:${cp}`,
      kind: 'postalCode',
      name: cp,
      context: muns.length ? muns.map((m) => m.name).slice(0, 3).join(', ') : (prov?.name ?? null),
      lat,
      lng,
      population: 0,
      regionId: first?.regionId ?? prov?.regionId ?? null,
      provinceId: first?.provinceId ?? prov?.id ?? null,
      municipalityId: first?.id ?? null,
      ine: ines,
      keys: [cp],
    })
  }
  const byWordStart = new Map<string, GeoPlace[]>()
  const byKeyStart = new Map<string, GeoPlace[]>()
  const wordsOf = new Map<string, string[]>()
  const push = (map: Map<string, GeoPlace[]>, st: string, p: GeoPlace) => {
    const list = map.get(st)
    if (list) list.push(p)
    else map.set(st, [p])
  }
  for (const p of places) {
    const wordStarts = new Set<string>()
    const keyStarts = new Set<string>()
    for (const key of p.keys) {
      let words = wordsOf.get(key)
      if (!words) {
        words = key.split(/[\s-]+/).filter(Boolean)
        wordsOf.set(key, words)
      }
      for (const w of words) wordStarts.add(w.slice(0, 2))
      keyStarts.add(key.slice(0, 2))
    }
    for (const st of wordStarts) push(byWordStart, st, p)
    for (const st of keyStarts) push(byKeyStart, st, p)
  }
  return { places, byId: new Map(places.map((p) => [p.id, p])), municipalitiesByProvince, byWordStart, byKeyStart, wordsOf }
}

export function geoIndex(): Index {
  if (!index) index = buildIndex()
  return index
}

export function geoPlace(id: string): GeoPlace | null {
  return geoIndex().byId.get(id) ?? null
}

/** Los municipios de una provincia (por el id de la provincia o su código INE de dos cifras). */
export function geoMunicipalitiesOf(provinceIdOrIne: string): GeoPlace[] {
  const ine = provinceIdOrIne.replace(/^es:prov:/, '')
  return geoIndex().municipalitiesByProvince.get(ine) ?? []
}

/** Lo escrito, como clave de búsqueda: sin tildes ni mayúsculas, sólo letras, números, espacios y guiones. */
export function geoNeedle(q: string): string {
  return normalizeText(q).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Distancia de Damerau-Levenshtein (sustitución, inserción, borrado y
 * transposición de adyacentes) acotada: devuelve `max + 1` en cuanto se pasa.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1)
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]!
}

/** Cuántas letras puede tener mal lo escrito para que aún se encuentre: ninguna con menos de 4, una hasta 6, dos a partir de 7. */
export function typoBudget(needle: string): number {
  if (needle.length < 4) return 0
  return needle.length < 7 ? 1 : 2
}

export interface GeoMatch {
  place: GeoPlace
  /** Nivel de coincidencia: 5 exacta, 4 prefijo, 3 prefijo de palabra, 2 contiene, 1 aproximada. */
  tier: 1 | 2 | 3 | 4 | 5
  /** Puntuación total, mayor es mejor (determinista). */
  score: number
}

type TierHit = { tier: GeoMatch['tier']; distance: number } | null
/** Qué niveles comprobar: todos (candidatos por inicio de palabra), sólo «contiene» (recorrido completo) o sólo aproximada (candidatos por inicio de clave). */
type MatchMode = 'all' | 'contains' | 'approx'

/** Cómo casa lo escrito con una clave (exacta, prefijo, prefijo de palabra, contiene, aproximada); null = nada. */
function matchTier(needle: string, key: string, words: string[], budget: number, mode: MatchMode): TierHit {
  if (mode === 'all') {
    if (key === needle) return { tier: 5, distance: 0 }
    if (key.startsWith(needle)) return { tier: 4, distance: 0 }
    if (words.some((w) => w.startsWith(needle))) return { tier: 3, distance: 0 }
  }
  if (mode !== 'approx' && needle.length >= 3 && key.includes(needle)) return { tier: 2, distance: 0 }
  if (mode !== 'contains' && budget > 0) {
    // Aproximada: contra la clave entera, contra su primera palabra o contra el
    // principio de la clave del mismo largo (un prefijo con una letra cambiada).
    const candidates = [key, words[0]!, key.slice(0, needle.length)]
    let best = budget + 1
    for (const c of candidates) {
      if (!c || Math.abs(c.length - needle.length) > budget) continue
      const d = editDistance(needle, c, budget)
      if (d < best) best = d
    }
    if (best <= budget) return { tier: 1, distance: best }
  }
  return null
}

/**
 * Los inicios de clave (dos letras) donde buscar una coincidencia aproximada
 * de lo escrito: los que empiezan por la misma primera letra (el error está
 * más adelante: «oviedp», «barcelonna», «ovedo») y el de las dos primeras
 * cruzadas («voiedo»). Un error en la primera letra no se busca: es raro al
 * teclear y abrirlo multiplicaría por diez los candidatos de cada pulsación.
 */
function approxStarts(needle: string, starts: Iterable<string>): string[] {
  const first = needle.split(' ')[0] ?? needle
  const a = first[0] ?? ''
  const b = first[1] ?? ''
  const out: string[] = []
  for (const st of starts) if (st[0] === a || (b && st === b + a)) out.push(st)
  return out
}

export interface GeoSearchOptions {
  /** Cuántas como máximo (por defecto 12). */
  limit?: number
  /** Qué niveles buscar (por defecto todos; los CP sólo cuando se escriben cifras). */
  kinds?: GeoKind[]
  /** Un empujón determinista por entidad (p. ej. la zona habitual de la agencia): sólo reordena entre coincidencias del mismo nivel. */
  boost?: (place: GeoPlace) => number
}

/**
 * Buscar en el catálogo. Ranking: nivel de coincidencia (exacta > prefijo >
 * prefijo de palabra > contiene > aproximada), luego el empujón del contexto,
 * luego el peso del nivel geográfico (municipio > localidad > provincia >
 * comunidad > CP), luego población y, por último, el nombre. Determinista:
 * la misma consulta da siempre el mismo orden.
 */
export function searchGeo(q: string, opts: GeoSearchOptions = {}): GeoMatch[] {
  const needle = geoNeedle(q).slice(0, 60)
  if (!needle) return []
  const idx = geoIndex()
  const limit = Math.max(1, Math.min(opts.limit ?? 12, 50))
  const digits = /^\d+$/.test(needle)
  const kinds = new Set<GeoKind>(opts.kinds ?? (digits ? ['postalCode'] : GEO_KINDS.filter((k) => k !== 'postalCode')))
  const budget = digits ? 0 : typoBudget(needle)
  const out: GeoMatch[] = []
  // Lugares ya resueltos: evaluados del todo en el paso 1, o ya en la lista.
  const done = new Set<GeoPlace>()
  const consider = (place: GeoPlace, mode: MatchMode) => {
    if (done.has(place) || !kinds.has(place.kind)) return
    if (mode === 'all') done.add(place)
    let best: TierHit = null
    for (const key of place.keys) {
      const m = matchTier(needle, key, idx.wordsOf.get(key) ?? [key], budget, mode)
      if (m && (!best || m.tier > best.tier || (m.tier === best.tier && m.distance < best.distance))) best = m
      if (best?.tier === 5) break
    }
    if (!best) return
    done.add(place)
    const boost = Math.max(0, Math.min(opts.boost?.(place) ?? 0, 9))
    const score = best.tier * 1_000_000 - best.distance * 100_000 + boost * 10_000 + KIND_WEIGHT[place.kind] * 1_000 + Math.min(999, Math.round(Math.log10(place.population + 1) * 100))
    out.push({ place, tier: best.tier, score })
  }
  // 1. Exacta, prefijo y prefijo de palabra: sólo los candidatos con una
  //    palabra que empieza por las mismas dos letras que la primera de lo
  //    escrito (una letra sola: todos los cubos que empiezan por ella).
  const firstWord = needle.split(' ')[0] ?? needle
  if (firstWord.length >= 2) for (const p of idx.byWordStart.get(firstWord.slice(0, 2)) ?? []) consider(p, 'all')
  else for (const [start, list] of idx.byWordStart) if (start.startsWith(firstWord)) for (const p of list) consider(p, 'all')
  // 2. «Contiene» y aproximada sólo si con lo anterior no se llena la lista:
  //    nunca adelantan a una coincidencia mejor, así que de otro modo se
  //    quedarían fuera igual. «Contiene» recorre el catálogo (una búsqueda de
  //    subcadena por clave, barata); la aproximada sólo mira las claves cuyo
  //    inicio está a un error de lo escrito.
  const strong = out.filter((m) => m.tier >= 3).length
  if (strong < limit) {
    if (needle.length >= 3) for (const p of idx.places) consider(p, 'contains')
    if (budget > 0) for (const st of approxStarts(needle, idx.byKeyStart.keys())) for (const p of idx.byKeyStart.get(st) ?? []) consider(p, 'approx')
  }
  out.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, 'es') || a.place.id.localeCompare(b.place.id))
  return out.slice(0, limit)
}
