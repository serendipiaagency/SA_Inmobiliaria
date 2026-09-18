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
  kind: 'visit' | 'deal' | 'reservation' | 'contract' | 'lead' | 'admin'
  title: string
  detail: string | null
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

  return events.filter((e) => !!e.at).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
