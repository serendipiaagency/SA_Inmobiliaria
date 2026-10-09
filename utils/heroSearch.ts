import { PROPERTY_TYPE_TREE, type Operation } from './searchState'
import { relativeLuminance } from './contactTone'

/**
 * El buscador del Hero de la portada (components/HeroSearch.vue): lo que el
 * Constructor Web ajusta de su presentación y lo que el Hero calcula para
 * enseñarlo. La búsqueda en sí es la de Property Search (utils/searchState.ts
 * y la URL de /propiedades): aquí no hay otra lógica de filtros.
 */

// ---------------------------------------------------------------------------
// Opciones del Constructor (contenido del bloque «hero»)
// ---------------------------------------------------------------------------

/** Los cuatro campos de la barra, en su orden de partida. Baños y superficie van en «Más filtros». */
export const HERO_SEARCH_FIELDS = [
  { key: 'type', label: 'Tipo de inmueble' },
  { key: 'location', label: 'Ubicación' },
  { key: 'price', label: 'Precio' },
  { key: 'beds', label: 'Habitaciones' },
] as const
export type HeroSearchField = (typeof HERO_SEARCH_FIELDS)[number]['key']
const FIELD_KEYS = HERO_SEARCH_FIELDS.map((f) => f.key) as string[]

export interface HeroFieldSetting {
  key: HeroSearchField
  visible: boolean
}

export type HeroSearchRadius = 'md' | 'lg' | 'pill'
export const HERO_SEARCH_RADIUS_PX: Record<HeroSearchRadius, number> = { md: 14, lg: 22, pill: 999 }

export interface HeroSearchOptions {
  /** Los campos en su orden, con su visibilidad (siempre los cuatro). */
  fieldList: HeroFieldSetting[]
  /** Sólo los visibles, en orden: lo que pinta la barra. */
  fields: HeroSearchField[]
  /** Texto del botón; vacío = «Buscar» en el idioma de la web. */
  buttonLabel: string
  showMoreFilters: boolean
  /** Con qué operación arranca el selector (si no se vuelve de una búsqueda). */
  defaultOperation: Operation
  /** Color del botón «Buscar» y del selector activo (#rrggbb); vacío = el color de marca. */
  buttonColor: string
  radius: HeroSearchRadius
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/** La lista de campos completa y en orden: los que vengan (sin repetir) y, detrás, los que falten, visibles. */
export function normalizeHeroFields(value: unknown): HeroFieldSetting[] {
  const out: HeroFieldSetting[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(value) ? value : []) {
    const key = typeof item?.key === 'string' ? item.key : ''
    if (!FIELD_KEYS.includes(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ key: key as HeroSearchField, visible: item.visible !== false })
  }
  for (const key of FIELD_KEYS) if (!seen.has(key)) out.push({ key: key as HeroSearchField, visible: true })
  return out
}

export function heroSearchOptions(content: Record<string, any> | null | undefined): HeroSearchOptions {
  const fieldList = normalizeHeroFields(content?.searchFields)
  return {
    fieldList,
    fields: fieldList.filter((f) => f.visible).map((f) => f.key),
    buttonLabel: typeof content?.searchButtonLabel === 'string' ? content.searchButtonLabel.trim().slice(0, 40) : '',
    showMoreFilters: content?.showMoreFilters !== false,
    defaultOperation: content?.defaultOperation === 'alquiler' ? 'alquiler' : 'venta',
    buttonColor: isHex(content?.searchButtonColor) ? content!.searchButtonColor.toLowerCase() : '',
    radius: content?.searchRadius === 'md' || content?.searchRadius === 'pill' ? content.searchRadius : 'lg',
  }
}

// ---------------------------------------------------------------------------
// Color del botón: el de la marca (o el elegido), siempre con texto legible
// ---------------------------------------------------------------------------

/** Tinta de la web: el botón de siempre cuando la empresa no tiene color de marca. */
export const HERO_DEFAULT_BUTTON = '#16150f'
/** Contraste mínimo del texto blanco sobre el botón (WCAG AA). */
export const HERO_MIN_CONTRAST = 4.5

type Rgb = [number, number, number]
function parseHex(v: string | null | undefined): Rgb | null {
  if (!isHex(v)) return null
  const n = parseInt(v.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: Rgb) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
const contrastWithWhite = (c: Rgb) => 1.05 / (relativeLuminance(c) + 0.05)

/**
 * El fondo del botón «Buscar» (y del selector Comprar/Alquilar activo): el
 * color elegido en el Constructor o, sin él, el color de marca de la empresa;
 * sin ninguno, la tinta de la web. Un color claro se oscurece (mismo tono)
 * hasta que el texto blanco se lee bien: nunca un botón ilegible.
 */
export function heroButtonColors(chosen: string | null | undefined, brand: string | null | undefined): { bg: string; fg: string } {
  const base = parseHex(chosen) || parseHex(brand) || parseHex(HERO_DEFAULT_BUTTON)!
  let c: Rgb = base
  for (let i = 0; i < 40 && contrastWithWhite(c) < HERO_MIN_CONTRAST; i++) c = c.map((x) => x * 0.92) as Rgb
  return { bg: toHex(c), fg: '#ffffff' }
}

// ---------------------------------------------------------------------------
// «Tipo de inmueble»: lo elegido, resumido en la barra
// ---------------------------------------------------------------------------

type Translate = (key: string, fallback: string) => string

/**
 * «Viviendas», «Pisos», «Piso y ático» o «3 tipos seleccionados». Una
 * categoría o familia entera (de lo que la agencia tiene publicado) cuenta
 * como una: así «Viviendas» no se lee «8 tipos seleccionados». Vacío = sin
 * tipo elegido (el campo enseña «Cualquiera»).
 */
export function heroTypeSummary(types: string[], subtypes: string[], available: string[], t: Translate, typeLabel: (type: string) => string, subtypeLabel: (subtype: string) => string): string {
  const avail = new Set(available)
  const chosen = new Set(types)
  const items: string[] = []
  const used = new Set<string>()
  for (const cat of PROPERTY_TYPE_TREE) {
    const catTypes = cat.families.flatMap((f) => f.types).filter((ty) => avail.has(ty))
    if (cat.families.length > 1 && catTypes.length > 1 && catTypes.every((ty) => chosen.has(ty))) {
      items.push(t(cat.label[0], cat.label[1]))
      catTypes.forEach((ty) => used.add(ty))
      continue
    }
    for (const fam of cat.families) {
      const famTypes = fam.types.filter((ty) => avail.has(ty))
      if (cat.families.length > 1 && famTypes.length > 1 && famTypes.every((ty) => chosen.has(ty))) {
        items.push(t(fam.label[0], fam.label[1]))
        famTypes.forEach((ty) => used.add(ty))
      }
    }
  }
  for (const ty of types) if (!used.has(ty)) items.push(typeLabel(ty))
  for (const s of subtypes) items.push(subtypeLabel(s))
  if (!items.length) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} ${t('facts.and', 'y')} ${items[1]!.charAt(0).toLocaleLowerCase() + items[1]!.slice(1)}`
  return t('hero.typesSelected', '{n} tipos seleccionados').replace('{n}', String(items.length))
}

// ---------------------------------------------------------------------------
// «Más filtros (n)»: sólo lo de dentro del panel, contado de verdad
// ---------------------------------------------------------------------------

export interface HeroExtraFilters {
  baths: number
  minArea: number | ''
  maxArea: number | ''
  estado: string[]
  features: string[]
  orientation: string
  energy: string
  minYield: number | ''
  rentalTerms: string[]
  situations: string[]
}

/**
 * Cuántos filtros de «Más filtros» hay puestos: cada opción marcada cuenta
 * una; la superficie (mínima y/o máxima) cuenta una. Los cuatro campos de la
 * barra y el orden de los resultados no cuentan.
 */
export function countHeroExtraFilters(f: HeroExtraFilters, operation: Operation): number {
  let n = 0
  if (f.baths > 0) n++
  if (f.minArea !== '' || f.maxArea !== '') n++
  n += f.estado.length
  n += f.features.filter((k) => k !== 'expensesIncluded' || operation === 'alquiler').length
  if (f.orientation) n++
  if (f.energy) n++
  if (f.minYield !== '' && operation === 'venta') n++
  if (operation === 'alquiler') n += f.rentalTerms.length
  n += f.situations.length
  return n
}
