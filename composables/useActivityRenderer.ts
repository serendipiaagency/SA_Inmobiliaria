/**
 * ActivityRenderer (FASE 21) — convierte una fila de `activities` en texto
 * legible, en un único sitio. Sin esto cada pantalla que muestre actividad
 * (Contacto, Lead, Propiedad, Operación, la ficha antigua de Cliente)
 * inventaría su propio texto para el mismo `eventType`, y acabarían diciendo
 * cosas distintas del mismo hecho.
 *
 * Bloque N6: cubre TODOS los tipos de evento (las etiquetas viven en
 * `utils/pipelineCatalog.ts`, compartido con el servidor), con el detalle
 * que cada uno lleva en `metadata` y un enlace a la entidad que lo originó.
 * Nunca enseña datos privados (texto de notas, contenido de mensajes): la
 * actividad sólo guarda referencias.
 */
import { ACTIVITY_EVENT_LABELS, DEAL_RECORD_KIND_LABELS, DEAL_STAGE_LABELS, DEAL_STATUS_LABELS, formatAmount } from '~/utils/pipelineCatalog'
import { appointmentStatusLabel } from '~/utils/appointmentCatalog'

/** Nombre legible de los campos de un contacto que se completan al unificar (CONTACT_UNIFIED). */
const CONTACT_FIELD_LABELS: Record<string, string> = {
  email: 'email',
  phone: 'teléfono',
  whatsapp: 'WhatsApp',
  externalId: 'id externo',
  language: 'idioma',
  country: 'país',
  source: 'origen',
  officeId: 'oficina',
  assignedCommercialId: 'comercial',
  nextActionType: 'próxima acción',
  nextActionAt: 'fecha de la próxima acción',
  notes: 'notas',
}

export interface ActivityRow {
  id: number
  eventType: string
  createdAt: string
  metadataJson?: string | null
  actorType: string
  actorId?: number | null
  actorName?: string | null
  entityType?: string
  entityId?: number
  contactId?: number | null
  leadId?: number | null
  propertyId?: number | null
  propertyKind?: string | null
  appointmentId?: number | null
}

function metadata(row: ActivityRow): Record<string, any> {
  if (!row.metadataJson) return {}
  try {
    return JSON.parse(row.metadataJson)
  } catch {
    return {}
  }
}

const OUTCOME_LABELS: Record<string, string> = { interested: 'Interesado', wants_to_think: 'Se lo piensa', not_interested: 'No le convenció' }
const OFFER_BY_LABELS: Record<string, string> = { buyer: 'del comprador', seller: 'del vendedor', user: 'registrada por el comercial' }

/** Texto para mostrar en una cronología — nunca incluye datos privados (notas, contenido de mensajes). */
export function renderActivity(row: ActivityRow): { title: string; detail: string | null } {
  const title = ACTIVITY_EVENT_LABELS[row.eventType] || row.eventType
  const meta = metadata(row)

  switch (row.eventType) {
    case 'MATCH_DISCARDED':
      return { title, detail: meta.reason || null }
    case 'PROPERTY_SELECTION_CREATED': {
      if (!meta.title) return { title, detail: null }
      const added = Number(meta.added) || 0
      return { title, detail: `${meta.created ? 'Creada' : 'Ampliada'}: «${meta.title}» (${added} ${added === 1 ? 'propiedad' : 'propiedades'})` }
    }
    case 'VISIT_OUTCOME_RECORDED':
      return { title, detail: meta.outcome ? OUTCOME_LABELS[meta.outcome] || meta.outcome : null }
    case 'APPOINTMENT_RESCHEDULED':
      return { title, detail: meta.to ? `Nueva fecha: ${meta.to}` : null }
    case 'APPOINTMENT_TRASHED':
    case 'APPOINTMENT_RESTORED':
      // Cierre D3a: qué cita era (su fecha) y en qué estado estaba al eliminarla o vuelve.
      return { title, detail: meta.scheduledAt ? `Cita del ${String(meta.scheduledAt).slice(0, 16)}${meta.status ? ` · ${appointmentStatusLabel(meta.status).toLowerCase()}` : ''}` : null }
    case 'LEAD_CREATED':
      return { title, detail: meta.source ? `Origen: ${meta.source}` : null }
    case 'LEAD_ASSIGNED':
    case 'LEAD_REASSIGNED':
      return { title, detail: meta.reason || null }
    case 'BUYER_REQUIREMENT_CREATED':
      return { title, detail: meta.title || null }
    case 'OFFER_COUNTERED':
    case 'OFFER_RESUBMITTED':
      return { title, detail: meta.amount != null ? `${formatAmount(meta.amount)}${meta.by && OFFER_BY_LABELS[meta.by] ? ` · ${OFFER_BY_LABELS[meta.by]}` : ''}` : null }
    case 'DEAL_STAGE_CHANGED':
      return { title, detail: meta.toStage ? `${DEAL_STAGE_LABELS[meta.fromStage] || meta.fromStage || '—'} → ${DEAL_STAGE_LABELS[meta.toStage] || meta.toStage}` : null }
    case 'DEAL_CANCELLED':
      return { title, detail: meta.reason || null }
    case 'DEAL_TRASHED':
      // Cierre C1: en qué punto estaba cuando se mandó a la papelera.
      return { title, detail: meta.stage ? `Estaba en ${DEAL_STAGE_LABELS[meta.stage] || meta.stage}${meta.status && meta.status !== 'active' ? ` (${(DEAL_STATUS_LABELS[meta.status] || meta.status).toLowerCase()})` : ''}` : null }
    case 'DEAL_RECORD_LINKED':
    case 'DEAL_RECORD_UNLINKED':
      return { title, detail: meta.kind ? `${DEAL_RECORD_KIND_LABELS[meta.kind] || meta.kind} #${meta.recordId}` : null }
    case 'PROPERTY_SHARE_OPENED':
      // Núcleo N8a: también la apertura de su enlace personal (email o chat web).
      return { title, detail: meta.via === 'link' ? `Abrió su enlace personal (${meta.channel === 'chat' ? 'chat web' : 'email'})` : 'Lectura confirmada por WhatsApp' }
    case 'PROPERTY_SENT':
      return { title, detail: meta.channel === 'email' ? 'Por email' : meta.channel === 'chat' ? 'Por el chat web' : null }
    case 'EMAIL_REPLY_RECEIVED':
      // FASE 29: el texto está en el hilo; aquí sólo si trajo adjuntos que no se guardaron.
      return { title, detail: meta.attachmentsIgnored ? `En su hilo de Comunicaciones · ${meta.attachmentsIgnored} adjunto${meta.attachmentsIgnored === 1 ? '' : 's'} sin guardar` : 'En su hilo de Comunicaciones' }
    case 'CONTACT_MERGED':
      return { title, detail: meta.mergedName ? `Se unificó «${meta.mergedName}» en este contacto; su historial aparece aquí` : null }
    case 'CONTACT_UNIFIED': {
      // Cierre del núcleo (FASE 14): qué se completó y qué no se pisó al unificar un alta nueva.
      const field = (k: string) => CONTACT_FIELD_LABELS[k] || k
      const filled: string[] = Array.isArray(meta.filled) ? meta.filled : []
      const skipped: string[] = Array.isArray(meta.skipped) ? meta.skipped : []
      const parts = [filled.length ? `Se completó: ${filled.map(field).join(', ')}` : 'Sin datos nuevos que añadir', skipped.length ? `no se pisó: ${skipped.map(field).join(', ')}` : null]
      return { title, detail: parts.filter(Boolean).join(' · ') }
    }
    default:
      return { title, detail: null }
  }
}

/** Quién lo hizo: el usuario del panel por su nombre; si no, el cliente, el sistema o la IA. */
export function activityActor(row: ActivityRow): string | null {
  if (row.actorType === 'user') return row.actorName || 'Usuario del panel'
  if (row.actorType === 'contact') return 'El cliente'
  if (row.actorType === 'ai') return 'INMO (IA)'
  if (row.actorType === 'system') return 'Automático'
  return null
}

/** Enlace a la pantalla de la entidad que originó el evento, cuando existe una. */
export function activityLink(row: ActivityRow): { to: string; label: string } | null {
  switch (row.entityType) {
    case 'deal':
      return row.entityId ? { to: `/admin/deal-operations/${row.entityId}`, label: 'Ver operación' } : null
    case 'offer':
      return row.entityId ? { to: `/admin/ofertas?offer=${row.entityId}`, label: 'Ver oferta' } : null
    case 'lead':
      return row.entityId ? { to: `/admin/leads/${row.entityId}`, label: 'Ver lead' } : null
    case 'task':
      return { to: '/admin/tareas', label: 'Ver tareas' }
    case 'comms_message':
    case 'comms_call':
    case 'comms_web_message':
    case 'property_share_link':
      return { to: '/admin/comunicaciones', label: 'Ver comunicaciones' }
    default:
      return row.appointmentId ? { to: '/admin/visitas', label: 'Ver citas' } : null
  }
}
