import { PROPERTY_SHEET_FIELD_MAP } from './propertySheet'

/**
 * Validación inmediata de un campo del editor de propiedad (FASE 25, bloque
 * N7a). Pura y compartible: el editor la llama mientras se escribe y los
 * tests la prueban sin navegador. Repite lo que el servidor ya exige (los
 * límites de `utils/propertySheet.ts` para la ficha ampliada y unos rangos
 * básicos para las columnas de la fila); el servidor sigue siendo quien
 * decide.
 */

/** Rangos de las columnas de la fila (las de la ficha ampliada llevan los suyos en propertySheet.ts). */
const ROW_LIMITS: Record<string, { min?: number; max?: number; integer?: boolean }> = {
  price: { min: 0 },
  priceOld: { min: 0 },
  area: { min: 0 },
  usableArea: { min: 0 },
  plotArea: { min: 0 },
  terraceArea: { min: 0 },
  gardenArea: { min: 0 },
  balconyArea: { min: 0 },
  storageArea: { min: 0 },
  bedrooms: { min: 0, max: 100, integer: true },
  bathrooms: { min: 0, max: 100, integer: true },
  toilets: { min: 0, max: 100, integer: true },
  livingRooms: { min: 0, max: 100, integer: true },
  kitchens: { min: 0, max: 100, integer: true },
  garageSpaces: { min: 0, max: 1000, integer: true },
  yearBuilt: { min: 1500, max: 2100, integer: true },
  lat: { min: -90, max: 90 },
  lng: { min: -180, max: 180 },
  rentalYield: { min: 0, max: 100 },
  serviceChargeAnnual: { min: 0 },
  locationPrivacyRadius: { min: 0, max: 50000 },
}

export interface ValidatableField {
  key: string
  type: string
  label?: string
  required?: boolean
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** El mensaje de error del campo, o '' si está bien. `touched`: sólo se exige lo obligatorio después de tocarlo. */
export function validatePropertyField(field: ValidatableField, value: unknown, touched = true): string {
  if (field.type === 'computed' || field.type === 'checkbox') return ''
  if (isEmpty(value)) return field.required && touched ? 'Este campo es obligatorio.' : ''

  const sheet = PROPERTY_SHEET_FIELD_MAP[field.key]
  const limits = { ...(ROW_LIMITS[field.key] || {}), ...(sheet ? { min: sheet.min, max: sheet.max, integer: sheet.type === 'integer' } : {}) }

  if (field.type === 'number' || field.type === 'stepper' || sheet?.type === 'number' || sheet?.type === 'integer') {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return 'Tiene que ser un número.'
    if (limits.integer && !Number.isInteger(n)) return 'Tiene que ser un número entero.'
    if (limits.min !== undefined && n < limits.min) return `No puede ser menor que ${limits.min.toLocaleString('es-ES')}.`
    if (limits.max !== undefined && n > limits.max) return `No puede ser mayor que ${limits.max.toLocaleString('es-ES')}.`
  }
  if (field.type === 'url' || sheet?.type === 'url') {
    if (!/^https:\/\/[^\s]+$/i.test(String(value))) return 'El enlace tiene que empezar por https://'
  }
  if (field.type === 'date' || sheet?.type === 'date') {
    const s = String(value).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return 'Fecha no válida (AAAA-MM-DD).'
  }
  if (typeof value === 'string' && (field.type === 'text' || field.type === 'textarea') && value.length > 4000) return 'Como máximo 4000 caracteres.'
  return ''
}
