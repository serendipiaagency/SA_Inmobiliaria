import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as schema from '../../db/schema'
import { selectInChunks } from '../sqlChunks'

/**
 * Lectura de citas para el panel (FASES 17-20): la Lista y el Calendario de
 * /admin/visitas y la ficha de una cita. Una sola forma de fila para las
 * tres, con todos los campos de FASE 17 y el resultado estructurado de
 * FASE 19, más lo que hace falta para pintarla sin otra petición: nombre
 * del lead, del contacto (el de la cita o, si no tiene, el de su lead) y de
 * la oficina (la de la cita o, si no tiene, la de su comercial), y las
 * ofertas que ese comprador ha hecho sobre ese inmueble.
 *
 * Todo acotado por organización, también los JOIN: una fila de otra agencia
 * con el mismo id nunca se cuela en el nombre.
 */

export interface RelatedOffer {
  id: number
  status: string
  amount: number
  currency: string
  createdAt: string
}

export interface AppointmentFilters {
  /** 'YYYY-MM-DD' — rango del calendario (inclusive por días). */
  from?: string | null
  to?: string | null
  status?: string | null
  type?: string | null
  agentId?: number | null
  /** Oficina como entidad (`offices.id`): la de la cita o, si no tiene, la de su comercial. */
  officeId?: number | null
  /** Compatibilidad: oficina como texto libre del comercial (`team_members.office_name`). */
  office?: string | null
  propertyId?: number | null
  propertyKind?: string | null
  /** Cliente: la cita es de ese contacto, directamente o a través de su lead. */
  contactId?: number | null
  leadId?: number | null
  order?: 'asc' | 'desc'
  limit?: number
}

const A = alias(schema.teamMembers, 'appt_agent')
const L = alias(schema.leads, 'appt_lead')
const O = alias(schema.offices, 'appt_office')
const C = alias(schema.contacts, 'appt_contact')
const V = schema.visits

// Alias propios: tres tablas tienen una columna `name` y dos `office_id`; sin
// ellos, un cliente que devuelva filas por nombre de columna las confundiría.
const effectiveOfficeId = sql<number | null>`coalesce(${V.officeId}, ${A.officeId})`.as('appt_effective_office_id')
const effectiveContactId = sql<number | null>`coalesce(${V.contactId}, ${L.contactId})`.as('appt_effective_contact_id')

function baseSelect(db: any) {
  return db
    .select({
      id: V.id,
      clientName: V.clientName,
      clientEmail: V.clientEmail,
      clientPhone: V.clientPhone,
      propertyId: V.propertyId,
      propertyKind: V.propertyKind,
      propertyName: V.propertyName,
      agentId: V.agentId,
      agentName: V.agentName,
      office: A.officeName,
      officeId: V.officeId,
      effectiveOfficeId,
      officeName: sql<string | null>`${O.name}`.as('appt_office_name'),
      scheduledAt: V.scheduledAt,
      endsAt: V.endsAt,
      durationMinutes: V.durationMinutes,
      timezone: V.timezone,
      status: V.status,
      channel: V.channel,
      type: V.type,
      confirmationStatus: V.confirmationStatus,
      confirmedAt: V.confirmedAt,
      reminderStatus: V.reminderStatus,
      reminder24hSentAt: V.reminder24hSentAt,
      reminder1hSentAt: V.reminder1hSentAt,
      meetingPoint: V.meetingPoint,
      notes: V.notes,
      internalNotes: V.internalNotes,
      cancellationReason: V.cancellationReason,
      cancelledAt: V.cancelledAt,
      videoLink: V.videoLink,
      leadId: V.leadId,
      leadName: sql<string | null>`${L.name}`.as('appt_lead_name'),
      contactId: effectiveContactId,
      ownContactId: V.contactId,
      contactName: sql<string | null>`${C.name}`.as('appt_contact_name'),
      dealId: V.dealId,
      tourId: V.tourId,
      tourStopOrder: V.tourStopOrder,
      outcome: V.outcome,
      outcomeNotes: V.outcomeNotes,
      outcomeRecordedAt: V.outcomeRecordedAt,
      interestLevel: V.interestLevel,
      outcomeLiked: V.outcomeLiked,
      outcomeDisliked: V.outcomeDisliked,
      pricePerception: V.pricePerception,
      locationRating: V.locationRating,
      conditionRating: V.conditionRating,
      layoutRating: V.layoutRating,
      wantsSecondVisit: V.wantsSecondVisit,
      wantsToOffer: V.wantsToOffer,
      discarded: V.discarded,
      createdAt: V.createdAt,
      updatedAt: V.updatedAt,
    })
    .from(V)
    .leftJoin(A, and(eq(A.id, V.agentId), eq(A.organizationId, V.organizationId)))
    .leftJoin(L, and(eq(L.id, V.leadId), eq(L.organizationId, V.organizationId)))
    .leftJoin(O, and(eq(O.organizationId, V.organizationId), sql`${O.id} = coalesce(${V.officeId}, ${A.officeId})`))
    .leftJoin(C, and(eq(C.organizationId, V.organizationId), sql`${C.id} = coalesce(${V.contactId}, ${L.contactId})`))
}

export type AppointmentRow = Record<string, any> & { id: number; offers: RelatedOffer[] }

/**
 * Ofertas relacionadas con cada cita: las del comprador de la cita (su
 * contacto, o el de su lead) sobre el inmueble de la cita. Es la relación
 * natural «este cliente ha ofertado por esta casa» — sirve igual para una
 * oferta creada desde el resultado de la visita que para una hecha después.
 */
export async function attachRelatedOffers(db: any, orgId: number, rows: Array<{ id: number; contactId?: number | null; propertyId?: number | null; propertyKind?: string | null; leadId?: number | null }>): Promise<Map<number, RelatedOffer[]>> {
  const out = new Map<number, RelatedOffer[]>()
  const withProperty = rows.filter((r) => r.propertyId && r.propertyKind)
  if (!withProperty.length) return out

  // Los tours guardan el contacto en la parada; una cita antigua puede tenerlo sólo en su lead.
  const missingContactLeadIds = [...new Set(withProperty.filter((r) => !r.contactId && r.leadId).map((r) => r.leadId as number))]
  const leadContact = new Map<number, number | null>()
  for (const l of await selectInChunks(missingContactLeadIds, (part) => db.select({ id: schema.leads.id, contactId: schema.leads.contactId }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.id, part))))) {
    leadContact.set((l as any).id, (l as any).contactId)
  }
  const buyerOf = (r: (typeof withProperty)[number]) => r.contactId || (r.leadId ? leadContact.get(r.leadId) : null) || null
  const contactIds = [...new Set(withProperty.map(buyerOf).filter(Boolean))] as number[]
  if (!contactIds.length) return out

  const offers = await selectInChunks(contactIds, (part) =>
    db
      .select({
        id: schema.offers.id,
        status: schema.offers.status,
        amount: schema.offers.currentAmount,
        currency: schema.offers.currency,
        createdAt: schema.offers.createdAt,
        buyerContactId: schema.offers.buyerContactId,
        propertyId: schema.offers.propertyId,
        propertyKind: schema.offers.propertyKind,
      })
      .from(schema.offers)
      .where(and(eq(schema.offers.organizationId, orgId), inArray(schema.offers.buyerContactId, part)))
      .orderBy(desc(schema.offers.createdAt)),
  )
  const byKey = new Map<string, RelatedOffer[]>()
  for (const o of offers as any[]) {
    const key = `${o.buyerContactId}:${o.propertyKind}:${o.propertyId}`
    const list = byKey.get(key) || []
    list.push({ id: o.id, status: o.status, amount: o.amount, currency: o.currency, createdAt: o.createdAt })
    byKey.set(key, list)
  }
  for (const r of withProperty) {
    const buyer = buyerOf(r)
    if (!buyer) continue
    const list = byKey.get(`${buyer}:${r.propertyKind}:${r.propertyId}`)
    if (list?.length) out.set(r.id, list)
  }
  return out
}

/** Citas con los filtros del calendario y de la lista (FASE 20). */
export async function listAppointments(db: any, orgId: number, f: AppointmentFilters = {}): Promise<AppointmentRow[]> {
  const conds: SQL[] = [eq(V.organizationId, orgId), isNull(V.deletedAt)]
  if (f.from) conds.push(gte(V.scheduledAt, `${f.from} 00:00:00`))
  if (f.to) conds.push(lte(V.scheduledAt, `${f.to} 23:59:59`))
  if (f.status && f.status !== 'all') conds.push(eq(V.status, f.status))
  if (f.type && f.type !== 'all') conds.push(eq(V.type, f.type))
  if (f.agentId) conds.push(eq(V.agentId, f.agentId))
  if (f.officeId) conds.push(sql`coalesce(${V.officeId}, ${A.officeId}) = ${f.officeId}`)
  if (f.office) conds.push(eq(A.officeName, f.office))
  if (f.propertyId) {
    conds.push(eq(V.propertyId, f.propertyId))
    if (f.propertyKind) conds.push(eq(V.propertyKind, f.propertyKind))
  }
  if (f.contactId) conds.push(or(eq(V.contactId, f.contactId), eq(L.contactId, f.contactId))!)
  if (f.leadId) conds.push(eq(V.leadId, f.leadId))

  const rows = await baseSelect(db)
    .where(and(...conds))
    .orderBy(f.order === 'asc' ? asc(V.scheduledAt) : desc(V.scheduledAt))
    .limit(Math.min(Math.max(f.limit || 200, 1), 1000))
  const offers = await attachRelatedOffers(db, orgId, rows)
  return rows.map((r: any) => ({ ...r, offers: offers.get(r.id) || [] }))
}

/** Una cita de esta agencia con todos sus campos (la ficha), o null. */
export async function getAppointment(db: any, orgId: number, id: number): Promise<AppointmentRow | null> {
  const [row] = await baseSelect(db)
    .where(and(eq(V.organizationId, orgId), eq(V.id, id)))
    .limit(1)
  if (!row) return null
  const offers = await attachRelatedOffers(db, orgId, [row])
  return { ...row, offers: offers.get(row.id) || [] }
}

/** Cuántas citas hay en cada estado (los contadores de la Lista). */
export async function appointmentStatusCounts(db: any, orgId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: V.status, n: sql<number>`count(*)` })
    .from(V)
    .where(and(eq(V.organizationId, orgId), isNull(V.deletedAt)))
    .groupBy(V.status)
  const counts: Record<string, number> = {}
  for (const r of rows as any[]) counts[r.status] = Number(r.n)
  return counts
}
