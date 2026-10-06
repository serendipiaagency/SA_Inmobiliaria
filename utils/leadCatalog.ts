/**
 * Catálogo del Lead (núcleo inmobiliario, FASES 12-16): etapas, resultados
 * alternativos, orígenes y prioridades, con su etiqueta en español. Una sola
 * lista para el servidor (validación) y el panel (etiquetas). Las etapas son
 * las mismas que server/utils/leads/pipeline.ts (STAGES) — test/unit lo comprueba.
 */

export const LEAD_STAGES = ['new', 'contacted', 'qualifying', 'qualified', 'viewing', 'offer', 'negotiation', 'won'] as const
export const LEAD_STAGE_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualifying: 'Cualificando',
  qualified: 'Cualificado',
  viewing: 'Visita',
  offer: 'Oferta',
  negotiation: 'Negociación',
  won: 'Ganado',
  // No son etapas: son los dos movimientos de resultado que también quedan en el historial.
  lost: 'Perdido',
  reactivated: 'Reactivado',
}

/** Resultados alternativos al pipeline (FASE 13): el lead se cierra sin ganarse. */
export const LEAD_LOST_REASONS = ['no_response', 'not_interested', 'duplicate', 'other'] as const
export const LEAD_LOST_REASON_LABELS: Record<string, string> = {
  no_response: 'No responde',
  not_interested: 'No interesado',
  duplicate: 'Duplicado',
  other: 'Perdido (otro motivo)',
}

/**
 * Motivos rápidos del cambio de fase (cierre del núcleo, FASE 13): los chips
 * de la ventana del motivo, según la fase a la que va el lead. Sólo rellenan
 * el texto, que se puede editar; el servidor exige que no llegue vacío
 * (server/utils/leads/pipeline.ts#requirePanelStageReason). `reactivated` son
 * los de «Reactivar» un lead perdido.
 */
export const LEAD_STAGE_QUICK_REASONS: Record<string, string[]> = {
  new: ['Se movió por error', 'Vuelve a empezar desde cero'],
  contacted: ['Primera llamada hecha', 'Respondió por WhatsApp', 'Respondió por email'],
  qualifying: ['Recogiendo lo que busca', 'Pendiente de confirmar presupuesto'],
  qualified: ['Presupuesto y zona confirmados', 'Financiación validada'],
  viewing: ['Visita agendada', 'Visita hecha'],
  offer: ['Ha presentado una oferta', 'Preparando la oferta'],
  negotiation: ['Contraoferta en curso', 'Negociando condiciones'],
  won: ['Reserva firmada', 'Operación cerrada'],
  reactivated: ['Ha vuelto a escribir', 'Retoma la búsqueda', 'Se marcó perdido por error'],
}
/** Los que valen para cualquier fase, detrás de los propios. */
export const LEAD_STAGE_GENERIC_REASONS = ['A petición del cliente', 'Corrección: estaba mal la fase']

export const LEAD_SOURCES = ['web', 'portal', 'whatsapp', 'call', 'email', 'referral', 'ads', 'social', 'walk_in', 'event', 'visit', 'api', 'other'] as const
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  web: 'Web',
  portal: 'Portal inmobiliario',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  email: 'Email',
  referral: 'Recomendación',
  ads: 'Anuncios',
  social: 'Redes sociales',
  walk_in: 'Visita a la oficina',
  event: 'Evento',
  visit: 'Reserva de visita',
  api: 'API',
  other: 'Otro',
  legacy: 'Histórico',
}

export const LEAD_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const LEAD_PRIORITY_LABELS: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }

export function leadSourceLabel(v: string | null | undefined): string {
  if (!v) return '—'
  return LEAD_SOURCE_LABELS[v] || v
}

/** Ámbitos de las reglas de enrutado (FASE 15): server/utils/leads/routing.ts los evalúa en orden de prioridad. */
export const ROUTING_SCOPES = ['property', 'zone', 'office', 'language', 'property_type', 'new_build', 'team', 'department'] as const
export const ROUTING_SCOPE_LABELS: Record<string, string> = {
  property: 'Propiedad (su comercial responsable)',
  zone: 'Zona',
  office: 'Oficina',
  language: 'Idioma',
  property_type: 'Tipo de inmueble',
  new_build: 'Obra nueva',
  team: 'Equipo',
  department: 'Reparto general / departamento',
}
