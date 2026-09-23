/**
 * Asignación de leads (FASE 15, migración 0071).
 *
 * Un único sitio decide a quién va cada lead. Antes no había ninguno: el
 * `agentId` se ponía a mano o se heredaba del inmueble, y no quedaba constancia
 * de por qué. Repartir esa decisión entre formularios, webhooks y portales
 * garantiza que acaben contradiciéndose.
 *
 * Dos exigencias gobiernan el diseño:
 *
 * 1. **Explicable.** Tiene que poder responderse "¿por qué este lead es de
 *    Laura?" con una frase — "Zona Chamberí → Oficina Centro → turno rotatorio
 *    → Laura" — y esa frase la produce el motor, no se reconstruye después.
 *
 * 2. **Nunca se pierde un lead.** Toda estrategia tiene salida: si la regla no
 *    encuentra a nadie se prueba la siguiente, y si ninguna encuentra a nadie
 *    el lead queda explícitamente sin asignar y se dice por qué. Un lead
 *    silenciosamente sin dueño es un cliente al que nadie llama.
 */

export const STRATEGIES = ['property_owner', 'specific', 'round_robin', 'least_load'] as const
export type RoutingStrategy = (typeof STRATEGIES)[number]

export const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  property_owner: 'Comercial del inmueble',
  specific: 'Comercial concreto',
  round_robin: 'Turno rotatorio',
  least_load: 'Menos carga',
}

/** Lo que el motor necesita saber de un comercial para poder elegirlo. */
export interface RoutableCommercial {
  id: number
  name: string
  officeName?: string | null
  /** JSON del campo `zones` de team_members. */
  zones?: string | null
  propertyTypes?: string | null
  languages?: string | null
  employmentStatus?: string | null
  /** Cuántos leads vivos tiene ahora mismo. Sólo se usa en 'least_load'. */
  activeLeads?: number
  /** Si está dentro de su horario en este momento. `null` = no hay horario configurado. */
  withinWorkingHours?: boolean | null
}

/** Lo que el motor necesita saber del lead. */
export interface RoutableLead {
  id?: number
  source?: string | null
  portal?: string | null
  /** Ciudad, distrito o código postal del inmueble consultado, ya resuelto por quien llama. */
  zone?: string | null
  propertyType?: string | null
  language?: string | null
  /** El comercial responsable del inmueble, si el lead viene de uno. */
  propertyOwnerCommercialId?: number | null
}

export interface RoutingRule {
  id: number
  name: string
  priority: number
  enabled: number
  matchSource?: string | null
  matchPortal?: string | null
  matchZone?: string | null
  matchPropertyType?: string | null
  matchLanguage?: string | null
  strategy: string
  targetCommercialId?: number | null
  targetOffice?: string | null
  respectWorkingHours: number
}

export interface RoutingDecision {
  commercialId: number | null
  ruleId: number | null
  ruleName: string | null
  strategy: RoutingStrategy | null
  /** La frase completa: "Zona Chamberí → Oficina Centro → turno rotatorio → Laura". */
  explanation: string
  /** Los pasos, por si la interfaz quiere enseñarlos por separado. */
  steps: string[]
  /** true cuando ninguna regla encontró a nadie y hubo que caer al reparto general. */
  usedFallback: boolean
  /** Cuando `round_robin` elige, el ámbito cuyo contador hay que avanzar. */
  cursorScope?: string
  /** El grupo de candidatos sobre el que se eligió, en orden estable. */
  pool: number[]
}

export function normalize(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Lee un campo JSON de team_members que a veces es lista y a veces texto suelto. */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : []
    } catch {
      return []
    }
  }
  // Campos antiguos guardados como "Chamberí, Salamanca".
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

function listMatches(raw: string | null | undefined, wanted: string | null | undefined): boolean {
  if (!wanted) return true
  const list = parseList(raw).map(normalize)
  if (!list.length) return false
  return list.includes(normalize(wanted))
}

/**
 * ¿Aplica esta regla a este lead? Una condición sin rellenar no filtra: eso es
 * lo que permite tener una regla general («todo lo de Idealista, a la oficina
 * de centro») sin escribir todas las demás condiciones.
 */
export function ruleApplies(rule: RoutingRule, lead: RoutableLead): boolean {
  if (!rule.enabled) return false
  if (rule.matchSource && normalize(rule.matchSource) !== normalize(lead.source)) return false
  if (rule.matchPortal && normalize(rule.matchPortal) !== normalize(lead.portal)) return false
  if (rule.matchZone && normalize(rule.matchZone) !== normalize(lead.zone)) return false
  if (rule.matchPropertyType && normalize(rule.matchPropertyType) !== normalize(lead.propertyType)) return false
  if (rule.matchLanguage && normalize(rule.matchLanguage) !== normalize(lead.language)) return false
  return true
}

/**
 * El grupo de comerciales que puede recibir este lead según la regla.
 *
 * Se filtra por oficina, por zona y por tipo de inmueble cuando la regla lo
 * pide, y siempre se excluye a quien no está activo. El orden final es por id:
 * sin un orden estable, el turno rotatorio dependería de cómo devolviera las
 * filas la base de datos y dejaría de ser reproducible.
 */
export function buildPool(rule: RoutingRule, lead: RoutableLead, commercials: RoutableCommercial[]): RoutableCommercial[] {
  let pool = commercials.filter((c) => (c.employmentStatus || 'active') === 'active')

  if (rule.targetOffice) {
    pool = pool.filter((c) => normalize(c.officeName) === normalize(rule.targetOffice))
  }
  // La zona y el tipo se cruzan con lo que el comercial declara cubrir. Si la
  // regla filtra por zona pero nadie tiene zonas configuradas, el grupo queda
  // vacío — y eso hace que se pruebe la siguiente regla, en vez de asignar a
  // cualquiera fingiendo que cubre la zona.
  if (rule.matchZone || lead.zone) {
    const zone = rule.matchZone || lead.zone
    const withZone = pool.filter((c) => listMatches(c.zones, zone))
    if (withZone.length) pool = withZone
  }
  if (lead.propertyType) {
    const withType = pool.filter((c) => listMatches(c.propertyTypes, lead.propertyType))
    if (withType.length) pool = withType
  }
  if (lead.language) {
    const withLang = pool.filter((c) => listMatches(c.languages, lead.language))
    if (withLang.length) pool = withLang
  }
  if (rule.respectWorkingHours) {
    // `null` = no hay horario configurado. No se excluye a quien no lo tiene:
    // sería castigar la falta de configuración dejando leads sin asignar.
    const available = pool.filter((c) => c.withinWorkingHours !== false)
    if (available.length) pool = available
  }

  return [...pool].sort((a, b) => a.id - b.id)
}

/**
 * Elige dentro del grupo. Función pura: el contador del turno rotatorio entra
 * como argumento y no se lee aquí, para que la decisión sea reproducible y
 * comprobable sin base de datos.
 */
export function pickFromPool(
  rule: RoutingRule,
  lead: RoutableLead,
  pool: RoutableCommercial[],
  opts: { cursorCounter?: number } = {},
): { commercial: RoutableCommercial | null; step: string } {
  const strategy = (STRATEGIES.includes(rule.strategy as RoutingStrategy) ? rule.strategy : 'round_robin') as RoutingStrategy

  if (strategy === 'property_owner') {
    if (!lead.propertyOwnerCommercialId) return { commercial: null, step: 'el lead no viene de ningún inmueble con comercial asignado' }
    const owner = pool.find((c) => c.id === lead.propertyOwnerCommercialId)
    if (!owner) return { commercial: null, step: 'el comercial del inmueble no está disponible' }
    return { commercial: owner, step: 'comercial del inmueble' }
  }

  if (strategy === 'specific') {
    if (!rule.targetCommercialId) return { commercial: null, step: 'la regla no indica a qué comercial asignar' }
    const target = pool.find((c) => c.id === rule.targetCommercialId)
    if (!target) return { commercial: null, step: 'el comercial indicado no está disponible' }
    return { commercial: target, step: 'comercial fijado por la regla' }
  }

  if (!pool.length) return { commercial: null, step: 'no hay ningún comercial que cumpla las condiciones' }

  if (strategy === 'least_load') {
    // "Carga" = leads vivos asignados. Es una definición simple y explícita, no
    // una fórmula inventada: si mañana se quiere contar también tareas o citas,
    // se cambia aquí y se documenta.
    const sorted = [...pool].sort((a, b) => (a.activeLeads ?? 0) - (b.activeLeads ?? 0) || a.id - b.id)
    const chosen = sorted[0]
    return { commercial: chosen, step: `menos carga (${chosen.activeLeads ?? 0} leads vivos)` }
  }

  const counter = opts.cursorCounter ?? 0
  const chosen = pool[counter % pool.length]
  return { commercial: chosen, step: `turno rotatorio (${pool.length} comerciales)` }
}

/** El ámbito cuyo contador avanza. Separar por regla y oficina evita que dos repartos distintos se pisen el turno. */
export function cursorScopeFor(rule: RoutingRule): string {
  return `rule:${rule.id}:office:${normalize(rule.targetOffice) || 'all'}`
}

/**
 * Construye la explicación legible a partir de los pasos que se dieron.
 * La produce el motor para que la interfaz y la auditoría digan exactamente lo
 * mismo, en vez de que cada una narre su versión.
 */
export function explain(steps: string[], commercialName: string | null): string {
  const parts = [...steps]
  parts.push(commercialName || 'sin asignar')
  return parts.join(' → ')
}
