import { PROPERTY_CONDITION_LABELS, PROPERTY_SHEET_FIELD_MAP } from './propertySheet'
import { RENTAL_TERM_LABELS, SITUATION_LABELS } from './searchState'

/**
 * «Estado del inmueble» y «El edificio» de la ficha pública (#110): qué filas
 * se enseñan y con qué texto, a partir de la propiedad pública y de su ficha
 * ampliada pública (sólo los campos públicos del PropertySchemaRegistry).
 *
 * Reglas:
 *  - Sólo lo que consta. Un dato vacío no sale, y nunca se deduce de las
 *    fotos ni se inventa.
 *  - Desconocido no es «No». En la ficha ampliada un sí/no guarda 1, 0 o
 *    NULL: 0 es un «No» que la agencia ha marcado y sí se enseña. «Amueblado»
 *    guarda yes / no / partially o NULL, así que su «No» también se enseña.
 *    Las casillas de la propiedad (ascensor, accesible) valen 0 por defecto:
 *    ahí 0 no se distingue de «sin indicar» y sólo se enseña el «Sí».
 *  - Una fuente por concepto: la calefacción sale en el inmueble, no en el
 *    edificio; el año de construcción, en el edificio.
 */

export interface FactRow {
  key: string
  /** Clave del icono (utils/featureIcons.ts). */
  icon: string
  label: string
  value: string
}

type Translate = (key: string, fallback: string) => string
type Sheet = Record<string, unknown> | null | undefined

export interface FactsProject {
  condition?: string | null
  status?: string | null
  yearBuilt?: number | null
  hasElevator?: number | null
  accessible?: number | null
  /** yes | no | partially; NULL = sin indicar. */
  furnished?: string | null
  /** sale | rent; NULL = venta (obra nueva sin operación indicada). */
  transactionType?: string | null
}

const yes = (t: Translate) => t('facts.yes', 'Sí')
const no = (t: Translate) => t('facts.no', 'No')

function opt(field: string, value: unknown): string {
  if (value == null || value === '') return ''
  const v = String(value)
  return PROPERTY_SHEET_FIELD_MAP[field]?.optionLabels?.[v] || v
}
/** Sí / No de la ficha ampliada: 1 → «Sí», 0 → «No», NULL → nada. */
function triState(v: unknown, t: Translate): string {
  if (v === 1 || v === true || v === '1') return yes(t)
  if (v === 0 || v === false || v === '0') return no(t)
  return ''
}
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function conditionRows(project: FactsProject, sheet: Sheet, t: Translate): FactRow[] {
  const d = sheet || {}
  const rows: FactRow[] = []
  const push = (key: string, icon: string, label: string, value: string) => {
    if (value) rows.push({ key, icon, label, value })
  }

  // Estado general: el estado físico guardado; si no consta y la promoción es
  // obra nueva o está en construcción, eso es lo que es (dato de la ficha, no
  // una suposición).
  const general = project.condition ? PROPERTY_CONDITION_LABELS[project.condition] || project.condition : project.status === 'new' || project.status === 'under_construction' ? t('facts.newBuild', 'Obra nueva') : ''
  push('condition', 'condition', t('facts.general', 'Estado general'), general)
  const renovated = triState(d.isRenovated, t)
  push('renovated', 'renovation', t('facts.renovated', 'Reformado'), renovated)
  push('kitchen', 'kitchen', t('facts.kitchen', 'Cocina'), [opt('kitchenEquipment', d.kitchenEquipment), opt('kitchenType', d.kitchenType)].filter(Boolean).join(' · '))
  push('bathrooms', 'bathrooms', t('facts.bathrooms', 'Baños'), opt('bathroomsCondition', d.bathroomsCondition))
  push('windows', 'windows', t('facts.windows', 'Ventanas'), [opt('carpentry', d.carpentry), opt('glazing', d.glazing)].filter(Boolean).join(' · '))
  push('flooring', 'flooring', t('facts.flooring', 'Suelos'), opt('flooring', d.flooring))
  push('installations', 'installations', t('facts.installations', 'Instalaciones'), opt('installationsCondition', d.installationsCondition))
  push('heating', 'heating', t('facts.heating', 'Calefacción'), opt('heating', d.heating))
  push('hotWater', 'hotWater', t('facts.hotWater', 'Agua caliente'), opt('hotWater', d.hotWater))
  const climate = [
    d.hasAirConditioning === 1 ? t('facts.airConditioning', 'Aire acondicionado') : '',
    d.hasAerothermal === 1 ? t('facts.aerothermal', 'Aerotermia') : '',
    d.hasUnderfloorHeating === 1 ? t('facts.underfloor', 'Suelo radiante') : '',
  ].filter(Boolean)
  push('climate', 'airConditioning', t('facts.climate', 'Climatización'), climate.join(' · '))
  push('exteriorInterior', 'windows', t('facts.exteriorInterior', 'Orientación de la vivienda'), opt('exteriorInterior', d.exteriorInterior))
  const ceiling = num(d.ceilingHeight)
  push('ceiling', 'ceiling', t('facts.ceiling', 'Altura de techos'), ceiling ? `${ceiling.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m` : '')
  const furnished = { yes: yes(t), no: no(t), partially: t('facts.partially', 'Parcialmente') }[String(project.furnished || '')] || ''
  push('furnished', 'furnished', t('facts.furnished', 'Amueblado'), furnished)
  const reno = num(d.renovationYear)
  push('renovationYear', 'renovation', t('facts.lastRenovation', 'Última reforma'), reno ? String(reno) : '')
  // Lo que la agencia anuncia de la situación (nunca la ocupación interna) y,
  // en alquiler, la modalidad que indicó: sin dato, no se supone ninguna.
  const situation = SITUATION_LABELS[String(d.listingSituation || '') as keyof typeof SITUATION_LABELS]
  push('situation', 'building', t('facts.situation', 'Situación'), situation ? t(situation[0], situation[1]) : '')
  const term = RENTAL_TERM_LABELS[String(d.rentalTerm || '') as keyof typeof RENTAL_TERM_LABELS]
  if (project.transactionType === 'rent') push('rentalTerm', 'yearBuilt', t('facts.rentalTerm', 'Tipo de alquiler'), term ? t(term[0], term[1]) : '')
  return rows
}

const COMMON_AREAS: [string, string, string][] = [
  ['hasCommunityGarden', 'facts.common.garden', 'Jardín'],
  ['hasCommunityPool', 'facts.common.pool', 'Piscina'],
  ['hasGym', 'facts.common.gym', 'Gimnasio'],
  ['hasPaddle', 'facts.common.paddle', 'Pádel'],
  ['hasTennis', 'facts.common.tennis', 'Tenis'],
  ['hasPlayground', 'facts.common.playground', 'Zona infantil'],
  ['hasCoworking', 'facts.common.coworking', 'Coworking'],
  ['hasSocialRoom', 'facts.common.socialRoom', 'Salón social'],
]

/** Lista en castellano, con mayúscula sólo al principio: «A», «A y b», «A, b y c». */
function joinList(items: string[], t: Translate): string {
  const list = items.map((x, i) => (i === 0 ? x : x.toLocaleLowerCase('es')))
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} ${t('facts.and', 'y')} ${list[list.length - 1]}`
}

export function buildingRows(project: FactsProject, sheet: Sheet, t: Translate, formatMoney?: (n: number) => string): FactRow[] {
  const d = sheet || {}
  const rows: FactRow[] = []
  const push = (key: string, icon: string, label: string, value: string) => {
    if (value) rows.push({ key, icon, label, value })
  }
  push('yearBuilt', 'yearBuilt', t('facts.yearBuilt', 'Año de construcción'), project.yearBuilt ? String(project.yearBuilt) : '')
  const floors = num(d.buildingFloors)
  push('floors', 'floor', t('facts.buildingFloors', 'Plantas'), floors ? String(floors) : '')
  const perFloor = num(d.unitsPerFloor)
  push('unitsPerFloor', 'units', t('facts.unitsPerFloor', 'Viviendas por planta'), perFloor ? String(perFloor) : '')
  const units = num(d.buildingUnits)
  push('units', 'units', t('facts.buildingUnits', 'Viviendas en el edificio'), units ? String(units) : '')
  push('elevator', 'elevator', t('facts.elevator', 'Ascensor'), project.hasElevator === 1 ? yes(t) : '')
  push('accessible', 'accessible', t('facts.accessible', 'Accesibilidad'), project.accessible === 1 ? t('facts.adapted', 'Adaptado') : '')
  const common = COMMON_AREAS.filter(([k]) => d[k] === 1).map(([, key, fb]) => t(key, fb))
  push('commonAreas', 'commonAreas', t('facts.commonAreas', 'Zonas comunes'), joinList(common, t))
  const services = [d.hasConcierge === 1 ? t('facts.concierge', 'Conserje') : '', d.hasDoorman === 1 ? t('facts.doorman', 'Portero') : '', d.hasSecurity === 1 ? t('facts.security', 'Seguridad') : ''].filter(Boolean)
  push('services', 'concierge', t('facts.services', 'Servicios'), services.join(' · '))
  push('buildingCondition', 'condition', t('facts.buildingCondition', 'Estado'), opt('buildingCondition', d.buildingCondition))
  push('facade', 'facade', t('facts.facade', 'Fachada'), opt('facade', d.facade))
  push('structure', 'building', t('facts.structure', 'Estructura'), opt('structure', d.structure))
  const fee = num(d.communityFeeMonthly)
  if (fee && formatMoney) push('community', 'community', t('facts.communityFee', 'Comunidad'), `${formatMoney(fee)} / ${t('facts.month', 'mes')}`)
  return rows
}

/** Un documento de «Documentación disponible»: un PDF publicable de la multimedia o un documento «Público». */
export interface PublicDocument {
  key: string
  title: string
  typeLabel?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  url: string
  /** Un fichero de la multimedia (público tal cual) se abre en su URL; un documento, con `?ver=1`. */
  isDocument?: boolean
}
