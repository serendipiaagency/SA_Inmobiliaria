/**
 * Motor de matching (FASE 11).
 *
 * Es una función pura: recibe un inmueble y una necesidad, y devuelve un
 * resultado determinista. No consulta la base de datos, no llama a ningún
 * modelo de lenguaje y no vive en el frontend — las dos direcciones
 * (Property → compradores y Necesidad → inmuebles) usan exactamente este
 * mismo código, así que no pueden divergir.
 *
 * Tres reglas gobiernan todo el archivo:
 *
 * 1. **La explicación la produce el motor, no se narra después.** El score no
 *    es un 91 % suelto: cada criterio dice qué se comparó, con qué valores y
 *    cuánto pesó. Si alguien tiene que reconstruir por qué un piso salió
 *    recomendado, la respuesta está aquí y no en un prompt.
 *
 * 2. **UNKNOWN no es FALSE.** Que no conste que el inmueble tiene piscina no
 *    significa que no la tenga. Un dato ausente nunca descarta: se marca como
 *    desconocido, se deja fuera del score y se dice en voz alta.
 *
 * 3. **Los imprescindibles no se diluyen en una fórmula.** Un criterio
 *    `required` incumplido descarta el inmueble; no resta puntos. Y si no se
 *    puede comprobar, el inmueble no se descarta ni se da por bueno: queda
 *    para revisar.
 */

// Los tipos del dominio de la necesidad no se redeclaran aquí: importarlos
// como tipos se borra al compilar, y no puede haber dos definiciones de
// ZoneRef que se desincronicen. Lo único que el motor importa en tiempo de
// ejecución son catálogos de datos puros (etiquetas, columnas, importancia
// por defecto), compartidos con el panel: ni base de datos, ni red, ni Nuxt.
import type { Importance, ZoneRef } from '../buyerRequirements/service'
import { CRITERION_LABELS, FEATURE_CRITERIA, FEATURE_SOURCES, defaultImportanceOf, type FeatureCriterion } from '../../../utils/buyerRequirementCatalog'
import { PROPERTY_CONDITION_LABELS, PROPERTY_TYPE_LABELS } from '../../../utils/propertySheet'
import { formatMoney } from '../../../utils/currency'

/**
 * Sube cuando cambian los pesos o las reglas, para que un breakdown guardado siga siendo interpretable.
 *
 * v2 (núcleo N4): se evalúa el estado del inmueble (`conditionPref`), la obra
 * «reformado» lee la ficha ampliada, zonas deseadas y radio se suman en vez
 * de pisarse, una zona excluida descarta siempre, el tipo de inmueble es
 * imprescindible por defecto y hay tres características más (accesible,
 * mascotas, aire acondicionado).
 */
export const RULES_VERSION = 2

export type Outcome = 'matched' | 'partial' | 'failed' | 'unknown'
export type Eligibility = 'eligible' | 'ineligible' | 'needs_review'

/**
 * Los pesos viven todos aquí, en un único sitio (y no repartidos como +20/+15
 * por el código que evalúa cada criterio): así se pueden leer y cambiar de
 * una vez, y el score sigue siendo reproducible.
 *
 * Sólo se aplican a los criterios `preferred`. Un `required` no puntúa: o se
 * cumple, o descarta.
 */
export const WEIGHTS: Record<string, number> = {
  price: 30,
  zone: 25,
  propertyType: 15,
  bedrooms: 12,
  area: 12,
  bathrooms: 8,
  build: 8,
  condition: 6,
  terrace: 5,
  garage: 5,
  elevator: 4,
  pool: 4,
  accessible: 4,
  garden: 3,
  pets: 3,
  airConditioning: 3,
}

/**
 * Margen de cumplimiento parcial de los criterios numéricos: 78 m² frente a
 * 80 m² deseados no es un fallo rotundo, es un casi. Por debajo de este
 * margen sí es un fallo.
 */
export const PARTIAL_TOLERANCE = 0.1

/** Las etiquetas de cada criterio son las del catálogo compartido con el editor de la necesidad. */
const LABELS: Record<string, string> = CRITERION_LABELS

export interface CriterionOutcome {
  key: string
  label: string
  outcome: Outcome
  importance: Importance
  /** Lo que se comparó, en palabras: "78 m² frente a 80 m² deseados". */
  detail: string
  /** Peso disponible (0 en los `required`, que no puntúan). */
  weight: number
  /** Peso obtenido. */
  earned: number
}

export interface MatchResult {
  eligibility: Eligibility
  /** 0–100 sobre los criterios que se pudieron evaluar. `null` si no había ninguno. */
  score: number | null
  /** Qué parte de los criterios puntuables se pudo evaluar: 1 = todos, 0.8 = faltaban datos. */
  confidence: number
  criteria: CriterionOutcome[]
  matched: CriterionOutcome[]
  partial: CriterionOutcome[]
  failed: CriterionOutcome[]
  unknown: CriterionOutcome[]
  /** Las líneas de la explicación, ya formateadas ("✓ Terraza", "△ 78 m² frente a 80 m² deseados"). */
  explanation: string[]
  rulesVersion: number
}

/** Los datos del inmueble que el motor necesita. `null`/`undefined` = dato desconocido. */
export interface MatchableProperty {
  id: number
  transactionType?: string | null
  propertyType?: string | null
  price?: number | null
  area?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  city?: string | null
  district?: string | null
  postalCode?: string | null
  community?: string | null
  lat?: number | null
  lng?: number | null
  yearBuilt?: number | null
  hasElevator?: number | null
  hasPool?: number | null
  hasGarage?: number | null
  hasTerrace?: number | null
  hasGarden?: number | null
  accessible?: number | null
  petsAllowed?: number | null
  /** Estado físico (`condition`): new | excellent | good | to_renovate | to_reform. NULL = no consta. */
  condition?: string | null
  /** De la ficha ampliada (`property_details`), que admite NULL: NULL = no consta, 0 = «no» escrito por alguien. */
  hasAirConditioning?: number | null
  /** Piscina y jardín privados y comunitarios (ficha ampliada, cierre D1p): cuentan como «piscina» / «jardín». */
  hasPrivatePool?: number | null
  hasCommunityPool?: number | null
  hasPrivateGarden?: number | null
  hasCommunityGarden?: number | null
  isRenovated?: number | null
  renovationYear?: number | null
  /**
   * Cuándo se repasaron las características del inmueble.
   *
   * Las columnas `has_*` son NOT NULL DEFAULT 0, así que un 0 puede significar
   * dos cosas muy distintas: "no lo tiene" o "nadie lo ha rellenado todavía".
   * Un 1 siempre es una afirmación deliberada — el valor por defecto es 0, así
   * que alguien tuvo que marcarlo. Por eso la política es:
   *
   *   has_x = 1                      → SÍ
   *   has_x = 0 y hay revisión       → NO
   *   has_x = 0 y no hay revisión    → DESCONOCIDO
   *
   * Sin esta columna el motor estaría tratando "no consta" como "no lo tiene",
   * que es exactamente lo que la fase prohíbe.
   */
  featuresReviewedAt?: string | null
}

/** Los datos de la necesidad que el motor necesita. */
export interface MatchableRequirement {
  id: number
  operation: string
  propertyTypes?: string[]
  priceMin?: number | null
  priceMax?: number | null
  areaMin?: number | null
  areaMax?: number | null
  bedroomsMin?: number | null
  bathroomsMin?: number | null
  desiredZones?: ZoneRef[]
  excludedZones?: ZoneRef[]
  centerLat?: number | null
  centerLng?: number | null
  radiusKm?: number | null
  conditionPref?: string | null
  buildPref?: string | null
  /** Filas de buyer_requirement_criteria: de aquí sale la importancia de cada criterio. */
  criteria?: { criterionType: string; importance: string; valueBool?: number | null }[]
}


function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * La normalización con la que el motor compara textos (zonas, operación),
 * para quien tenga que agrupar valores igual que él. Con otro nombre que
 * `normalizeText` de knowledge/text.ts: los dos se autoimportan en el servidor.
 */
export const normalizeMatchText = normalizeText

/** Opciones del motor que no cambian el resultado, sólo cómo se explica. */
export interface EvaluateOptions {
  /** Moneda de la agencia (utils/currency.ts) para el detalle del precio. Sin ella, la de por defecto. */
  currency?: string | null
}

/**
 * Importancia declarada para un criterio. Sin declarar, la del catálogo
 * (`DEFAULT_IMPORTANCE`): `preferred` —puntúa, pero no descarta— salvo el
 * tipo de inmueble, que es imprescindible por defecto.
 */
export function importanceOf(requirement: Pick<MatchableRequirement, 'criteria'>, key: string): Importance {
  const row = (requirement.criteria || []).find((c) => c.criterionType === key)
  const value = row?.importance
  if (value === 'required' || value === 'preferred' || value === 'indifferent') return value
  return defaultImportanceOf(key)
}

/**
 * Distancia en kilómetros entre dos coordenadas (haversine). Se calcula en el
 * servidor, nunca sólo en el navegador: el resultado forma parte del score y
 * tiene que ser el mismo lo mire quien lo mire.
 */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** ¿El inmueble cae dentro de esta referencia de zona? `null` si no hay datos para decidirlo. */
function zoneContains(zone: ZoneRef, property: MatchableProperty): boolean | null {
  const checks: (boolean | null)[] = []

  const compare = (want: string | undefined, have: string | null | undefined): boolean | null => {
    if (!want) return null
    if (have == null || have === '') return null
    return normalizeText(want) === normalizeText(have)
  }

  checks.push(compare(zone.postalCode, property.postalCode))
  checks.push(compare(zone.district, property.district))
  checks.push(compare(zone.city, property.city))
  if (zone.label) checks.push(compare(zone.label, property.district) || compare(zone.label, property.city) || compare(zone.label, property.community))

  const decidable = checks.filter((c) => c !== null) as boolean[]
  if (!decidable.length) return null
  // Basta con que una referencia concreta coincida: un código postal que
  // coincide ya sitúa el inmueble, aunque el distrito esté escrito de otra forma.
  return decidable.some(Boolean)
}

type Evaluation = { outcome: Outcome; detail: string; forceRequired?: boolean }

/**
 * Evalúa la zona: zonas deseadas, zonas excluidas y radio.
 *
 * - Las exclusiones tienen precedencia y son **siempre un filtro duro**: un
 *   inmueble en una zona excluida queda descartado aunque la zona sea
 *   «preferible» (un piso en Lavapiés no vale porque "Madrid" esté en las
 *   zonas deseadas, y tampoco puntúa a medias: el comprador lo vetó).
 * - Zonas deseadas y radio se suman: basta con cumplir una de las dos cosas
 *   (estar en Chamberí, o a menos de 3 km del colegio). Antes el radio
 *   pisaba a las zonas y éstas se ignoraban sin avisar.
 */
function evaluateZone(requirement: MatchableRequirement, property: MatchableProperty): Evaluation | null {
  const desired = requirement.desiredZones || []
  const excluded = requirement.excludedZones || []
  const hasRadius = requirement.radiusKm != null && requirement.centerLat != null && requirement.centerLng != null

  if (!desired.length && !excluded.length && !hasRadius) return null

  for (const zone of excluded) {
    if (zoneContains(zone, property) === true) {
      const name = zone.label || zone.district || zone.city || zone.postalCode || 'zona excluida'
      return { outcome: 'failed', detail: `está en ${name}, una zona excluida`, forceRequired: true }
    }
  }

  const candidates: Evaluation[] = []

  if (hasRadius) {
    if (property.lat == null || property.lng == null) {
      candidates.push({ outcome: 'unknown', detail: 'el inmueble no tiene coordenadas, no se puede medir la distancia' })
    } else {
      const km = distanceKm(requirement.centerLat!, requirement.centerLng!, property.lat, property.lng)
      const radius = requirement.radiusKm!
      if (km <= radius) candidates.push({ outcome: 'matched', detail: `a ${km.toFixed(1)} km del centro buscado (radio ${radius} km)` })
      else if (km <= radius * (1 + PARTIAL_TOLERANCE)) candidates.push({ outcome: 'partial', detail: `a ${km.toFixed(1)} km, algo más lejos del radio de ${radius} km` })
      else candidates.push({ outcome: 'failed', detail: `a ${km.toFixed(1)} km, fuera del radio de ${radius} km` })
    }
  }

  if (desired.length) {
    let anyDecidable = false
    let found: ZoneRef | null = null
    for (const zone of desired) {
      const inside = zoneContains(zone, property)
      if (inside !== null) anyDecidable = true
      if (inside === true) {
        found = zone
        break
      }
    }
    if (found) {
      candidates.push({ outcome: 'matched', detail: String(found.label || found.district || found.city || found.postalCode || 'la zona buscada') })
    } else if (!anyDecidable) {
      candidates.push({ outcome: 'unknown', detail: 'el inmueble no tiene ubicación estructurada comparable' })
    } else {
      const names = desired.map((z) => z.label || z.district || z.city || z.postalCode).filter(Boolean)
      const where = property.district || property.city || 'ubicación desconocida'
      candidates.push({ outcome: 'failed', detail: `está en ${where}, fuera de ${names.join(' + ')}` })
    }
  }

  if (!candidates.length) {
    // Sólo había exclusiones y ninguna se cumplió: el inmueble no está vetado.
    return { outcome: 'matched', detail: 'no está en ninguna de las zonas excluidas' }
  }

  // La mejor de las dos vías (zona o radio). Un «no consta» sólo gana si la
  // otra vía tampoco lo descarta con datos: si una dice ✕ con certeza y la
  // otra no se puede medir, el resultado honesto es «no se sabe».
  const order: Outcome[] = ['matched', 'partial', 'unknown', 'failed']
  candidates.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome))
  return candidates[0]
}

/**
 * Compara un valor numérico contra un mínimo y/o un máximo, con cumplimiento
 * parcial cerca del límite. Un extremo sin rellenar no restringe nada: no
 * poner precio máximo significa "no lo ha dicho", nunca "cero".
 */
function evaluateRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  format: (n: number) => string,
  unitLabel: string,
): { outcome: Outcome; detail: string } | null {
  if (min == null && max == null) return null
  if (value == null) return { outcome: 'unknown', detail: `el inmueble no tiene ${unitLabel} registrado` }

  if (max != null && value > max) {
    const over = (value - max) / max
    if (over <= PARTIAL_TOLERANCE) return { outcome: 'partial', detail: `${format(value)} frente a un máximo de ${format(max)}` }
    return { outcome: 'failed', detail: `${format(value)} supera el máximo de ${format(max)}` }
  }
  if (min != null && value < min) {
    const under = (min - value) / min
    if (under <= PARTIAL_TOLERANCE) return { outcome: 'partial', detail: `${format(value)} frente a ${format(min)} deseados` }
    return { outcome: 'failed', detail: `${format(value)} no llega al mínimo de ${format(min)}` }
  }

  const bounds = [min != null ? `≥ ${format(min)}` : null, max != null ? `≤ ${format(max)}` : null].filter(Boolean).join(' y ')
  return { outcome: 'matched', detail: `${format(value)} (${bounds})` }
}

/**
 * Resuelve una característica booleana del inmueble aplicando la política de
 * UNKNOWN descrita en `MatchableProperty.featuresReviewedAt` para las
 * columnas `NOT NULL DEFAULT 0` de los catálogos, y leyendo NULL como «no
 * consta» en las de la ficha ampliada (`FEATURE_SOURCES` del catálogo).
 */
export function featureValue(property: MatchableProperty, feature: FeatureCriterion): boolean | null {
  const source = FEATURE_SOURCES[feature]
  const values = property as unknown as Record<string, unknown>
  const raw = values[source.column]
  const isYes = (v: unknown) => v === 1 || v === true
  if (isYes(raw)) return true
  // Cierre D1p: la piscina o el jardín privado o comunitario de la ficha ampliada también cuentan.
  const alternatives = (source.anyOf || []).map((c) => values[c])
  if (alternatives.some(isYes)) return true
  let own: boolean | null
  if (raw == null) own = null
  else if (!source.reviewed) own = false // ficha ampliada: el 0 lo escribió alguien
  // raw === 0 en una columna NOT NULL DEFAULT 0: sólo es un "no" si alguien repasó las características.
  else own = property.featuresReviewedAt ? false : null
  if (own === false) return false
  // Sin «no» en la casilla genérica: es «no» sólo si la ficha ampliada dice «no» a todas las variantes.
  if (alternatives.length && alternatives.every((v) => v === 0 || v === false)) return false
  return own
}

function evaluateFeature(requirement: MatchableRequirement, property: MatchableProperty, feature: FeatureCriterion): Evaluation | null {
  const row = (requirement.criteria || []).find((c) => c.criterionType === feature)
  if (!row) return null

  const wanted = row.valueBool !== 0 // valueBool 0 = la quiere explícitamente ausente
  const actual = featureValue(property, feature)
  const label = LABELS[feature].toLowerCase()

  if (actual === null) return { outcome: 'unknown', detail: `no consta si tiene ${label}` }
  if (actual === wanted) return { outcome: 'matched', detail: wanted ? `tiene ${label}` : `no tiene ${label}, como se pedía` }
  return { outcome: 'failed', detail: wanted ? `no tiene ${label}` : `tiene ${label} y se pedía sin` }
}

/** Estados físicos en los que se puede entrar a vivir sin obra. */
const READY_CONDITIONS = ['new', 'excellent', 'good']
/** Estados que piden obra: «a renovar» (actualizar) es menos que «a reformar». */
const WORK_CONDITIONS = ['to_renovate', 'to_reform']

/**
 * Estado físico del inmueble frente a `conditionPref`. Sólo lee la columna
 * `condition` de la ficha: si nadie la ha rellenado, «no consta» — nunca se
 * supone que una vivienda está bien porque no diga lo contrario.
 *
 *   conditionPref = good       → a estrenar / excelente / buen estado ✓,
 *                                a renovar △, a reformar ✕
 *   conditionPref = to_reform  → a reformar / a renovar ✓, en buen estado △
 *                                (no es lo que busca, pero no lo descarta)
 *   conditionPref = any / NULL → sin criterio
 */
function evaluateCondition(requirement: MatchableRequirement, property: MatchableProperty): Evaluation | null {
  const pref = requirement.conditionPref
  if (!pref || pref === 'any') return null
  if (!property.condition) return { outcome: 'unknown', detail: 'no consta el estado del inmueble' }
  const condition = property.condition
  const label = (PROPERTY_CONDITION_LABELS[condition] || condition).toLowerCase()
  if (!READY_CONDITIONS.includes(condition) && !WORK_CONDITIONS.includes(condition)) {
    return { outcome: 'unknown', detail: `estado «${condition}» no reconocido` }
  }

  if (pref === 'good') {
    if (READY_CONDITIONS.includes(condition)) return { outcome: 'matched', detail: label }
    if (condition === 'to_renovate') return { outcome: 'partial', detail: `${label}; se buscaba en buen estado` }
    return { outcome: 'failed', detail: `${label}; se buscaba en buen estado` }
  }
  if (pref === 'to_reform') {
    if (WORK_CONDITIONS.includes(condition)) return { outcome: 'matched', detail: `${label}, como se buscaba` }
    return { outcome: 'partial', detail: `${label}; se buscaba para reformar` }
  }
  return null
}

/**
 * Obra nueva / segunda mano / reformado frente a `buildPref`. No se deduce
 * del catálogo desde el que se creó la ficha: sale del año de construcción
 * y, para «reformado», de la ficha ampliada (reformado / año de reforma). Si
 * el dato no está, es desconocido y punto.
 */
function evaluateBuild(requirement: MatchableRequirement, property: MatchableProperty): Evaluation | null {
  if (!requirement.buildPref) return null

  if (requirement.buildPref === 'renovated') {
    if (property.isRenovated === 1 || property.renovationYear != null) {
      return { outcome: 'matched', detail: property.renovationYear != null ? `reformado en ${property.renovationYear}` : 'reformado' }
    }
    if (property.isRenovated === 0) return { outcome: 'failed', detail: 'no está reformado' }
    return { outcome: 'unknown', detail: 'no consta si está reformado' }
  }

  if (property.yearBuilt == null) {
    return { outcome: 'unknown', detail: 'no consta el año de construcción: no se sabe si es obra nueva o segunda mano' }
  }
  const year = new Date().getFullYear()
  const isNew = property.yearBuilt >= year - 2
  if (requirement.buildPref === 'new') {
    return isNew
      ? { outcome: 'matched', detail: `obra nueva (${property.yearBuilt})` }
      : { outcome: 'failed', detail: `construido en ${property.yearBuilt}, no es obra nueva` }
  }
  if (requirement.buildPref === 'second_hand') {
    return isNew
      ? { outcome: 'failed', detail: `obra nueva (${property.yearBuilt}), se buscaba segunda mano` }
      : { outcome: 'matched', detail: `segunda mano (${property.yearBuilt})` }
  }
  return null
}

function symbolFor(outcome: Outcome): string {
  if (outcome === 'matched') return '✓'
  if (outcome === 'partial') return '△'
  if (outcome === 'failed') return '✕'
  return '?'
}

/**
 * Compara un inmueble con una necesidad. Determinista: los mismos datos dan
 * siempre el mismo resultado, sin azar, sin modelos y sin depender del orden
 * en que se consultó la base de datos.
 */
export function evaluateMatch(property: MatchableProperty, requirement: MatchableRequirement, opts: EvaluateOptions = {}): MatchResult {
  // El precio de la propiedad y los de la necesidad están en la moneda de la
  // agencia: se explican con ella, sin convertir (antes «€» fijo).
  const money = (n: number) => formatMoney(n, opts.currency)
  const raw: ({ key: string } & Evaluation)[] = []

  const push = (key: string, result: Evaluation | null) => {
    if (result) raw.push({ key, ...result })
  }

  // Operación: comprar no es alquilar. Si no coincide, no hay nada que puntuar.
  if (property.transactionType && normalizeText(property.transactionType) !== normalizeText(requirement.operation)) {
    const wanted = requirement.operation === 'rent' ? 'alquiler' : 'venta'
    return buildResult([
      {
        key: 'operation',
        label: 'Operación',
        outcome: 'failed',
        importance: 'required',
        detail: `el inmueble es de ${normalizeText(property.transactionType) === 'rent' ? 'alquiler' : 'venta'} y se busca ${wanted}`,
        weight: 0,
        earned: 0,
      },
    ])
  }

  if (requirement.propertyTypes?.length) {
    if (!property.propertyType) {
      push('propertyType', { outcome: 'unknown', detail: 'el inmueble no tiene tipo asignado' })
    } else {
      const wanted = requirement.propertyTypes.map(normalizeText)
      const actual = normalizeText(property.propertyType)
      const typeLabel = (t: string) => PROPERTY_TYPE_LABELS[t] || t
      push('propertyType', wanted.includes(actual)
        ? { outcome: 'matched', detail: typeLabel(property.propertyType) }
        : { outcome: 'failed', detail: `es ${typeLabel(property.propertyType).toLowerCase()} y se buscaba ${requirement.propertyTypes.map(typeLabel).join('/').toLowerCase()}` })
    }
  }

  push('price', evaluateRange(property.price, requirement.priceMin, requirement.priceMax, money, 'precio'))
  push('area', evaluateRange(property.area, requirement.areaMin, requirement.areaMax, (n) => `${n} m²`, 'superficie'))
  push('bedrooms', evaluateRange(property.bedrooms, requirement.bedroomsMin, null, (n) => `${n} dorm.`, 'número de dormitorios'))
  push('bathrooms', evaluateRange(property.bathrooms, requirement.bathroomsMin, null, (n) => `${n} baños`, 'número de baños'))
  push('zone', evaluateZone(requirement, property))
  push('condition', evaluateCondition(requirement, property))
  push('build', evaluateBuild(requirement, property))
  for (const feature of FEATURE_CRITERIA) {
    push(feature, evaluateFeature(requirement, property, feature))
  }

  const outcomes: CriterionOutcome[] = []
  for (const item of raw) {
    // Un filtro duro (zona excluida) es imprescindible se haya declarado lo
    // que se haya declarado para el criterio.
    const importance: Importance = item.forceRequired ? 'required' : importanceOf(requirement, item.key)
    // Un criterio indiferente no penaliza ni puntúa: se descarta del cálculo
    // entero en lugar de sumar cero y ensuciar la explicación.
    if (importance === 'indifferent') continue

    const weight = importance === 'required' ? 0 : (WEIGHTS[item.key] ?? 5)
    const earned = importance === 'required' ? 0 : weight * (item.outcome === 'matched' ? 1 : item.outcome === 'partial' ? 0.5 : 0)

    outcomes.push({
      key: item.key,
      label: LABELS[item.key] || item.key,
      outcome: item.outcome,
      importance,
      detail: item.detail,
      weight,
      earned,
    })
  }

  return buildResult(outcomes)
}

function buildResult(criteria: CriterionOutcome[]): MatchResult {
  const matched = criteria.filter((c) => c.outcome === 'matched')
  const partial = criteria.filter((c) => c.outcome === 'partial')
  const failed = criteria.filter((c) => c.outcome === 'failed')
  const unknown = criteria.filter((c) => c.outcome === 'unknown')

  // Un imprescindible incumplido descarta el inmueble; no resta puntos.
  // Uno que no se puede comprobar no descarta ni aprueba: queda para revisar,
  // porque tratar "no consta" como "no lo tiene" escondería inmuebles buenos
  // por una ficha incompleta. Un imprescindible cumplido a medias tampoco se
  // decide solo: lo mira una persona.
  const requiredFailed = failed.filter((c) => c.importance === 'required')
  const requiredUnknown = unknown.filter((c) => c.importance === 'required')
  const requiredPartial = partial.filter((c) => c.importance === 'required')

  let eligibility: Eligibility = 'eligible'
  if (requiredFailed.length) eligibility = 'ineligible'
  else if (requiredUnknown.length || requiredPartial.length) eligibility = 'needs_review'

  // El score sale sólo de los criterios que se pudieron evaluar. Los
  // desconocidos no suman ni restan: se quedan fuera del denominador y se
  // cuentan aparte en `confidence`, para no castigar a un inmueble por tener
  // la ficha a medias ni fingir que se comprobó algo que no se comprobó.
  const scorable = criteria.filter((c) => c.weight > 0 && c.outcome !== 'unknown')
  const possible = scorable.reduce((sum, c) => sum + c.weight, 0)
  const earned = scorable.reduce((sum, c) => sum + c.earned, 0)
  const score = possible > 0 ? Math.round((earned / possible) * 100) : null

  const weighable = criteria.filter((c) => c.weight > 0)
  const confidence = weighable.length ? scorable.length / weighable.length : 1

  const explanation = criteria.map((c) => {
    const mark = symbolFor(c.outcome)
    const tag = c.importance === 'required' ? ' (imprescindible)' : ''
    return `${mark} ${c.label}: ${c.detail}${tag}`
  })

  return {
    eligibility,
    score,
    confidence,
    criteria,
    matched,
    partial,
    failed,
    unknown,
    explanation,
    rulesVersion: RULES_VERSION,
  }
}
