import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import type { PropertyKind } from '../matching/service'
import { assertLiveProperty } from '../properties/trash'
import { contactNames, officeNames, propertyNameOf, propertyNames, teamMemberNames, userNames, withCreatorNames } from '../crm/labels'
import { selectInChunks } from '../sqlChunks'
import { DEAL_RECORD_KINDS, DEAL_STAGES, DEAL_STATUSES } from '../../../utils/pipelineCatalog'
import { syncCommercialStatusAfterAvailability } from '../properties/commercialStatus'

/**
 * DealService (FASE 24) — el único sitio que crea o transiciona un Deal
 * Operation (tabla `deal_operations`, distinta de la legacy `deals` — ver
 * el comentario junto a `dealOperations` en server/db/schema.ts y
 * docs/deals.md).
 *
 * Lead ≠ Offer ≠ Deal (§93): Lead es la oportunidad, Offer la negociación,
 * Deal la operación ya en ejecución/cierre. Nunca se crea en automático de
 * forma irreversible (§94): nace de "Crear operación" sobre una Offer ya
 * `accepted`, nunca al aceptarla — una por oferta (índice único
 * `deal_operations_accepted_offer`).
 */

// Los valores válidos (y su etiqueta) viven en el catálogo compartido con el panel.
export { DEAL_RECORD_KINDS, DEAL_STAGES, DEAL_STATUSES }
export type DealStage = (typeof DEAL_STAGES)[number]
export type DealStatus = (typeof DEAL_STATUSES)[number]
export type DealRecordKind = (typeof DEAL_RECORD_KINDS)[number]

export interface DealRow {
  id: number
  organizationId: number
  propertyId: number
  propertyKind: string
  buyerContactId: number
  acceptedOfferId: number
  leadId: number | null
  buyerRequirementId: number | null
  commercialId: number | null
  stage: string
  status: string
  agreedAmount: number
  currency: string
  openedAt: string
  closedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  legacyDealId: number | null
  createdBy: number | null
  /** Migración 0086 — oficina (entidad Oficinas) y borrado lógico. */
  officeId?: number | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface ActorOpts {
  actorType: 'user' | 'system'
  actorId?: number | null
}

async function recordDealActivity(db: any, orgId: number, deal: DealRow, eventType: string, actor: ActorOpts, metadata?: Record<string, unknown>) {
  await recordActivity(db, orgId, {
    eventType: eventType as any,
    entityType: 'deal',
    entityId: deal.id,
    contactId: deal.buyerContactId,
    leadId: deal.leadId,
    propertyId: deal.propertyId,
    propertyKind: deal.propertyKind as PropertyKind,
    actorType: actor.actorType,
    actorId: actor.actorId ?? null,
    metadata,
  })
}

async function getDealOrThrow(db: any, orgId: number, dealId: number): Promise<DealRow> {
  const rows = await db
    .select()
    .from(schema.dealOperations)
    .where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId), isNull(schema.dealOperations.deletedAt)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Operación no encontrada' })
  return rows[0]
}

/**
 * Crea el Deal Operation a partir de una Offer ya `accepted` — nunca al
 * aceptarla. Copia importe/moneda y compradores/vendedores de la oferta
 * (§103/§104: no sólo el importe, la oferta aceptada queda vinculada de
 * verdad).
 */
export async function createDeal(db: any, orgId: number, input: { acceptedOfferId: number }, opts: { createdBy?: number | null } = {}): Promise<DealRow> {
  const offerRows = await db.select().from(schema.offers).where(and(eq(schema.offers.id, input.acceptedOfferId), eq(schema.offers.organizationId, orgId))).limit(1)
  const offer = offerRows[0]
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Oferta no encontrada' })
  if (offer.status !== 'accepted') throw createError({ statusCode: 422, statusMessage: 'Sólo se puede crear una operación a partir de una oferta aceptada' })

  const existing = await db
    .select({ id: schema.dealOperations.id, deletedAt: schema.dealOperations.deletedAt })
    .from(schema.dealOperations)
    .where(eq(schema.dealOperations.acceptedOfferId, offer.id))
    .limit(1)
  // Una operación en la papelera sigue ocupando su oferta (índice único): se restaura, no se crea otra.
  if (existing[0]?.deletedAt) throw createError({ statusCode: 409, statusMessage: `La operación #${existing[0].id} de esta oferta está en la papelera: restáurala desde Operaciones → Papelera` })
  if (existing[0]) throw createError({ statusCode: 409, statusMessage: 'Ya existe una operación para esta oferta' })
  // Una operación nueva sobre una propiedad en la papelera, no. Las que ya
  // existían siguen avanzando y cerrándose (historia).
  await assertLiveProperty(db, orgId, offer.propertyKind === 'agent' ? 'agent' : 'developer', offer.propertyId, { action: 'crear una operación', notFoundMessage: 'Inmueble no encontrado' })

  const sellerRows = await db.select({ contactId: schema.offerSellers.contactId }).from(schema.offerSellers).where(eq(schema.offerSellers.offerId, offer.id))

  const nowTs = now()
  const [deal] = await db
    .insert(schema.dealOperations)
    .values({
      organizationId: orgId,
      propertyId: offer.propertyId,
      propertyKind: offer.propertyKind,
      buyerContactId: offer.buyerContactId,
      acceptedOfferId: offer.id,
      leadId: offer.leadId,
      buyerRequirementId: offer.buyerRequirementId,
      commercialId: offer.commercialId,
      stage: 'accepted_offer',
      status: 'active',
      agreedAmount: offer.currentAmount,
      currency: offer.currency,
      openedAt: nowTs,
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  if (sellerRows.length) {
    await db.insert(schema.dealOperationSellers).values(sellerRows.map((r: any) => ({ dealOperationId: deal.id, contactId: r.contactId, createdAt: nowTs })))
  }

  await db.insert(schema.dealOperationStageHistory).values({ organizationId: orgId, dealOperationId: deal.id, fromStage: null, toStage: 'accepted_offer', actorType: 'user', actorId: opts.createdBy ?? null, createdAt: nowTs })

  await recordDealActivity(db, orgId, deal, 'DEAL_CREATED', { actorType: 'user', actorId: opts.createdBy ?? null })
  return deal
}

/** Mueve de etapa (nunca a `closed` — eso es `closeDeal()`, que además cierra la operación y sincroniza el inmueble). Sólo sobre un Deal `active`. */
export async function transitionDealStage(db: any, orgId: number, dealId: number, toStage: DealStage, opts: ActorOpts & { reason?: string | null }): Promise<DealRow> {
  if (toStage === 'closed') throw createError({ statusCode: 422, statusMessage: 'Para cerrar la operación usa la acción "Cerrar", no un cambio de etapa' })
  if (!(DEAL_STAGES as readonly string[]).includes(toStage)) throw createError({ statusCode: 422, statusMessage: 'Etapa no reconocida' })

  const deal = await getDealOrThrow(db, orgId, dealId)
  if (deal.status !== 'active') throw createError({ statusCode: 422, statusMessage: 'Esta operación ya no está activa' })

  const nowTs = now()
  await db.insert(schema.dealOperationStageHistory).values({ organizationId: orgId, dealOperationId: dealId, fromStage: deal.stage, toStage, actorType: opts.actorType, actorId: opts.actorId ?? null, reason: opts.reason ?? null, createdAt: nowTs })
  await db.update(schema.dealOperations).set({ stage: toStage, updatedAt: nowTs }).where(eq(schema.dealOperations.id, dealId))

  const updated: DealRow = { ...deal, stage: toStage, updatedAt: nowTs }
  await recordDealActivity(db, orgId, updated, 'DEAL_STAGE_CHANGED', opts, { fromStage: deal.stage, toStage })
  return updated
}

/**
 * §112: sólo toca el estado del inmueble cuando el catálogo tiene de verdad
 * un valor que lo represente — nunca se inventa uno. `agent_properties` sí
 * tiene `status: available|sold` para `transactionType: 'sale'`; no existe
 * un valor "rented" en ningún catálogo, ni ningún estado de venta en
 * `developer_properties` (su `status` es sólo fase de construcción). En
 * esos casos, deliberadamente, no se toca nada — ver docs/deals.md.
 */
async function syncPropertyStatusOnClose(db: any, orgId: number, propertyId: number, propertyKind: string) {
  if (propertyKind !== 'agent') return
  const rows = await db.select({ transactionType: schema.agentProperties.transactionType }).from(schema.agentProperties).where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId))).limit(1)
  if (rows[0]?.transactionType === 'sale') {
    await db.update(schema.agentProperties).set({ status: 'sold' }).where(eq(schema.agentProperties.id, propertyId))
    // Cierre D1p: un estado comercial ya indicado («Reservada», «Disponible»…)
    // pasa a «Vendida», como al marcarla vendida a mano (utils/propertyCommercialStatus.ts).
    await syncCommercialStatusAfterAvailability(db, orgId, propertyId, 'sold', null)
  }
}

/** Mismo criterio de catálogo que `adminCreate.ts` usa para citas: nombre visible + `transactionType` real, sin inventar uno cuando el inmueble no aparece. */
async function resolvePropertyNameAndType(db: any, orgId: number, propertyId: number, propertyKind: string): Promise<{ name: string | null; transactionType: string | null }> {
  if (propertyKind === 'agent') {
    const rows = await db
      .select({ reference: schema.agentProperties.reference, street: schema.agentProperties.street, streetNumber: schema.agentProperties.streetNumber, transactionType: schema.agentProperties.transactionType })
      .from(schema.agentProperties)
      .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
      .limit(1)
    const row = rows[0]
    if (!row) return { name: null, transactionType: null }
    return { name: row.reference || [row.street, row.streetNumber].filter(Boolean).join(' ') || null, transactionType: row.transactionType }
  }
  const rows = await db
    .select({ name: schema.developerProperties.name, transactionType: schema.developerProperties.transactionType })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId)))
    .limit(1)
  const row = rows[0]
  return { name: row?.name ?? null, transactionType: row?.transactionType ?? null }
}

/**
 * La comisión pactada en la ficha aplicada al importe de la operación:
 * porcentaje (3 → el 3 %) o importe fijo. Sin dato válido, 0 (lo de antes).
 */
export function commissionFromSheet(agreedAmount: number, sheet: { commissionType?: string | null; commissionValue?: number | null } | null | undefined): { rate: number; amount: number } {
  const value = Number(sheet?.commissionValue)
  if (!sheet?.commissionType || !Number.isFinite(value) || value <= 0 || !Number.isFinite(agreedAmount) || agreedAmount <= 0) return { rate: 0, amount: 0 }
  if (sheet.commissionType === 'percentage') return { rate: value, amount: Math.round(agreedAmount * value) / 100 }
  if (sheet.commissionType === 'fixed') return { rate: Math.round((value / agreedAmount) * 10_000) / 100, amount: value }
  return { rate: 0, amount: 0 }
}

/**
 * Puente al cierre, una sola dirección (ver comentario junto a
 * `dealOperations` en schema.ts y docs/deals.md): crea un apunte en la
 * tabla legacy `deals` para que los informes de comisiones ya existentes
 * (`deals-revenue.get.ts`, `pages/admin/operaciones.vue`) vean también lo
 * cerrado por este pipeline nuevo, sin tocar su esquema ni sus
 * consumidores. Este pipeline nunca lee de vuelta esa tabla.
 * La comisión sale de la ficha de la propiedad (`property_legal_economics`:
 * «Comisión» en porcentaje o importe fijo) aplicada al importe pactado. Sin
 * comisión en la ficha, nace en 0, como antes.
 */
async function bridgeToLegacyDeal(db: any, orgId: number, deal: DealRow): Promise<number | null> {
  const [buyerRows, agentRows, propertyInfo, economicsRows] = await Promise.all([
    db.select({ name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.id, deal.buyerContactId)).limit(1),
    deal.commercialId
      ? db.select({ name: schema.teamMembers.name }).from(schema.teamMembers).where(eq(schema.teamMembers.id, deal.commercialId)).limit(1)
      : Promise.resolve([] as { name: string }[]),
    resolvePropertyNameAndType(db, orgId, deal.propertyId, deal.propertyKind),
    db
      .select({ commissionType: schema.propertyLegalEconomics.commissionType, commissionValue: schema.propertyLegalEconomics.commissionValue })
      .from(schema.propertyLegalEconomics)
      .where(
        and(
          eq(schema.propertyLegalEconomics.organizationId, orgId),
          eq(schema.propertyLegalEconomics.propertyKind, deal.propertyKind),
          eq(schema.propertyLegalEconomics.propertyId, deal.propertyId),
        ),
      )
      .limit(1),
  ])
  const commission = commissionFromSheet(deal.agreedAmount, economicsRows[0])

  const clientName = buyerRows[0]?.name || 'Comprador'
  const agentName = agentRows[0]?.name ?? null
  const dealType = propertyInfo.transactionType === 'rent' ? 'rental' : 'sale'
  const nowTs = now()

  const [row] = await db
    .insert(schema.deals)
    .values({
      organizationId: orgId,
      leadId: deal.leadId,
      clientName,
      propertyId: deal.propertyId,
      propertyName: propertyInfo.name,
      agentId: deal.commercialId,
      agentName,
      dealType,
      dealValue: deal.agreedAmount,
      commissionRate: commission.rate,
      commissionAmount: commission.amount,
      closedAt: (deal.closedAt || nowTs).slice(0, 10),
      createdBy: deal.createdBy,
      createdAt: nowTs,
    })
    .returning()

  return row?.id ?? null
}

/** Cierra la operación: `closedAt`, Activity, sincroniza el estado del inmueble cuando el catálogo lo soporta de verdad (§111/§112), y crea el puente al informe de comisiones legacy. */
export async function closeDeal(db: any, orgId: number, dealId: number, opts: ActorOpts & { reason?: string | null }): Promise<DealRow> {
  const deal = await getDealOrThrow(db, orgId, dealId)
  if (deal.status !== 'active') throw createError({ statusCode: 422, statusMessage: 'Esta operación ya no está activa' })

  const nowTs = now()
  await db.insert(schema.dealOperationStageHistory).values({ organizationId: orgId, dealOperationId: dealId, fromStage: deal.stage, toStage: 'closed', actorType: opts.actorType, actorId: opts.actorId ?? null, reason: opts.reason ?? null, createdAt: nowTs })
  await db.update(schema.dealOperations).set({ stage: 'closed', status: 'closed', closedAt: nowTs, updatedAt: nowTs }).where(eq(schema.dealOperations.id, dealId))
  await syncPropertyStatusOnClose(db, orgId, deal.propertyId, deal.propertyKind)

  let updated: DealRow = { ...deal, stage: 'closed', status: 'closed', closedAt: nowTs, updatedAt: nowTs }

  const legacyDealId = await bridgeToLegacyDeal(db, orgId, updated)
  if (legacyDealId != null) {
    await db.update(schema.dealOperations).set({ legacyDealId }).where(eq(schema.dealOperations.id, dealId))
    updated = { ...updated, legacyDealId }
  }

  await recordDealActivity(db, orgId, updated, 'DEAL_CLOSED', opts, legacyDealId != null ? { legacyDealId } : undefined)
  return updated
}

/** Cancela sin borrar nada (§114): histórico, Offer, Appointments, Tasks y Activity quedan intactos. */
export async function cancelDeal(db: any, orgId: number, dealId: number, opts: ActorOpts & { reason: string }): Promise<DealRow> {
  const deal = await getDealOrThrow(db, orgId, dealId)
  if (deal.status !== 'active') throw createError({ statusCode: 422, statusMessage: 'Esta operación ya no está activa' })

  const nowTs = now()
  await db.update(schema.dealOperations).set({ status: 'cancelled', cancelledAt: nowTs, cancelReason: opts.reason, updatedAt: nowTs }).where(eq(schema.dealOperations.id, dealId))

  const updated: DealRow = { ...deal, status: 'cancelled', cancelledAt: nowTs, cancelReason: opts.reason, updatedAt: nowTs }
  await recordDealActivity(db, orgId, updated, 'DEAL_CANCELLED', opts, { reason: opts.reason })
  return updated
}

/**
 * Oficina y comercial de una operación (bloque N6). La oficina es la
 * entidad Oficinas (`offices`, viva y de esta organización) y el comercial
 * un `team_members` de esta organización: cualquier otra cosa es 404 — nunca
 * se guarda un id ajeno. `null` los quita. Se puede corregir en cualquier
 * estado de la operación: es organización interna, no un hito del proceso.
 */
export async function updateDeal(db: any, orgId: number, dealId: number, input: { officeId?: number | null; commercialId?: number | null }): Promise<DealRow> {
  const deal = await getDealOrThrow(db, orgId, dealId)
  const patch: Record<string, any> = {}
  if (input.officeId !== undefined) {
    if (input.officeId !== null) {
      const [office] = await db
        .select({ id: schema.offices.id })
        .from(schema.offices)
        .where(and(eq(schema.offices.id, input.officeId), eq(schema.offices.organizationId, orgId), isNull(schema.offices.deletedAt)))
        .limit(1)
      if (!office) throw createError({ statusCode: 404, statusMessage: 'Oficina no encontrada en esta organización' })
    }
    patch.officeId = input.officeId
  }
  if (input.commercialId !== undefined) {
    if (input.commercialId !== null) {
      const [member] = await db
        .select({ id: schema.teamMembers.id })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.id, input.commercialId), eq(schema.teamMembers.organizationId, orgId)))
        .limit(1)
      if (!member) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado en esta organización' })
    }
    patch.commercialId = input.commercialId
  }
  if (!Object.keys(patch).length) return deal
  const nowTs = now()
  patch.updatedAt = nowTs
  await db.update(schema.dealOperations).set(patch).where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId)))
  return { ...deal, ...patch }
}

/** La tabla real de cada cosa que se puede vincular a una operación (columna `deal_operation_id`, migración 0086). */
function recordTable(kind: DealRecordKind) {
  if (kind === 'reservation') return schema.reservations
  if (kind === 'deposit') return schema.depositPayments
  return schema.contracts
}

/**
 * Vincula una reserva, unas arras (depósito) o un contrato a la operación.
 * La operación y el registro tienen que ser de esta organización (404 si
 * no — una reserva de otra agencia no existe para esta). Un registro ya
 * vinculado a OTRA operación no se roba en silencio: 409, primero se
 * desvincula de aquélla. Vincularlo dos veces a la misma es idempotente.
 */
export async function linkDealRecord(db: any, orgId: number, dealId: number, kind: DealRecordKind, recordId: number, actor: ActorOpts): Promise<{ kind: DealRecordKind; id: number; dealOperationId: number }> {
  if (!(DEAL_RECORD_KINDS as readonly string[]).includes(kind)) throw createError({ statusCode: 422, statusMessage: 'Tipo de documento no reconocido' })
  const deal = await getDealOrThrow(db, orgId, dealId)
  const t = recordTable(kind)
  const [record] = await db
    .select({ id: t.id, dealOperationId: t.dealOperationId })
    .from(t)
    .where(and(eq(t.id, recordId), eq(t.organizationId, orgId)))
    .limit(1)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'No encontrado en esta organización' })
  if (record.dealOperationId === dealId) return { kind, id: recordId, dealOperationId: dealId }
  if (record.dealOperationId) throw createError({ statusCode: 409, statusMessage: `Ya está vinculado a la operación #${record.dealOperationId}: desvincúlalo de ella primero` })

  await db.update(t).set({ dealOperationId: dealId }).where(and(eq(t.id, recordId), eq(t.organizationId, orgId)))
  await recordDealActivity(db, orgId, deal, 'DEAL_RECORD_LINKED', actor, { kind, recordId })
  return { kind, id: recordId, dealOperationId: dealId }
}

/** Quita el vínculo — sólo si el registro está vinculado a ESTA operación (404 si no). No borra el registro. */
export async function unlinkDealRecord(db: any, orgId: number, dealId: number, kind: DealRecordKind, recordId: number, actor: ActorOpts): Promise<{ kind: DealRecordKind; id: number; dealOperationId: null }> {
  if (!(DEAL_RECORD_KINDS as readonly string[]).includes(kind)) throw createError({ statusCode: 422, statusMessage: 'Tipo de documento no reconocido' })
  const deal = await getDealOrThrow(db, orgId, dealId)
  const t = recordTable(kind)
  const [record] = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, recordId), eq(t.organizationId, orgId), eq(t.dealOperationId, dealId)))
    .limit(1)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'No está vinculado a esta operación' })
  await db.update(t).set({ dealOperationId: null }).where(and(eq(t.id, recordId), eq(t.organizationId, orgId)))
  await recordDealActivity(db, orgId, deal, 'DEAL_RECORD_UNLINKED', actor, { kind, recordId })
  return { kind, id: recordId, dealOperationId: null }
}

/** Cuántas reservas, arras y contratos de esta organización apuntan a la operación (una consulta por tabla, un parámetro de id cada una). */
async function linkedRecordCounts(db: any, orgId: number, dealId: number): Promise<Record<DealRecordKind, number>> {
  const out = { reservation: 0, deposit: 0, contract: 0 } as Record<DealRecordKind, number>
  for (const kind of DEAL_RECORD_KINDS) {
    const t = recordTable(kind)
    const [row] = await db
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.organizationId, orgId), eq(t.dealOperationId, dealId)))
    out[kind] = Number(row?.n) || 0
  }
  return out
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Manda la operación a la papelera (`deletedAt`, cierre C1): sale del
 * Kanban, del listado y de la ficha (404), pero no se borra nada —
 * historial de etapas, vendedores, tareas, citas y Activity siguen ahí, y
 * su oferta aceptada sigue ocupada (una por oferta): para recuperarla se
 * restaura, no se crea otra.
 *
 * Qué la bloquea (409, con el motivo), y por qué:
 *  - **Cerrada.** `closeDeal()` ya tuvo efectos fuera de la operación: creó
 *    su apunte en la tabla legacy `deals` («Cierres y comisiones», Ingresos)
 *    y, en una venta de 2ª mano, marcó el inmueble como vendido. Esconderla
 *    dejaría un cierre y una comisión sin la operación que los explica.
 *  - **Con reserva, arras o contrato vinculados.** Son documentos con valor
 *    legal o contable que siguen apuntando a la operación (Reservas,
 *    Depósitos y Contratos enseñan «Operación #…»): apuntarían a algo que
 *    ya no se puede abrir. Se desvinculan antes, a propósito y con su
 *    propio evento. Las arras y los contratos son del área Finanzas: a quien
 *    no puede leerla no se le detallan, sólo se le dice que existen.
 *
 * Activa o cancelada y sin documentos vinculados (lo normal en una
 * operación abierta por error o que no salió) se puede mandar a la papelera.
 */
export async function trashDeal(db: any, orgId: number, dealId: number, actor: ActorOpts, opts: { includeFinance?: boolean } = {}): Promise<DealRow> {
  const deal = await getDealOrThrow(db, orgId, dealId)
  if (deal.status === 'closed') {
    throw createError({ statusCode: 409, statusMessage: 'Una operación cerrada no se manda a la papelera: ya tiene su apunte en «Cierres y comisiones» y forma parte de la historia de la agencia.' })
  }
  const counts = await linkedRecordCounts(db, orgId, dealId)
  if (counts.reservation || counts.deposit || counts.contract) {
    const parts: string[] = []
    if (counts.reservation) parts.push(plural(counts.reservation, 'reserva', 'reservas'))
    if (opts.includeFinance) {
      if (counts.deposit) parts.push(plural(counts.deposit, 'arras / depósito', 'arras / depósitos'))
      if (counts.contract) parts.push(plural(counts.contract, 'contrato', 'contratos'))
    } else if (counts.deposit || counts.contract) {
      parts.push('documentos de Finanzas (arras o contratos) que sólo puede desvincular alguien con acceso a Finanzas')
    }
    throw createError({ statusCode: 409, statusMessage: `Tiene vinculados ${parts.join(' y ')}: desvincúlalos antes en «Reserva, arras y contratos» de su ficha.` })
  }
  const nowTs = now()
  await db
    .update(schema.dealOperations)
    .set({ deletedAt: nowTs, updatedAt: nowTs })
    .where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId), isNull(schema.dealOperations.deletedAt)))
  const updated: DealRow = { ...deal, deletedAt: nowTs, updatedAt: nowTs }
  await recordDealActivity(db, orgId, updated, 'DEAL_TRASHED', actor, { status: deal.status, stage: deal.stage })
  return updated
}

/**
 * Saca la operación de la papelera tal cual estaba (misma etapa, estado,
 * comercial y oficina) y registra DEAL_RESTORED. De otra agencia o
 * inexistente = 404; si no está en la papelera se devuelve sin tocar.
 * Su inmueble no se vuelve a juzgar: aunque esté en la papelera, la
 * operación ya existía (historia, igual que las que siguen avanzando).
 */
export async function restoreDeal(db: any, orgId: number, dealId: number, actor: ActorOpts): Promise<DealRow> {
  const rows = await db
    .select()
    .from(schema.dealOperations)
    .where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId)))
    .limit(1)
  const deal: DealRow | undefined = rows[0]
  if (!deal) throw createError({ statusCode: 404, statusMessage: 'Operación no encontrada' })
  if (!deal.deletedAt) return deal
  const nowTs = now()
  await db
    .update(schema.dealOperations)
    .set({ deletedAt: null, updatedAt: nowTs })
    .where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId)))
  const updated: DealRow = { ...deal, deletedAt: null, updatedAt: nowTs }
  await recordDealActivity(db, orgId, updated, 'DEAL_RESTORED', actor)
  return updated
}

export interface ListDealsFilter {
  propertyId?: number
  propertyKind?: PropertyKind
  buyerContactId?: number
  sellerContactId?: number
  leadId?: number
  commercialId?: number
  officeId?: number
  status?: DealStatus
  stage?: DealStage
  /** Cierre C1: sólo las de la papelera (la vista «Papelera» de Operaciones). Sin él, nunca salen. */
  trashed?: boolean
}

/** Operaciones de la organización (nunca las borradas, salvo que se pida la papelera con `trashed`), más recientes primero. */
export async function listDeals(db: any, orgId: number, filter: ListDealsFilter = {}): Promise<DealRow[]> {
  const conditions = [eq(schema.dealOperations.organizationId, orgId), filter.trashed ? isNotNull(schema.dealOperations.deletedAt) : isNull(schema.dealOperations.deletedAt)]
  if (filter.propertyId) {
    conditions.push(eq(schema.dealOperations.propertyId, filter.propertyId))
    if (filter.propertyKind) conditions.push(eq(schema.dealOperations.propertyKind, filter.propertyKind))
  }
  if (filter.buyerContactId) conditions.push(eq(schema.dealOperations.buyerContactId, filter.buyerContactId))
  if (filter.leadId) conditions.push(eq(schema.dealOperations.leadId, filter.leadId))
  if (filter.commercialId) conditions.push(eq(schema.dealOperations.commercialId, filter.commercialId))
  if (filter.officeId) conditions.push(eq(schema.dealOperations.officeId, filter.officeId))
  if (filter.status) conditions.push(eq(schema.dealOperations.status, filter.status))
  if (filter.stage) conditions.push(eq(schema.dealOperations.stage, filter.stage))

  if (filter.sellerContactId) {
    const sellerRows = await db.select({ dealOperationId: schema.dealOperationSellers.dealOperationId }).from(schema.dealOperationSellers).where(eq(schema.dealOperationSellers.contactId, filter.sellerContactId))
    const dealIds = new Set(sellerRows.map((r: any) => r.dealOperationId))
    if (!dealIds.size) return []
    const rows = await db
      .select()
      .from(schema.dealOperations)
      .where(and(...conditions))
      .orderBy(desc(schema.dealOperations.id))
    return (rows as DealRow[]).filter((r) => dealIds.has(r.id))
  }

  return db
    .select()
    .from(schema.dealOperations)
    .where(and(...conditions))
    .orderBy(desc(schema.dealOperations.id))
}

/** Una operación con los nombres de comprador, inmueble, comercial y oficina ya resueltos (sólo lectura, para el panel). */
export interface DealWithLabels extends DealRow {
  buyerName: string | null
  propertyName: string | null
  commercialName: string | null
  officeName: string | null
}

export async function withDealLabels(db: any, orgId: number, rows: DealRow[]): Promise<DealWithLabels[]> {
  const [buyers, properties, commercials, offices] = await Promise.all([
    contactNames(db, orgId, rows.map((r) => r.buyerContactId)),
    propertyNames(db, orgId, rows.map((r) => ({ id: r.propertyId, kind: r.propertyKind }))),
    teamMemberNames(db, orgId, rows.map((r) => r.commercialId)),
    officeNames(db, orgId, rows.map((r) => r.officeId)),
  ])
  return rows.map((r) => ({
    ...r,
    buyerName: buyers.get(r.buyerContactId) ?? null,
    propertyName: propertyNameOf(properties, r.propertyId, r.propertyKind),
    commercialName: r.commercialId ? (commercials.get(r.commercialId) ?? null) : null,
    officeName: r.officeId ? (offices.get(r.officeId) ?? null) : null,
  }))
}

/**
 * Reservas, arras y contratos vinculados a la operación, y los candidatos a
 * vincular (de esta organización y sin operación). Arras y contratos son del
 * área Finanzas: sólo se leen si quien pregunta puede leerla
 * (`includeFinance`), igual que sus propias pantallas.
 */
async function dealRecords(db: any, orgId: number, dealId: number, includeFinance: boolean) {
  const R = schema.reservations
  const D = schema.depositPayments
  const C = schema.contracts
  const reservationCols = { id: R.id, reference: R.reference, clientName: R.clientName, propertyName: R.propertyName, amount: R.amount, deposit: R.deposit, status: R.status, reservedAt: R.reservedAt, dealOperationId: R.dealOperationId }
  const depositCols = { id: D.id, contractId: D.contractId, amount: D.amount, currency: D.currency, status: D.status, createdAt: D.createdAt, paidAt: D.paidAt, dealOperationId: D.dealOperationId }
  const contractCols = { id: C.id, title: C.title, clientName: C.clientName, status: C.status, createdAt: C.createdAt, acceptedAt: C.acceptedAt, dealOperationId: C.dealOperationId }
  // Lo vinculado se lee entero; los candidatos (sin operación), los 100 más recientes.
  const read = (t: any, cols: any) =>
    Promise.all([
      db.select(cols).from(t).where(and(eq(t.organizationId, orgId), eq(t.dealOperationId, dealId))).orderBy(desc(t.id)),
      db.select(cols).from(t).where(and(eq(t.organizationId, orgId), isNull(t.dealOperationId))).orderBy(desc(t.id)).limit(100),
    ]).then(([linked, candidates]) => ({ linked, candidates }))
  const empty = Promise.resolve({ linked: [], candidates: [] })
  const [reservations, deposits, contracts] = await Promise.all([
    read(R, reservationCols),
    includeFinance ? read(D, depositCols) : empty,
    includeFinance ? read(C, contractCols) : empty,
  ])
  return { reservations, deposits, contracts, financeVisible: includeFinance }
}

/**
 * Ficha de la operación: histórico de etapa (con quién lo movió), vendedores,
 * su próxima acción derivada de sus Tasks/Appointments — sin ningún sistema
 * de seguimiento nuevo (§122), la misma tabla `tasks`/`visits` que ya
 * consume Lead (FASE 22), filtrada por `dealId` — y (bloque N6) la oferta
 * aceptada con su historial, la oficina, y las reservas, arras y contratos
 * vinculados.
 */
export async function getDealDetail(db: any, orgId: number, dealId: number, opts: { includeFinance?: boolean } = {}) {
  const deal = await getDealOrThrow(db, orgId, dealId)

  const liveDealTasks = and(eq(schema.tasks.organizationId, orgId), eq(schema.tasks.dealId, dealId), isNull(schema.tasks.deletedAt))
  const [sellerRows, stageHistory, appointments, tasks, offerRows] = await Promise.all([
    db.select({ contactId: schema.dealOperationSellers.contactId }).from(schema.dealOperationSellers).where(eq(schema.dealOperationSellers.dealOperationId, dealId)),
    db
      .select()
      .from(schema.dealOperationStageHistory)
      .where(and(eq(schema.dealOperationStageHistory.dealOperationId, dealId), eq(schema.dealOperationStageHistory.organizationId, orgId)))
      .orderBy(schema.dealOperationStageHistory.id),
    db
      .select()
      .from(schema.visits)
      // Cierre D3a: sin las citas de la papelera.
      .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.dealId, dealId), isNull(schema.visits.deletedAt)))
      .orderBy(desc(schema.visits.scheduledAt)),
    db.select().from(schema.tasks).where(liveDealTasks).orderBy(desc(schema.tasks.id)),
    db
      .select({ id: schema.offers.id, currentAmount: schema.offers.currentAmount, currency: schema.offers.currency, currentConditions: schema.offers.currentConditions, currentFinanceCondition: schema.offers.currentFinanceCondition, expiration: schema.offers.expiration, status: schema.offers.status })
      .from(schema.offers)
      .where(and(eq(schema.offers.id, deal.acceptedOfferId), eq(schema.offers.organizationId, orgId)))
      .limit(1),
  ])

  const nowTs = now()
  const [nextTask] = await db
    .select({ type: schema.tasks.type, dueAt: schema.tasks.dueAt })
    .from(schema.tasks)
    .where(and(liveDealTasks, ne(schema.tasks.status, 'completed'), ne(schema.tasks.status, 'cancelled'), isNotNull(schema.tasks.dueAt)))
    .orderBy(asc(schema.tasks.dueAt))
    .limit(1)
  const [nextVisit] = await db
    .select({ type: schema.visits.type, scheduledAt: schema.visits.scheduledAt })
    .from(schema.visits)
    .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.dealId, dealId), eq(schema.visits.status, 'scheduled'), gt(schema.visits.scheduledAt, nowTs), isNull(schema.visits.deletedAt)))
    .orderBy(asc(schema.visits.scheduledAt))
    .limit(1)
  let nextAction: { type: string; at: string } | null = null
  if (nextTask && (!nextVisit || nextTask.dueAt <= nextVisit.scheduledAt)) nextAction = { type: `task:${nextTask.type}`, at: nextTask.dueAt }
  else if (nextVisit) nextAction = { type: `appointment:${nextVisit.type}`, at: nextVisit.scheduledAt }

  const sellerContactIds: number[] = sellerRows.map((r: any) => r.contactId)
  const [[labeled], sellerNames, actorNames, records, [creator]] = await Promise.all([
    withDealLabels(db, orgId, [deal]),
    contactNames(db, orgId, sellerContactIds),
    userNames(db, orgId, (stageHistory as any[]).filter((h) => h.actorType === 'user').map((h) => h.actorId)),
    dealRecords(db, orgId, dealId, !!opts.includeFinance),
    // Quién la abrió (cierre D3a): nombre del usuario de la agencia o «usuario eliminado».
    withCreatorNames(db, orgId, [{ createdBy: deal.createdBy }]),
  ])

  return {
    deal: { ...labeled, createdByName: creator.createdByName, createdByDeleted: creator.createdByDeleted },
    sellerContactIds,
    sellers: sellerContactIds.map((id) => ({ id, name: sellerNames.get(id) ?? null })),
    stageHistory: (stageHistory as any[]).map((h) => ({ ...h, actorName: h.actorType === 'user' && h.actorId ? (actorNames.get(h.actorId) ?? null) : null })),
    appointments,
    tasks,
    nextAction,
    acceptedOffer: offerRows[0] ?? null,
    records,
  }
}

/** Para el Kanban: cuántas reservas/arras/contratos tiene vinculados cada operación (troceado: D1 admite 100 parámetros por consulta). */
export async function countDealRecords(db: any, orgId: number, dealIds: number[], includeFinance: boolean): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!dealIds.length) return out
  const tables: any[] = includeFinance ? [schema.reservations, schema.depositPayments, schema.contracts] : [schema.reservations]
  for (const t of tables) {
    const rows = await selectInChunks(dealIds, (part) =>
      db
        .select({ dealOperationId: t.dealOperationId })
        .from(t)
        .where(and(eq(t.organizationId, orgId), inArray(t.dealOperationId, part))),
    )
    for (const r of rows as any[]) out.set(r.dealOperationId, (out.get(r.dealOperationId) || 0) + 1)
  }
  return out
}
