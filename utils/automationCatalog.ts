import { DEAL_STAGES, DEAL_STAGE_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPES, TASK_TYPE_LABELS } from './pipelineCatalog'
import { LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, LEAD_STAGES, LEAD_STAGE_LABELS } from './leadCatalog'

/**
 * Catálogo de las automatizaciones (bloque N8b), compartido por el panel
 * (pages/admin/automatizaciones.vue) y el motor (server/utils/automations).
 *
 * Sólo disparadores con un hecho REAL ya registrado en el dominio, y sólo
 * acciones que existen como Domain Tool sin confirmación humana. Los envíos a
 * clientes (WhatsApp, email) no se ofrecen: en este panel exigen que una
 * persona los confirme (send_property, §20), y una automatización no puede
 * confirmar por nadie.
 */

export const AUTOMATION_TRIGGERS = ['lead.created', 'lead.unattended', 'lead.stage_changed', 'visit.completed', 'offer.accepted', 'deal.stage_changed', 'task.overdue'] as const
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  'lead.created': 'Lead creado',
  'lead.unattended': 'Lead sin atender (SLA)',
  'lead.stage_changed': 'Lead cambia de etapa',
  'visit.completed': 'Visita realizada',
  'offer.accepted': 'Oferta aceptada',
  'deal.stage_changed': 'Operación cambia de etapa',
  'task.overdue': 'Tarea vencida',
}

/** De dónde sale cada disparador: el hecho real que lo produce. */
export const AUTOMATION_TRIGGER_HELP: Record<AutomationTrigger, string> = {
  'lead.created': 'Cada lead nuevo de cualquier origen (web, portal, API, alta manual, INMO): el evento «Lead creado» de Actividad.',
  'lead.unattended': 'Cuando el control de SLA abre la alerta «sin atender» de un lead (Enrutamiento y SLA marca el umbral). Se comprueba cada hora.',
  'lead.stage_changed': 'Cada cambio de etapa del lead que queda en su historial (también «perdido» y «reactivado»).',
  'visit.completed': 'Cuando una visita a un inmueble se marca como realizada.',
  'offer.accepted': 'Cuando el vendedor acepta una oferta.',
  'deal.stage_changed': 'Cada cambio de etapa de una operación (reserva, arras, financiación…).',
  'task.overdue': 'Una tarea abierta cuya fecha ya pasó (hora local de la agencia). Sólo las que vencen después de activar la automatización.',
}

export const AUTOMATION_ACTIONS = ['create_task', 'assign_lead', 'change_lead_stage', 'create_note', 'notify_team'] as const
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number]

export const AUTOMATION_ACTION_LABELS: Record<AutomationAction, string> = {
  create_task: 'Crear tarea',
  assign_lead: 'Asignar el lead a un comercial',
  change_lead_stage: 'Cambiar la etapa del lead',
  create_note: 'Añadir una nota',
  notify_team: 'Avisar al equipo (campana del panel)',
}

/** Qué Domain Tool ejecuta cada acción. */
export const AUTOMATION_ACTION_TOOL: Record<AutomationAction, string> = {
  create_task: 'create_task',
  assign_lead: 'update_lead',
  change_lead_stage: 'update_lead',
  create_note: 'create_note',
  notify_team: 'notify_team',
}

/** Acciones que sólo tienen sentido si el evento trae un lead. */
export const ACTIONS_NEEDING_LEAD: readonly AutomationAction[] = ['assign_lead', 'change_lead_stage']

export const CONDITION_OPS = ['eq', 'neq', 'in', 'empty', 'not_empty', 'gte', 'lte'] as const
export type ConditionOp = (typeof CONDITION_OPS)[number]
export const CONDITION_OP_LABELS: Record<ConditionOp, string> = { eq: 'es', neq: 'no es', in: 'es uno de', empty: 'está vacío', not_empty: 'no está vacío', gte: 'es mayor o igual que', lte: 'es menor o igual que' }

export interface ConditionFieldDef {
  key: string
  label: string
  type: 'enum' | 'number' | 'ref'
  options?: readonly string[]
  optionLabels?: Record<string, string>
  ops: readonly ConditionOp[]
  /** Disparadores en los que tiene sentido (vacío = todos los que traen lead). */
  triggers: readonly AutomationTrigger[]
}

const LEAD_TRIGGERS: readonly AutomationTrigger[] = ['lead.created', 'lead.unattended', 'lead.stage_changed', 'visit.completed', 'offer.accepted', 'deal.stage_changed', 'task.overdue']
const ENUM_OPS: readonly ConditionOp[] = ['eq', 'neq', 'in']

export const CONDITION_FIELDS: readonly ConditionFieldDef[] = [
  { key: 'lead.source', label: 'Origen del lead', type: 'enum', options: LEAD_SOURCES, optionLabels: LEAD_SOURCE_LABELS, ops: ENUM_OPS, triggers: LEAD_TRIGGERS },
  { key: 'lead.stage', label: 'Etapa actual del lead', type: 'enum', options: LEAD_STAGES, optionLabels: LEAD_STAGE_LABELS, ops: ENUM_OPS, triggers: LEAD_TRIGGERS },
  { key: 'lead.priority', label: 'Prioridad del lead', type: 'enum', options: LEAD_PRIORITIES, optionLabels: LEAD_PRIORITY_LABELS, ops: ENUM_OPS, triggers: LEAD_TRIGGERS },
  { key: 'lead.commercial', label: 'Comercial del lead', type: 'ref', ops: ['empty', 'not_empty', 'eq'], triggers: LEAD_TRIGGERS },
  { key: 'lead.budget', label: 'Presupuesto del lead', type: 'number', ops: ['gte', 'lte', 'empty', 'not_empty'], triggers: LEAD_TRIGGERS },
  {
    key: 'stage.to',
    label: 'Etapa nueva',
    type: 'enum',
    options: [...LEAD_STAGES, 'lost', 'reactivated', ...DEAL_STAGES],
    optionLabels: { ...LEAD_STAGE_LABELS, lost: 'Perdido', reactivated: 'Reactivado', ...DEAL_STAGE_LABELS },
    ops: ENUM_OPS,
    triggers: ['lead.stage_changed', 'deal.stage_changed'],
  },
  {
    key: 'stage.from',
    label: 'Etapa anterior',
    type: 'enum',
    options: [...LEAD_STAGES, ...DEAL_STAGES],
    optionLabels: { ...LEAD_STAGE_LABELS, ...DEAL_STAGE_LABELS },
    ops: ENUM_OPS,
    triggers: ['lead.stage_changed', 'deal.stage_changed'],
  },
  { key: 'task.type', label: 'Tipo de tarea', type: 'enum', options: TASK_TYPES, optionLabels: TASK_TYPE_LABELS, ops: ENUM_OPS, triggers: ['task.overdue'] },
  { key: 'task.priority', label: 'Prioridad de la tarea', type: 'enum', options: TASK_PRIORITIES, optionLabels: TASK_PRIORITY_LABELS, ops: ENUM_OPS, triggers: ['task.overdue'] },
]

export function conditionFieldsFor(trigger: string): ConditionFieldDef[] {
  return CONDITION_FIELDS.filter((f) => (f.triggers as readonly string[]).includes(trigger))
}

export const AUTOMATION_RUN_STATUS_LABELS: Record<string, string> = { ok: 'Hecho', error: 'Error', skipped: 'No aplica', running: 'En curso', waiting: 'Esperando', cancelled: 'Cancelado' }

/** Variables que se pueden usar en títulos, notas y avisos. */
export const AUTOMATION_TEMPLATE_VARS: Record<string, string> = {
  '{{nombre}}': 'Nombre del lead (o del contacto)',
  '{{evento}}': 'Qué la disparó (p. ej. «Visita realizada»)',
  '{{etapa}}': 'Etapa nueva (cambios de etapa)',
  '{{id}}': 'Id de la entidad que la disparó',
}
