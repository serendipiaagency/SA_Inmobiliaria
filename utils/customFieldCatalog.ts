/**
 * Campos personalizados (FASE 0, migración 0086): vocabulario común del
 * panel y del servidor. En `utils/` raíz para que la página de definiciones,
 * el `CustomFieldsPanel` y `server/utils/customFields/service.ts` lean la
 * MISMA lista (importación explícita en el servidor: Nitro no comparte el
 * auto-import de `utils/`).
 */

export const CUSTOM_FIELD_ENTITY_TYPES = ['property', 'contact', 'lead', 'appointment', 'deal'] as const
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number]

export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntityType, string> = {
  property: 'Propiedades',
  contact: 'Contactos',
  lead: 'Leads',
  appointment: 'Citas',
  deal: 'Operaciones',
}

export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'date', 'select', 'multiselect'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  boolean: 'Sí / No',
  date: 'Fecha',
  select: 'Lista (una opción)',
  multiselect: 'Lista (varias opciones)',
}

/** Tipos con lista de opciones: la definición no se guarda sin ellas. */
export const CUSTOM_FIELD_TYPES_WITH_OPTIONS: readonly CustomFieldType[] = ['select', 'multiselect']

/** Límites de una definición y de un valor (los comprueba el servidor; el panel sólo los anuncia). */
export const CUSTOM_FIELD_LIMITS = {
  label: 120,
  key: 50,
  section: 80,
  helpText: 500,
  options: 100,
  option: 120,
  text: 500,
  textarea: 5000,
} as const

/** Una definición tal y como la devuelve el servidor al panel de una ficha. */
export interface CustomFieldDefinitionDto {
  id: number
  entityType: CustomFieldEntityType
  key: string
  label: string
  fieldType: CustomFieldType
  options: string[]
  isRequired: boolean
  section: string | null
  sortOrder: number
  helpText: string | null
  isPublic: boolean
  status: 'active' | 'archived'
}

/** Valor de un campo en el panel: texto, número, sí/no, fecha (AAAA-MM-DD), opción o lista de opciones. */
export type CustomFieldValue = string | number | boolean | string[] | null

/** Texto legible de un valor (listados, ficha pública, exportaciones). */
export function formatCustomFieldValue(fieldType: string, value: CustomFieldValue): string {
  if (value === null || value === undefined || value === '') return ''
  if (fieldType === 'boolean') return value === true || value === 1 || value === '1' ? 'Sí' : 'No'
  if (fieldType === 'multiselect') return Array.isArray(value) ? value.join(', ') : String(value)
  if (fieldType === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  if (fieldType === 'number' && typeof value === 'number') return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(value)
  return String(value)
}
