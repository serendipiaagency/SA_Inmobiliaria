/**
 * Etiquetas de INMO para el panel (pages/admin/inmo.vue, inmo-ajustes.vue y
 * el panel de workflows): nombres legibles de las herramientas, de las
 * entidades y de las fuentes de conocimiento, y el enlace de cada entidad.
 */

export const INMO_TOOL_LABELS: Record<string, string> = {
  search_properties: 'Buscar propiedades',
  get_property: 'Consultar propiedad',
  create_lead: 'Crear lead',
  update_lead: 'Actualizar lead',
  create_contact: 'Crear contacto',
  find_contacts: 'Buscar contactos',
  update_buyer_requirements: 'Guardar necesidad',
  find_matches: 'Compatibilidades',
  book_viewing: 'Agendar visita',
  reschedule_viewing: 'Mover visita',
  cancel_viewing: 'Cancelar visita',
  create_task: 'Crear tarea',
  send_property: 'Enviar propiedad',
  create_property_selection: 'Guardar selección',
  create_offer: 'Crear oferta',
  // Bloque N8b — INMO Intelligence.
  search_knowledge: 'Buscar en el conocimiento',
  recall_memory: 'Consultar memoria',
  remember_fact: 'Recordar un dato',
  create_note: 'Crear nota',
  notify_team: 'Avisar al equipo',
}
export const inmoToolLabel = (name: string) => INMO_TOOL_LABELS[name] || name

export const INMO_ENTITY_LABELS: Record<string, string> = {
  contact: 'Contacto',
  lead: 'Lead',
  agent_property: 'Propiedad 2ª mano',
  developer_property: 'Propiedad (web)',
  appointment: 'Cita',
  task: 'Tarea',
  buyer_requirement: 'Necesidad',
  offer: 'Oferta',
  property_selection: 'Selección',
  comms_message: 'Mensaje',
  note: 'Nota',
  deal: 'Operación',
  notification: 'Aviso',
}
export const inmoEntityLabel = (type: string) => INMO_ENTITY_LABELS[type] || type

/** Enlace al panel de una entidad que maneja INMO, o null si no tiene ficha propia. */
export function inmoEntityLink(e: { type: string; id: number }): string | null {
  switch (e.type) {
    case 'contact':
      return `/admin/contactos/${e.id}`
    case 'lead':
      return `/admin/leads/${e.id}`
    case 'agent_property':
      return `/admin/properties/${e.id}`
    case 'developer_property':
      return `/admin/developer-properties/${e.id}`
    case 'appointment':
      return '/admin/visitas'
    case 'task':
      return '/admin/tareas'
    case 'buyer_requirement':
      return '/admin/compatibilidades'
    case 'offer':
      return '/admin/ofertas'
    case 'deal':
      return `/admin/deal-operations/${e.id}`
    default:
      return null
  }
}

export const INMO_SOURCE_LABELS: Record<string, string> = {
  help: 'Ayuda del panel',
  knowledge: 'Documento de la agencia',
  notes: 'Nota',
  properties: 'Ficha de propiedad',
}

/** Enlace a la ficha de la que es una nota (la memoria de INMO son notas). */
export function inmoNoteLink(n: { entityType: string; entityId: number; propertyKind?: string | null }): string | null {
  if (n.entityType === 'property') return n.propertyKind === 'developer' ? `/admin/developer-properties/${n.entityId}` : `/admin/properties/${n.entityId}`
  return inmoEntityLink({ type: n.entityType, id: n.entityId })
}
