import { hasValidCoords } from './maps/coords'
import { energyCardVisible, energyData, type EnergyDisplayOptions } from './energyCertificate'
import { buildQuickFacts } from './quickFacts'
import { buildingRows, conditionRows } from './propertyFacts'
import { derivedCons, derivedPros, fichaHighlights } from './fichaHighlights'

/**
 * Qué secciones de la ficha pública tienen datos de verdad (megaprompt
 * «ficha», regla 8). Una sección sin datos se oculta entera —título,
 * tarjeta, separador y su entrada en la barra de apartados—; en el
 * Constructor sigue en la lista, con el aviso de que no saldrá. La ficha
 * pública y la vista del Constructor usan esta misma función, así que lo que
 * avisa el Constructor es lo que hace la web.
 *
 * El cero no es ausencia: 0 plazas de garaje o 0 terrazas son datos (las
 * filas de cada tarjeta ya lo tratan así, utils/propertyFacts.ts); un precio
 * 0, en cambio, no es un precio de venta y no da para una hipoteca.
 */

export interface FichaDataContext {
  project: Record<string, any>
  details?: Record<string, any> | null
  /** Lo que sólo sabe el servidor (/api/public/properties/<slug> → availability). */
  availability?: { score?: boolean; priceHistory?: boolean; similar?: boolean } | null
  counts?: Partial<Record<'quickFacts' | 'floorPlans' | 'condition' | 'building' | 'documents' | 'amenities' | 'customFields' | 'unitTypes' | 'photos' | 'resumen', number>>
  energy?: EnergyDisplayOptions
  /** Lo que el navegador averigua al cargar una sección (entorno sin servicios, similares sin parecidas). */
  emptyAtRuntime?: Set<string>
}

const positive = (v: unknown) => typeof v === 'number' ? v > 0 : Number(v) > 0

export function fichaSectionHasData(key: string, c: FichaDataContext): boolean {
  const p = c.project || {}
  const n = (k: keyof NonNullable<FichaDataContext['counts']>) => (c.counts?.[k] ?? 0) > 0
  if (c.emptyAtRuntime?.has(key)) return false
  switch (key) {
    case 'datos':
      return n('quickFacts')
    case 'energia':
      return !!c.energy && energyCardVisible(energyData(p, c.details), c.energy)
    case 'score':
      return c.availability?.score !== false
    case 'plano-estado':
      return n('floorPlans') || n('condition')
    case 'edificio-documentacion':
      return n('building') || n('documents')
    case 'comodidades':
      return n('amenities')
    case 'mas-informacion':
      return n('customFields')
    case 'tipologias':
      return n('unitTypes')
    case 'resumen':
      return n('resumen')
    case 'analisis':
      // El análisis compara precio y superficie con el mercado: sin ellos, no hay nada que analizar.
      return positive(p.price) && positive(p.area)
    case 'precio':
      return c.availability?.priceHistory !== false
    case 'servicios':
      // El entorno sale de las coordenadas reales; sin ellas, no hay servicios que contar.
      return hasValidCoords(p as any)
    case 'ubicacion':
      return hasValidCoords(p as any)
    case 'orientacion':
      return typeof p.orientation === 'string' && p.orientation.trim() !== ''
    case 'hipoteca':
      // Una hipoteca es de una compra con precio: ni en alquiler ni con precio 0.
      return positive(p.price) && p.transactionType !== 'rent'
    case 'staging':
      return n('photos')
    case 'historia':
      return !!(p.publishedAt || p.handoverDate || p.constructionPercentage != null || ['new', 'under_construction', 'ready'].includes(p.status))
    case 'similares':
      return c.availability?.similar !== false
    default:
      // «Pregúntale» y lo que no depende de datos de la propiedad.
      return true
  }
}

/** Las que, sin datos, no tienen nada que pintar: no salen nunca vacías, con la regla o sin ella. */
export const FICHA_NEEDS_DATA = new Set(['energia', 'plano-estado', 'edificio-documentacion', 'staging'])

/**
 * ¿Sale la sección en la web? Con «Ocultar automáticamente si no hay datos»
 * (`hideEmpty`, de partida), sólo si tiene datos; sin la regla, también
 * vacía (con su propio aviso), salvo las que no tendrían nada que pintar.
 */
export function fichaSectionVisible(key: string, c: FichaDataContext, hideEmpty: boolean): boolean {
  return (!hideEmpty && !FICHA_NEEDS_DATA.has(key)) || fichaSectionHasData(key, c)
}

/** Las secciones de la lista que no saldrían en la web por falta de datos. */
export function fichaEmptySections(keys: string[], c: FichaDataContext, hideEmpty = true): Set<string> {
  return new Set(keys.filter((k) => !fichaSectionVisible(k, c, hideEmpty)))
}

type Translate = (key: string, fallback: string) => string

/** Lo que devuelve /api/public/properties/<slug> (y la propiedad de ejemplo del Constructor). */
export interface FichaPayload {
  project: Record<string, any>
  details?: Record<string, any> | null
  gallery?: { image?: string | null }[] | null
  media?: { mediaType?: string | null }[] | null
  documents?: unknown[] | null
  floorPlans?: { image?: string | null }[] | null
  amenities?: unknown[] | null
  customFields?: unknown[] | null
  unitTypes?: unknown[] | null
  availability?: FichaDataContext['availability']
}

/**
 * Lo que necesita fichaSectionHasData a partir de la respuesta de la ficha,
 * contado con las mismas funciones que pintan cada tarjeta. Lo usan la ficha
 * pública y la vista del Constructor: así el aviso «se ocultará en la web
 * pública» y lo que hace la web no pueden divergir.
 */
export function fichaDataContext(
  d: FichaPayload,
  opts: { t: Translate; typeLabel: (type: string) => string; formatMoney?: (n: number) => string; showDescription: boolean; energy?: EnergyDisplayOptions; emptyAtRuntime?: Set<string> },
): FichaDataContext {
  const p = d.project || {}
  const details = d.details || null
  const { t } = opts
  const photos = new Set<string>()
  if (p.coverImage) photos.add(String(p.coverImage))
  for (const g of d.gallery || []) if (g?.image) photos.add(String(g.image))
  const highlights = fichaHighlights(p, t)
  const shown = new Set(highlights.source === 'data' && opts.showDescription ? highlights.items : [])
  const pros = derivedPros(p, t).filter((x) => !shown.has(x))
  return {
    project: p,
    details,
    availability: d.availability,
    counts: {
      quickFacts: buildQuickFacts(p as any, details, t, opts.typeLabel).some((f) => f.key !== 'propertyType' && f.key !== 'yearBuilt') ? 1 : 0,
      floorPlans: (d.floorPlans || []).filter((f) => !!f?.image).length,
      condition: conditionRows(p as any, details as any, t).length,
      building: buildingRows(p as any, details as any, t, opts.formatMoney).length,
      documents: (d.media || []).filter((m) => m?.mediaType === 'pdf').length + (d.documents || []).length,
      amenities: (d.amenities || []).length,
      customFields: (d.customFields || []).length,
      unitTypes: (d.unitTypes || []).length,
      photos: photos.size,
      resumen: p.aiSummary || pros.length || derivedCons(p, t).length ? 1 : 0,
    },
    energy: opts.energy,
    emptyAtRuntime: opts.emptyAtRuntime,
  }
}
