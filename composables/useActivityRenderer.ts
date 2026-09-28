/**
 * ActivityRenderer (FASE 21) — convierte una fila de `activities` en texto
 * legible, en un único sitio. Sin esto cada pantalla que muestre actividad
 * (Cliente, y en el futuro Property/Lead) inventaría su propio texto para el
 * mismo `eventType`, y acabarían diciendo cosas distintas del mismo hecho.
 */

export interface ActivityRow {
  id: number
  eventType: string
  createdAt: string
  metadataJson?: string | null
  actorType: string
}

const LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead recibido',
  LEAD_ASSIGNED: 'Lead asignado',
  LEAD_REASSIGNED: 'Lead reasignado',
  LEAD_QUALIFIED: 'Lead cualificado',
  BUYER_REQUIREMENT_CREATED: 'Necesidad registrada',
  MATCH_SELECTED: 'Coincidencia seleccionada',
  MATCH_DISCARDED: 'Coincidencia descartada',
  APPOINTMENT_CREATED: 'Cita agendada',
  APPOINTMENT_RESCHEDULED: 'Cita reprogramada',
  APPOINTMENT_CANCELLED: 'Cita cancelada',
  VIEWING_COMPLETED: 'Visita completada',
  VIEWING_NO_SHOW: 'El cliente no se presentó a la visita',
  VISIT_OUTCOME_RECORDED: 'Resultado de visita anotado',
}

function metadata(row: ActivityRow): Record<string, any> {
  if (!row.metadataJson) return {}
  try {
    return JSON.parse(row.metadataJson)
  } catch {
    return {}
  }
}

/** Texto para mostrar en una cronología — nunca incluye datos privados (notas, contenido de mensajes). */
export function renderActivity(row: ActivityRow): { title: string; detail: string | null } {
  const title = LABELS[row.eventType] || row.eventType
  const meta = metadata(row)

  if (row.eventType === 'MATCH_DISCARDED' && meta.reason) return { title, detail: meta.reason }
  if (row.eventType === 'VISIT_OUTCOME_RECORDED' && meta.outcome) {
    const outcomeLabel: Record<string, string> = { interested: 'Interesado', wants_to_think: 'Se lo piensa', not_interested: 'No le convenció' }
    return { title, detail: outcomeLabel[meta.outcome] || meta.outcome }
  }
  if (row.eventType === 'APPOINTMENT_RESCHEDULED' && meta.to) return { title, detail: `Nueva fecha: ${meta.to}` }
  return { title, detail: null }
}
