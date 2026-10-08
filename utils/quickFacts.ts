import { PROPERTY_CONDITION_LABELS, PROPERTY_SHEET_FIELD_MAP } from './propertySheet'

/**
 * Los «Datos clave» de la ficha pública: qué se enseña y con qué texto, a
 * partir de la propiedad pública (`toPublicProperty`) y de su ficha ampliada
 * pública (`toPublicSheet`). Sólo lo que la propiedad tiene: un dato vacío,
 * a 0 o que la privacidad de la ubicación ha quitado no aparece — nunca un
 * «No» que la agencia no ha dicho.
 *
 * Los dormitorios, baños, superficie, eficiencia y orientación van en la fila
 * de cifras bajo el título de la ficha; aquí no se repiten.
 *
 * Cada dato lleva su `key`, que decide su icono (utils/featureIcons.ts) y su
 * color (utils/featurePalette.ts).
 */

export interface QuickFact {
  key: string
  label: string
  value: string
}

type Translate = (key: string, fallback: string) => string

export interface QuickFactsProject {
  propertyType?: string | null
  yearBuilt?: number | null
  status?: string | null
  handoverDate?: string | null
  condition?: string | null
  street?: string | null
  floor?: string | null
  hasElevator?: number | null
  hasGarage?: number | null
  garageSpaces?: number | null
  hasTerrace?: number | null
  terraceArea?: number | null
  hasGarden?: number | null
  gardenArea?: number | null
  hasPool?: number | null
  storageArea?: number | null
  plotArea?: number | null
  petsAllowed?: number | null
  accessible?: number | null
}

const STATUS_FALLBACK: Record<string, string> = { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Listo para entrar' }
const STATUS_KEYS: Record<string, string> = { new: 'quickFacts.statusNew', under_construction: 'quickFacts.statusUnderConstruction', ready: 'quickFacts.statusReady' }

function m2(v: number): string {
  return `${Math.round(v)} m²`
}

function optionLabel(field: string, value: unknown): string {
  const v = String(value)
  return PROPERTY_SHEET_FIELD_MAP[field]?.optionLabels?.[v] || v
}

export function buildQuickFacts(project: QuickFactsProject, details: Record<string, unknown> | null | undefined, t: Translate, typeLabel: (type: string) => string): QuickFact[] {
  const p = project
  const d = details || {}
  const yes = t('quickFacts.yes', 'Sí')
  const out: QuickFact[] = []
  if (p.propertyType) out.push({ key: 'propertyType', label: t('quickFacts.type', 'Tipo'), value: typeLabel(p.propertyType) })
  if (p.yearBuilt) out.push({ key: 'yearBuilt', label: t('quickFacts.yearBuilt', 'Año de construcción'), value: String(p.yearBuilt) })
  if (p.status === 'under_construction' && p.handoverDate) out.push({ key: 'status', label: t('quickFacts.handoverDate', 'Entrega prevista'), value: p.handoverDate })
  else if (p.status) out.push({ key: 'status', label: t('quickFacts.status', 'Estado'), value: STATUS_KEYS[p.status] ? t(STATUS_KEYS[p.status], STATUS_FALLBACK[p.status]) : p.status })
  if (p.condition && PROPERTY_CONDITION_LABELS[p.condition]) out.push({ key: 'condition', label: t('quickFacts.condition', 'Conservación'), value: PROPERTY_CONDITION_LABELS[p.condition] })
  if (p.street) out.push({ key: 'street', label: t('quickFacts.street', 'Calle'), value: p.street })
  if (p.floor) out.push({ key: 'floor', label: t('quickFacts.floor', 'Planta'), value: p.floor })
  if (p.hasElevator) out.push({ key: 'elevator', label: t('quickFacts.elevator', 'Ascensor'), value: yes })
  if (p.hasGarage || (p.garageSpaces ?? 0) > 0) {
    const n = p.garageSpaces ?? 0
    out.push({ key: 'garage', label: t('quickFacts.garage', 'Garaje'), value: n > 0 ? `${n} ${n === 1 ? t('quickFacts.space', 'plaza') : t('quickFacts.spaces', 'plazas')}` : yes })
  }
  if (p.hasTerrace || (p.terraceArea ?? 0) > 0) out.push({ key: 'terrace', label: t('quickFacts.terrace', 'Terraza'), value: (p.terraceArea ?? 0) > 0 ? m2(p.terraceArea!) : yes })
  if (p.hasGarden || (p.gardenArea ?? 0) > 0) out.push({ key: 'garden', label: t('quickFacts.garden', 'Jardín'), value: (p.gardenArea ?? 0) > 0 ? m2(p.gardenArea!) : yes })
  if (p.hasPool) out.push({ key: 'pool', label: t('quickFacts.pool', 'Piscina'), value: yes })
  if ((p.storageArea ?? 0) > 0) out.push({ key: 'storage', label: t('quickFacts.storage', 'Trastero'), value: m2(p.storageArea!) })
  if ((p.plotArea ?? 0) > 0) out.push({ key: 'plot', label: t('quickFacts.plot', 'Parcela'), value: m2(p.plotArea!) })
  if (d.heating) out.push({ key: 'heating', label: t('quickFacts.heating', 'Calefacción'), value: optionLabel('heating', d.heating) })
  if (d.hasAirConditioning === 1 || d.hasAirConditioning === true) out.push({ key: 'airConditioning', label: t('quickFacts.airConditioning', 'Aire acondicionado'), value: yes })
  if (p.petsAllowed) out.push({ key: 'pets', label: t('quickFacts.pets', 'Mascotas'), value: t('quickFacts.petsAllowed', 'Admitidas') })
  if (p.accessible) out.push({ key: 'accessible', label: t('quickFacts.accessible', 'Accesible'), value: yes })
  return out
}
