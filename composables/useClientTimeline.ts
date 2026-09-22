/**
 * Construye la cronología de un cliente a partir de **hechos registrados**.
 *
 * Cada evento sale de una fila que existe: una visita de `visits`, una
 * operación de `deals`, una reserva de `reservations`, un contrato de
 * `contracts`, un lead de `leads`, y los cambios hechos desde el panel de
 * `admin_audit_log`.
 *
 * No se inventa nada. En concreto **no hay un evento «cliente creado»
 * sintético**: si la ficha se dio de alta antes de que Clientes tuviera CRUD
 * —es decir, si la sembró una migración— no existe ninguna entrada de
 * auditoría para ella, y fabricarla a partir de `created_at` sería presentar
 * una suposición como un hecho registrado. Desde que el alta pasa por el
 * panel, sí aparece.
 */

export interface TimelineEvent {
  id: string
  at: string
  kind: 'visit' | 'deal' | 'reservation' | 'contract' | 'lead' | 'admin' | 'message' | 'call'
  title: string
  detail: string | null
  /** Enlace a la pantalla donde se ve el hecho completo (el hilo de WhatsApp, por ejemplo). */
  to?: string | null
}

const CALL_OUTCOME: Record<string, string> = {
  answered: 'contestó',
  interested: 'interesado',
  callback: 'pide que le llamen',
  no_answer: 'no contesta',
  busy: 'comunica',
  voicemail: 'buzón de voz',
  wrong_number: 'número equivocado',
  not_interested: 'no interesado',
}

const CALL_STATUS: Record<string, string> = {
  completed: 'completada',
  missed: 'perdida',
  cancelled: 'sin respuesta',
  failed: 'fallida',
  rejected: 'rechazada',
  ringing: 'sonando',
  in_progress: 'en curso',
  accepted: 'en curso',
  initiated: 'iniciada',
}

const AUDIT_LABELS: Record<string, string> = {
  create: 'Cliente creado desde el panel',
  update: 'Ficha modificada',
  delete: 'Cliente eliminado',
  restore: 'Cliente restaurado',
}

const VISIT_STATUS: Record<string, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}

export function buildClientTimeline(related: any): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const v of related.visits || []) {
    events.push({
      id: `visit-${v.id}`,
      at: v.scheduledAt,
      kind: 'visit',
      title: `Visita ${(VISIT_STATUS[v.status] || v.status).toLowerCase()}`,
      detail: [v.propertyName, v.agentName].filter(Boolean).join(' · ') || null,
    })
  }

  for (const d of related.deals || []) {
    events.push({
      id: `deal-${d.id}`,
      at: d.closedAt,
      kind: 'deal',
      title: d.dealType === 'rental' ? 'Alquiler cerrado' : 'Venta cerrada',
      detail: [d.propertyName, d.agentName].filter(Boolean).join(' · ') || null,
    })
  }

  for (const r of related.reservations || []) {
    events.push({
      id: `reservation-${r.id}`,
      at: r.reservedAt,
      kind: 'reservation',
      title: 'Reserva registrada',
      detail: [r.propertyName, r.reference].filter(Boolean).join(' · ') || null,
    })
  }

  for (const c of related.contracts || []) {
    events.push({
      id: `contract-${c.id}`,
      at: c.acceptedAt || c.createdAt,
      kind: 'contract',
      title: c.acceptedAt ? 'Contrato firmado' : 'Contrato enviado',
      detail: c.title || null,
    })
  }

  for (const l of related.leads || []) {
    events.push({
      id: `lead-${l.id}`,
      at: l.createdAt,
      kind: 'lead',
      title: 'Lead recibido',
      detail: [l.propertyName, l.source].filter(Boolean).join(' · ') || null,
    })
  }

  for (const a of related.activity || []) {
    events.push({
      id: `audit-${a.id}`,
      at: a.createdAt,
      kind: 'admin',
      title: AUDIT_LABELS[a.action] || a.action,
      detail: a.userEmail || null,
    })
  }

  // WhatsApp: cada mensaje real del Centro de Comunicaciones (las notas
  // internas y las entradas de llamada del hilo tienen su propio hecho).
  for (const m of related.messages || []) {
    if (m.direction === 'note' || m.type === 'call') continue
    const text = (m.body || '').replace(/\s+/g, ' ').trim()
    events.push({
      id: `message-${m.id}`,
      at: m.createdAt,
      kind: 'message',
      title: m.direction === 'in' ? 'WhatsApp recibido' : m.status === 'failed' ? 'WhatsApp no entregado' : 'WhatsApp enviado',
      detail: text ? (text.length > 120 ? `${text.slice(0, 119)}…` : text) : m.type === 'property_share' ? 'Propiedad compartida' : m.type,
      to: `/admin/comunicaciones?conversation=${m.conversationId}`,
    })
  }

  for (const c of related.calls || []) {
    const parts = [CALL_OUTCOME[c.outcome] || null, c.durationSeconds ? `${Math.round(c.durationSeconds / 60)} min` : null, c.notes || null].filter(Boolean)
    events.push({
      id: `call-${c.id}`,
      at: c.startedAt || c.createdAt,
      kind: 'call',
      title: `${c.direction === 'inbound' ? 'Llamada recibida' : 'Llamada realizada'} ${c.provider === 'manual' ? '' : 'por WhatsApp '}(${CALL_STATUS[c.status] || c.status})`.replace(/\s+\(/, ' ('),
      detail: parts.join(' · ') || null,
      to: c.conversationId ? `/admin/comunicaciones?conversation=${c.conversationId}` : null,
    })
  }

  return events.filter((e) => !!e.at).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
