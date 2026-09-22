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
// como tipos se borra al compilar, así que el motor sigue sin depender de
// nada en tiempo de ejecución y no puede haber dos definiciones de ZoneRef
// que se desincronicen.
import type { Importance, ZoneRef } from '../buyerRequirements/service'

/** Sube cuando cambian los pesos o las reglas, para que un breakdown guardado siga siendo interpretable. */
export const RULES_VERSION = 1

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
  garden: 3,
}

/**
 * Margen de cumplimiento parcial de los criterios numéricos: 78 m² frente a
 * 80 m² deseados no es un fallo rotundo, es un casi. Por debajo de este
 * margen sí es un fallo.
 */
export const PARTIAL_TOLERANCE = 0.1

const LABELS: Record<string, string> = {
  price: 'Precio',
  zone: 'Zona',
  propertyType: 'Tipo de inmueble',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  area: 'Superficie',
  build: 'Obra',
  condition: 'Estado',
  terrace: 'Terraza',
  garage: 'Garaje',
  elevator: 'Ascensor',
  pool: 'Piscina',
  garden: 'Jardín',
}

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

const FEATURE_COLUMNS = {
  terrace: 'hasTerrace',
  garage: 'hasGarage',
  elevator: 'hasElevator',
  pool: 'hasPool',
  garden: 'hasGarden',
} as const

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function money(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** Importancia declarada para un criterio. Por defecto `preferred`: puntúa, pero no descarta. */
function importanceOf(requirement: MatchableRequirement, key: string): Importance {
  const row = (requirement.criteria || []).find((c) => c.criterionType === key)
  const value = row?.importance
  if (value === 'required' || value === 'preferred' || value === 'indifferent') return value
  return 'preferred'
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

/**
 * Evalúa la zona. Las exclusiones tienen precedencia: un inmueble en una zona
 * excluida no es un cumplimiento pleno por estar dentro de una zona deseada
 * más amplia (un piso en Lavapiés no vale porque "Madrid" esté en las zonas
 * deseadas).
 */
function evaluateZone(requirement: MatchableRequirement, property: MatchableProperty): { outcome: Outcome; detail: string } | null {
  const desired = requirement.desiredZones || []
  const excluded = requirement.excludedZones || []
  const hasRadius = requirement.radiusKm != null && requirement.centerLat != null && requirement.centerLng != null

  if (!desired.length && !excluded.length && !hasRadius) return null

  for (const zone of excluded) {
    if (zoneContains(zone, property) === true) {
      const name = zone.label || zone.district || zone.city || zone.postalCode || 'zona excluida'
      return { outcome: 'failed', detail: `está en ${name}, una zona excluida` }
    }
  }

  if (hasRadius) {
    if (property.lat == null || property.lng == null) {
      return { outcome: 'unknown', detail: 'el inmueble no tiene coordenadas, no se puede medir la distancia' }
    }
    const km = distanceKm(requirement.centerLat!, requirement.centerLng!, property.lat, property.lng)
    const radius = requirement.radiusKm!
    if (km <= radius) return { outcome: 'matched', detail: `a ${km.toFixed(1)} km del centro buscado (radio ${radius} km)` }
    if (km <= radius * (1 + PARTIAL_TOLERANCE)) {
      return { outcome: 'partial', detail: `a ${km.toFixed(1)} km, algo más lejos del radio de ${radius} km` }
    }
    return { outcome: 'failed', detail: `a ${km.toFixed(1)} km, fuera del radio de ${radius} km` }
  }

  if (!desired.length) {
    // Sólo había exclusiones y ninguna se cumplió: el inmueble no está vetado.
    return { outcome: 'matched', detail: 'no está en ninguna de las zonas excluidas' }
  }

  let anyDecidable = false
  for (const zone of desired) {
    const inside = zoneContains(zone, property)
    if (inside !== null) anyDecidable = true
    if (inside === true) {
      const name = zone.label || zone.district || zone.city || zone.postalCode || 'la zona buscada'
      return { outcome: 'matched', detail: String(name) }
    }
  }

  if (!anyDecidable) return { outcome: 'unknown', detail: 'el inmueble no tiene ubicación estructurada comparable' }

  const names = desired.map((z) => z.label || z.district || z.city || z.postalCode).filter(Boolean)
  const where = property.district || property.city || 'ubicación desconocida'
  return { outcome: 'failed', detail: `está en ${where}, fuera de ${names.join(' + ')}` }
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
 * UNKNOWN descrita en `MatchableProperty.featuresReviewedAt`.
 */
export function featureValue(property: MatchableProperty, feature: keyof typeof FEATURE_COLUMNS): boolean | null {
  const raw = property[FEATURE_COLUMNS[feature]]
  if (raw === 1) return true
  if (raw == null) return null
  // raw === 0: sólo es un "no" si alguien repasó las características.
  return property.featuresReviewedAt ? false : null
}

function evaluateFeature(
  requirement: MatchableRequirement,
  property: MatchableProperty,
  feature: keyof typeof FEATURE_COLUMNS,
): { outcome: Outcome; detail: string } | null {
  const row = (requirement.criteria || []).find((c) => c.criterionType === feature)
  if (!row) return null

  const wanted = row.valueBool !== 0 // valueBool 0 = la quiere explícitamente ausente
  const actual = featureValue(property, feature)
  const label = LABELS[feature].toLowerCase()

  if (actual === null) return { outcome: 'unknown', detail: `no consta si tiene ${label}` }
  if (actual === wanted) return { outcome: 'matched', detail: wanted ? `tiene ${label}` : `no tiene ${label}, como se pedía` }
  return { outcome: 'failed', detail: wanted ? `no tiene ${label}` : `tiene ${label} y se pedía sin` }
}

function evaluateBuild(requirement: MatchableRequirement, property: MatchableProperty): { outcome: Outcome; detail: string } | null {
  if (!requirement.buildPref) return null
  // No se deduce del módulo desde el que se creó la ficha: si no hay un dato
  // real sobre el inmueble, es desconocido y punto.
  if (property.yearBuilt == null) {
    return { outcome: 'unknown', detail: 'no consta si es obra nueva, segunda mano o reformado' }
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
  // 'renovated' no tiene dato estructurado propio todavía.
  return { outcome: 'unknown', detail: 'no hay dato de reforma en la ficha del inmueble' }
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
export function evaluateMatch(property: MatchableProperty, requirement: MatchableRequirement): MatchResult {
  const raw: { key: string; outcome: Outcome; detail: string }[] = []

  const push = (key: string, result: { outcome: Outcome; detail: string } | null) => {
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
      push('propertyType', wanted.includes(actual)
        ? { outcome: 'matched', detail: property.propertyType }
        : { outcome: 'failed', detail: `es ${property.propertyType} y se buscaba ${requirement.propertyTypes.join('/')}` })
    }
  }

  push('price', evaluateRange(property.price, requirement.priceMin, requirement.priceMax, money, 'precio'))
  push('area', evaluateRange(property.area, requirement.areaMin, requirement.areaMax, (n) => `${n} m²`, 'superficie'))
  push('bedrooms', evaluateRange(property.bedrooms, requirement.bedroomsMin, null, (n) => `${n} dorm.`, 'número de dormitorios'))
  push('bathrooms', evaluateRange(property.bathrooms, requirement.bathroomsMin, null, (n) => `${n} baños`, 'número de baños'))
  push('zone', evaluateZone(requirement, property))
  push('build', evaluateBuild(requirement, property))
  for (const feature of Object.keys(FEATURE_COLUMNS) as (keyof typeof FEATURE_COLUMNS)[]) {
    push(feature, evaluateFeature(requirement, property, feature))
  }

  const outcomes: CriterionOutcome[] = []
  for (const item of raw) {
    const importance = importanceOf(requirement, item.key)
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
