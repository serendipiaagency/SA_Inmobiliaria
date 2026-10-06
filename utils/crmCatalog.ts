/**
 * Catálogos del CRM (núcleo inmobiliario, FASES 8-9 y 0): roles de contacto,
 * roles de un contacto en una propiedad, tipos de próxima acción y entidades
 * a las que se puede colgar una nota. Una sola lista, compartida por el
 * servidor (validación) y el panel (etiquetas). Las claves son las que se
 * guardan; lo que se lee es la etiqueta.
 */

/** Roles de un contacto (FASE 8). Una persona puede tener varios a la vez. */
export const CONTACT_ROLES = ['buyer', 'seller', 'owner', 'landlord', 'tenant', 'investor', 'collaborator', 'supplier', 'other'] as const
export type ContactRole = (typeof CONTACT_ROLES)[number]
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  buyer: 'Comprador',
  seller: 'Vendedor',
  owner: 'Propietario',
  landlord: 'Arrendador',
  tenant: 'Inquilino',
  investor: 'Inversor',
  collaborator: 'Colaborador',
  supplier: 'Proveedor',
  other: 'Otro',
}

/** Papel de un contacto en una propiedad concreta (PropertyContact, FASE 8). */
export const PROPERTY_CONTACT_ROLES = ['owner', 'co_owner', 'attorney', 'tenant', 'contact'] as const
export type PropertyContactRole = (typeof PROPERTY_CONTACT_ROLES)[number]
export const PROPERTY_CONTACT_ROLE_LABELS: Record<PropertyContactRole, string> = {
  owner: 'Propietario',
  co_owner: 'Copropietario',
  attorney: 'Apoderado',
  tenant: 'Inquilino',
  contact: 'Contacto',
}
/** Los papeles que cuentan para el porcentaje de propiedad (nunca puede pasar del 100 %). */
export const OWNERSHIP_ROLES: readonly PropertyContactRole[] = ['owner', 'co_owner']

/** Tipos de próxima acción (FASE 9 y 22). */
export const NEXT_ACTION_TYPES = ['call', 'whatsapp', 'email', 'visit', 'meeting', 'send_properties', 'follow_up', 'other'] as const
export const NEXT_ACTION_LABELS: Record<string, string> = {
  call: 'Llamar',
  whatsapp: 'Escribir por WhatsApp',
  email: 'Enviar email',
  visit: 'Visita',
  meeting: 'Reunión',
  send_properties: 'Enviar propiedades',
  follow_up: 'Seguimiento',
  other: 'Otra',
}

/** Estados de un contacto. `archived` es el que deja una fusión de duplicados. */
export const CONTACT_STATUSES = ['active', 'inactive', 'archived'] as const
export const CONTACT_STATUS_LABELS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', archived: 'Archivado' }

/** Origen de un contacto: cómo llegó a la agencia. */
export const CONTACT_SOURCES = ['web', 'portal', 'phone', 'whatsapp', 'email', 'walk_in', 'referral', 'social', 'event', 'import', 'other'] as const
export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  web: 'Web',
  portal: 'Portal inmobiliario',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  email: 'Email',
  walk_in: 'Visita a la oficina',
  referral: 'Recomendación',
  social: 'Redes sociales',
  event: 'Evento',
  import: 'Importación',
  other: 'Otro',
}

/** Idiomas de trato más habituales (ISO 639-1). */
export const LANGUAGE_OPTIONS = ['es', 'en', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ar', 'zh', 'ca', 'eu', 'gl'] as const
export const LANGUAGE_LABELS: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  de: 'Alemán',
  it: 'Italiano',
  pt: 'Portugués',
  nl: 'Neerlandés',
  ru: 'Ruso',
  ar: 'Árabe',
  zh: 'Chino',
  ca: 'Catalán',
  eu: 'Euskera',
  gl: 'Gallego',
}
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]

/**
 * Nombres con los que llega un idioma desde fuera (un formulario, la API v1,
 * una integración): en castellano, en el propio idioma y en inglés, sin
 * acentos ni mayúsculas. Lo que no está aquí ni es un código del catálogo no
 * se adivina.
 */
const LANGUAGE_ALIASES: Record<string, LanguageCode> = {
  espanol: 'es',
  castellano: 'es',
  spanish: 'es',
  ingles: 'en',
  english: 'en',
  frances: 'fr',
  francais: 'fr',
  french: 'fr',
  aleman: 'de',
  deutsch: 'de',
  german: 'de',
  italiano: 'it',
  italian: 'it',
  portugues: 'pt',
  portuguese: 'pt',
  neerlandes: 'nl',
  holandes: 'nl',
  nederlands: 'nl',
  dutch: 'nl',
  ruso: 'ru',
  russian: 'ru',
  arabe: 'ar',
  arabic: 'ar',
  chino: 'zh',
  chinese: 'zh',
  catalan: 'ca',
  catala: 'ca',
  euskera: 'eu',
  euskara: 'eu',
  basque: 'eu',
  gallego: 'gl',
  galego: 'gl',
  galician: 'gl',
}

/**
 * Lleva un idioma tal cual llega (FASE 15: «es-ES», «pt_BR», «EN», «English»,
 * «Español»…) al código del catálogo (`LANGUAGE_OPTIONS`), o `null` si no es
 * uno de ellos. Lo usan la captación (web pública, API v1, INMO) y el
 * enrutado, para que el «en-GB» del navegador y una regla «Inglés» coincidan.
 */
export function normalizeLanguage(raw: unknown): LanguageCode | null {
  if (typeof raw !== 'string') return null
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!v || v.length > 40) return null
  const primary = v.split(/[-_;,.\s]/)[0]
  if ((LANGUAGE_OPTIONS as readonly string[]).includes(primary)) return primary as LanguageCode
  return LANGUAGE_ALIASES[v] ?? LANGUAGE_ALIASES[primary] ?? null
}

/** Entidades a las que se puede colgar una nota (Note, FASE 0). */
export const NOTE_ENTITY_TYPES = ['contact', 'lead', 'property', 'appointment', 'deal'] as const
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number]

/**
 * Lo que se mueve al unificar dos contactos (server/utils/contacts/merge.ts),
 * en el orden y con el nombre que ve quien va a confirmar la fusión.
 */
export const MERGE_RELATION_LABELS: { key: string; one: string; many: string }[] = [
  { key: 'leads', one: 'lead', many: 'leads' },
  { key: 'buyerRequirements', one: 'necesidad', many: 'necesidades' },
  { key: 'matches', one: 'compatibilidad', many: 'compatibilidades' },
  { key: 'clients', one: 'ficha de cliente', many: 'fichas de cliente' },
  { key: 'propertyContacts', one: 'vínculo con una propiedad (propietario, inquilino…)', many: 'vínculos con propiedades (propietario, inquilino…)' },
  { key: 'roles', one: 'rol', many: 'roles' },
  { key: 'offers', one: 'oferta', many: 'ofertas' },
  { key: 'dealOperations', one: 'operación', many: 'operaciones' },
  { key: 'visits', one: 'cita', many: 'citas' },
  { key: 'tasks', one: 'tarea', many: 'tareas' },
  { key: 'notes', one: 'nota', many: 'notas' },
  { key: 'selections', one: 'selección de propiedades', many: 'selecciones de propiedades' },
  { key: 'documentAccess', one: 'acceso a un documento', many: 'accesos a documentos' },
  { key: 'tags', one: 'etiqueta', many: 'etiquetas' },
  { key: 'customFields', one: 'campo personalizado', many: 'campos personalizados' },
]

/** «2 leads, 1 necesidad y 3 notas» — sólo lo que de verdad hay que mover. */
export function describeMergeRelations(relations: Record<string, number> | null | undefined): string {
  const parts = MERGE_RELATION_LABELS.filter((r) => Number(relations?.[r.key]) > 0).map((r) => {
    const n = Number(relations![r.key])
    return `${n} ${n === 1 ? r.one : r.many}`
  })
  if (!parts.length) return ''
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}
