/**
 * Los puntos destacados del bloque verde de «Descripción» de la ficha
 * (#111). Primero, lo que la agencia escribió en «Puntos clave» de la
 * propiedad (`keyHighlights`: uno por línea, o separados por «;», «•» o, en
 * una sola línea, por comas). Sin ellos, los que se deducen de datos
 * estructurados reales de la propiedad. Nunca frases de relleno: sin datos,
 * no hay bloque.
 */

type Translate = (key: string, fallback: string) => string

export interface HighlightsProject {
  bedrooms?: number | null
  handoverDate?: string | null
  keyHighlights?: string | null
  hasPool?: number | boolean | null
  hasGarage?: number | boolean | null
  hasGarden?: number | boolean | null
  hasTerrace?: number | boolean | null
  hasElevator?: number | boolean | null
  accessible?: number | boolean | null
  orientation?: string | null
  energyRating?: string | null
  rentalYield?: number | null
  status?: string | null
}

const MAX = 6

export function splitHighlights(text: string | null | undefined): string[] {
  const raw = String(text || '').trim()
  if (!raw) return []
  let parts = raw.split(/\r?\n|;|•/)
  if (parts.length === 1) parts = raw.split(',')
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const v = p.replace(/^[\s\-–—*·]+/, '').trim()
    if (!v || seen.has(v.toLocaleLowerCase('es'))) continue
    seen.add(v.toLocaleLowerCase('es'))
    out.push(v.charAt(0).toLocaleUpperCase('es') + v.slice(1))
  }
  return out.slice(0, MAX)
}

/** Las ventajas que dicen los datos de la propiedad (las mismas de «Lo que debes saber»). */
export function derivedPros(p: HighlightsProject, t: Translate): string[] {
  const o: string[] = []
  if (p.orientation && ['S', 'SW', 'SE'].includes(p.orientation)) o.push(t('propertyDetails.pros.southFacing', 'Muy luminoso — orientación sur'))
  if (p.energyRating && ['A', 'B'].includes(p.energyRating)) o.push(`${t('propertyDetails.pros.energyEfficient', 'Alta eficiencia energética')} (${p.energyRating})`)
  if (p.status === 'ready') o.push(t('propertyDetails.pros.readyToMoveIn', 'Listo para entrar a vivir'))
  if (p.hasPool) o.push(t('propertyDetails.pros.pool', 'Piscina en la comunidad'))
  if (p.hasGarage) o.push(t('propertyDetails.pros.garage', 'Plaza de garaje incluida'))
  if (p.hasGarden) o.push(t('propertyDetails.pros.garden', 'Jardín privado'))
  if (p.hasTerrace) o.push(t('ficha.pros.terrace', 'Con terraza'))
  if (p.rentalYield != null && p.rentalYield >= 6.5) o.push(`${t('propertyDetails.pros.yield', 'Rentabilidad destacada')} (${p.rentalYield}%)`)
  if (p.accessible) o.push(t('propertyDetails.pros.accessible', 'Vivienda accesible'))
  if (p.hasElevator) o.push(t('ficha.pros.elevator', 'Edificio con ascensor'))
  return o.slice(0, MAX)
}

/** Lo que conviene saber según los datos (la columna «A considerar» de «Lo que debes saber»). */
export function derivedCons(p: HighlightsProject, t: Translate): string[] {
  const o: string[] = []
  if (p.status === 'new') o.push(t('propertyDetails.cons.offPlan', 'Entrega sobre plano — planifica la mudanza'))
  if (p.status === 'under_construction' && p.handoverDate) o.push(`${t('propertyDetails.cons.handoverExpected', 'Entrega prevista')}: ${p.handoverDate}`)
  if (!p.hasElevator && (p.bedrooms || 0) >= 2) o.push(t('propertyDetails.cons.checkElevator', 'Consulta disponibilidad de ascensor'))
  if (p.energyRating && ['D', 'E', 'F', 'G'].includes(p.energyRating)) o.push(t('propertyDetails.cons.improvableEfficiency', 'Eficiencia energética mejorable'))
  if (p.orientation === 'N') o.push(t('propertyDetails.cons.northFacing', 'Orientación norte — menos luz directa'))
  return o.slice(0, 4)
}

export function fichaHighlights(p: HighlightsProject, t: Translate): { source: 'editorial' | 'data' | null; items: string[] } {
  const editorial = splitHighlights(p.keyHighlights)
  if (editorial.length) return { source: 'editorial', items: editorial }
  const data = derivedPros(p, t).slice(0, 4)
  return data.length ? { source: 'data', items: data } : { source: null, items: [] }
}
