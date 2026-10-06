import { createError } from 'h3'

/**
 * Catálogo de los cerebros de INMO (bloque N8b) y la validación de los
 * ajustes de cada agencia, sin dependencias: lo importan el motor de
 * recursos (adminResources.ts) y server/utils/inmo/brains.ts.
 *
 * Cada cerebro es un perfil por tarea: sus instrucciones y el SUBCONJUNTO de
 * herramientas que puede usar. Una agencia puede desactivarlo, añadirle
 * indicaciones y RECORTAR herramientas; nunca añadir una que el perfil no
 * tenga. El RBAC de cada usuario se aplica después (brains.ts).
 */

export interface BrainDefinition {
  key: string
  label: string
  description: string
  instructions: string
  tools: readonly string[]
}

const READ_CORE = ['search_properties', 'get_property', 'find_contacts', 'search_knowledge', 'recall_memory'] as const

export const INMO_BRAINS: readonly BrainDefinition[] = [
  {
    key: 'general',
    label: 'General',
    description: 'Todo lo que tu usuario puede hacer con INMO: buscar, cualificar, agendar, ofertar y consultar el conocimiento de la agencia.',
    instructions: '',
    tools: [
      ...READ_CORE,
      'find_matches',
      'create_lead',
      'update_lead',
      'create_contact',
      'update_buyer_requirements',
      'book_viewing',
      'reschedule_viewing',
      'cancel_viewing',
      'create_task',
      'send_property',
      'create_property_selection',
      'create_offer',
      'remember_fact',
    ],
  },
  {
    key: 'captacion',
    label: 'Comercial y captación',
    description: 'Dar de alta y repartir oportunidades: contactos, leads, primeras tareas y lo que la agencia sabe de cada propiedad.',
    instructions:
      'Te centras en captar y organizar oportunidades nuevas: identificar a la persona (find_contacts antes de crear nada), crear el contacto o el lead si no existe, asignarlo y dejar la siguiente tarea. Antes de crear, comprueba que no exista ya.',
    tools: [...READ_CORE, 'create_contact', 'create_lead', 'update_lead', 'create_task', 'remember_fact'],
  },
  {
    key: 'cualificacion',
    label: 'Cualificación de compradores',
    description: 'Entender qué busca cada comprador, guardar su necesidad y encontrar compatibles con el motor de Matching.',
    instructions:
      'Te centras en cualificar compradores: concretar operación, presupuesto, zonas, tipo y características; guardar la necesidad sólo si te lo piden (update_buyer_requirements) y proponer compatibles con find_matches. No avances etapas del lead sin que te lo pidan.',
    tools: [...READ_CORE, 'update_buyer_requirements', 'find_matches', 'create_property_selection', 'update_lead', 'create_task', 'remember_fact'],
  },
  {
    key: 'seguimiento',
    label: 'Seguimiento de operaciones',
    description: 'Visitas, tareas de seguimiento, ofertas y el avance del lead hasta el cierre.',
    instructions:
      'Te centras en el seguimiento: visitas (agendar, mover, cancelar), tareas, ofertas y etapas del lead. Antes de proponer un paso, revisa lo anotado (recall_memory) y lo que ya hay agendado.',
    tools: [...READ_CORE, 'find_matches', 'book_viewing', 'reschedule_viewing', 'cancel_viewing', 'create_task', 'create_offer', 'update_lead', 'remember_fact'],
  },
  {
    key: 'redaccion',
    label: 'Redacción de comunicaciones',
    description: 'Borradores de emails y mensajes con los datos reales de la propiedad y del cliente. No envía nada.',
    instructions:
      'Redactas BORRADORES de mensajes, emails y textos para que la persona los revise y los envíe ella. Nunca envías nada ni dices que algo se ha enviado. Usa sólo datos que te devuelvan las herramientas (la vista pública de la propiedad si el texto es para un cliente) y marca entre corchetes lo que falte, p. ej. [fecha de la visita].',
    tools: [...READ_CORE],
  },
]

export const DEFAULT_BRAIN = 'general'
export const BRAIN_INSTRUCTIONS_MAX = 2000

export function getBrainDefinition(key: string | null | undefined): BrainDefinition | undefined {
  return INMO_BRAINS.find((b) => b.key === key)
}

export function parseTools(raw: unknown): string[] | null {
  if (raw == null || raw === '') return null
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(v) ? v.map(String) : null
  } catch {
    return null
  }
}

/**
 * `prepare` del recurso `inmo-brains` (ajustes de la agencia). Rechaza, en vez
 * de ignorar en silencio, cualquier herramienta que el perfil no tenga.
 */
export function prepareBrainSettings(data: Record<string, any>, isCreate: boolean, existing?: Record<string, any> | null): Record<string, any> {
  const fail = (m: string): never => {
    throw createError({ statusCode: 422, statusMessage: m })
  }
  const key = String(data.brainKey ?? existing?.brainKey ?? '')
  const def = getBrainDefinition(key)
  if (!def) fail('Perfil de INMO desconocido')
  if (!isCreate && existing && 'brainKey' in data && data.brainKey !== existing.brainKey) fail('No se puede cambiar el perfil de un ajuste: crea otro')
  if (data.enabled != null) {
    data.enabled = Number(data.enabled) ? 1 : 0
    if (key === DEFAULT_BRAIN && !data.enabled) fail('El perfil General no se puede desactivar: es el de reserva')
  }
  if ('instructions' in data && data.instructions != null) {
    const text = String(data.instructions).trim()
    if (text.length > BRAIN_INSTRUCTIONS_MAX) fail(`Las indicaciones admiten como máximo ${BRAIN_INSTRUCTIONS_MAX} caracteres`)
    data.instructions = text || null
  }
  if ('toolsJson' in data && data.toolsJson != null) {
    const tools = parseTools(data.toolsJson)
    if (!tools) fail('Las herramientas deben ser una lista')
    const outside = tools!.filter((t) => !def!.tools.includes(t))
    if (outside.length) fail(`El perfil «${def!.label}» no incluye: ${outside.join(', ')}. Un ajuste sólo puede quitar herramientas, nunca añadirlas.`)
    data.toolsJson = JSON.stringify([...new Set(tools)])
  }
  return data
}
