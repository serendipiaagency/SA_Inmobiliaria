import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { advancePropertyMatches, type PropertyKind } from '../matching/service'

/**
 * OfferService (FASE 23) — el único sitio que crea o transiciona una Offer.
 * "No modificar status/amount directamente desde UI" (§84 del encargo): no
 * hay un PATCH genérico — cada acción real (enviar, contraofertar, aceptar,
 * rechazar, retirar, expirar) es una función con su propia validación de
 * qué transiciones son legales, y cada una escribe una revisión inmutable
 * antes de actualizar la proyección `offers.current*`.
 */

export const OFFER_STATUSES = ['draft', 'submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export const OFFER_ACTOR_TYPES = ['buyer', 'seller', 'user', 'system'] as const
export type OfferActorType = (typeof OFFER_ACTOR_TYPES)[number]

export interface OfferRow {
  id: number
  organizationId: number
  propertyId: number
  propertyKind: string
  buyerContactId: number
  leadId: number | null
  buyerRequirementId: number | null
  matchId: number | null
  commercialId: number | null
  currentAmount: number
  currency: string
  currentConditions: string | null
  currentFinanceCondition: string | null
  expiration: string | null
  status: string
  currentRevisionId: number | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

export interface OfferRevisionRow {
  id: number
  offerId: number
  type: string
  amount: number
  currency: string
  conditions: string | null
  financeCondition: string | null
  expiration: string | null
  actorType: string
  actorId: number | null
  createdAt: string
}

interface ActorOpts {
  actorType: OfferActorType
  actorId?: number | null
}

interface TermsInput {
  amount?: number
  conditions?: string | null
  financeCondition?: string | null
  expiration?: string | null
}

async function assertPropertyExists(db: any, orgId: number, propertyId: number, propertyKind: PropertyKind) {
  const table = propertyKind === 'agent' ? schema.agentProperties : schema.developerProperties
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, propertyId), eq(table.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })
}

async function assertContactExists(db: any, orgId: number, contactId: number, label: string) {
  const rows = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: `${label} no encontrado` })
}

async function insertRevision(db: any, orgId: number, offerId: number, type: string, terms: { amount: number; currency: string; conditions: string | null; financeCondition: string | null; expiration: string | null }, actor: ActorOpts) {
  const [revision] = await db
    .insert(schema.offerRevisions)
    .values({
      organizationId: orgId,
      offerId,
      type,
      amount: terms.amount,
      currency: terms.currency,
      conditions: terms.conditions,
      financeCondition: terms.financeCondition,
      expiration: terms.expiration,
      actorType: actor.actorType,
      actorId: actor.actorId ?? null,
      createdAt: now(),
    })
    .returning()
  return revision as OfferRevisionRow
}

async function getOfferOrThrow(db: any, orgId: number, offerId: number): Promise<OfferRow> {
  const rows = await db.select().from(schema.offers).where(and(eq(schema.offers.id, offerId), eq(schema.offers.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Oferta no encontrada' })
  return rows[0]
}

async function recordOfferActivity(db: any, orgId: number, offer: OfferRow, eventType: string, actor: ActorOpts, metadata?: Record<string, unknown>) {
  await recordActivity(db, orgId, {
    eventType: eventType as any,
    entityType: 'offer',
    entityId: offer.id,
    contactId: offer.buyerContactId,
    leadId: offer.leadId,
    propertyId: offer.propertyId,
    propertyKind: offer.propertyKind as PropertyKind,
    actorType: actor.actorType === 'buyer' || actor.actorType === 'seller' ? 'contact' : actor.actorType,
    actorId: actor.actorId ?? null,
    metadata,
  })
}

export interface CreateOfferInput {
  propertyId: number
  propertyKind: PropertyKind
  buyerContactId: number
  sellerContactIds?: number[]
  leadId?: number | null
  buyerRequirementId?: number | null
  matchId?: number | null
  commercialId?: number | null
  amount: number
  currency?: string
  conditions?: string | null
  financeCondition?: string | null
  expiration?: string | null
}

/** Crea una Offer en borrador (`draft`), con su primera revisión ("created"). */
export async function createOffer(db: any, orgId: number, input: CreateOfferInput, opts: { createdBy?: number | null } = {}): Promise<OfferRow> {
  if (!(input.amount > 0)) throw createError({ statusCode: 422, statusMessage: 'El importe debe ser mayor que cero' })
  await assertPropertyExists(db, orgId, input.propertyId, input.propertyKind)
  await assertContactExists(db, orgId, input.buyerContactId, 'Comprador')
  const sellerIds = [...new Set(input.sellerContactIds || [])]
  for (const id of sellerIds) await assertContactExists(db, orgId, id, 'Vendedor')

  const nowTs = now()
  const currency = input.currency || 'eur'
  const [offer] = await db
    .insert(schema.offers)
    .values({
      organizationId: orgId,
      propertyId: input.propertyId,
      propertyKind: input.propertyKind,
      buyerContactId: input.buyerContactId,
      leadId: input.leadId ?? null,
      buyerRequirementId: input.buyerRequirementId ?? null,
      matchId: input.matchId ?? null,
      commercialId: input.commercialId ?? null,
      currentAmount: input.amount,
      currency,
      currentConditions: input.conditions ?? null,
      currentFinanceCondition: input.financeCondition ?? null,
      expiration: input.expiration ?? null,
      status: 'draft',
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  if (sellerIds.length) {
    await db.insert(schema.offerSellers).values(sellerIds.map((contactId) => ({ offerId: offer.id, contactId, createdAt: nowTs })))
  }

  const revision = await insertRevision(
    db,
    orgId,
    offer.id,
    'created',
    { amount: input.amount, currency, conditions: input.conditions ?? null, financeCondition: input.financeCondition ?? null, expiration: input.expiration ?? null },
    { actorType: 'user', actorId: opts.createdBy ?? null },
  )
  await db.update(schema.offers).set({ currentRevisionId: revision.id }).where(eq(schema.offers.id, offer.id))

  const final: OfferRow = { ...offer, currentRevisionId: revision.id }
  await recordOfferActivity(db, orgId, final, 'OFFER_CREATED', { actorType: 'user', actorId: opts.createdBy ?? null })
  // El PropertyMatch del comprador con este inmueble pasa a «ofertado».
  await advancePropertyMatches(db, orgId, { contactId: input.buyerContactId, buyerRequirementId: input.buyerRequirementId ?? null, propertyId: input.propertyId, propertyKind: input.propertyKind, to: 'offered' })
  return final
}

async function transition(db: any, orgId: number, offerId: number, opts: { from: OfferStatus[]; to: OfferStatus; type: string; terms?: TermsInput; actor: ActorOpts; expectedRevisionId?: number; activityEvent: string }): Promise<OfferRow> {
  const offer = await getOfferOrThrow(db, orgId, offerId)
  if (!(opts.from as string[]).includes(offer.status)) {
    throw createError({ statusCode: 422, statusMessage: `No se puede pasar de "${offer.status}" a "${opts.to}"` })
  }
  if (opts.expectedRevisionId !== undefined && offer.currentRevisionId !== opts.expectedRevisionId) {
    // §85: evita aceptar una revisión antigua si mientras tanto llegó una contraoferta posterior.
    throw createError({ statusCode: 409, statusMessage: 'Esta oferta cambió mientras tanto — revisa el importe actual antes de continuar.' })
  }

  const terms = {
    amount: opts.terms?.amount ?? offer.currentAmount,
    currency: offer.currency,
    conditions: opts.terms?.conditions !== undefined ? opts.terms.conditions : offer.currentConditions,
    financeCondition: opts.terms?.financeCondition !== undefined ? opts.terms.financeCondition : offer.currentFinanceCondition,
    expiration: opts.terms?.expiration !== undefined ? opts.terms.expiration : offer.expiration,
  }
  if (!(terms.amount > 0)) throw createError({ statusCode: 422, statusMessage: 'El importe debe ser mayor que cero' })

  const revision = await insertRevision(db, orgId, offerId, opts.type, terms, opts.actor)
  const nowTs = now()
  await db
    .update(schema.offers)
    .set({ status: opts.to, currentAmount: terms.amount, currentConditions: terms.conditions, currentFinanceCondition: terms.financeCondition, expiration: terms.expiration, currentRevisionId: revision.id, updatedAt: nowTs })
    .where(eq(schema.offers.id, offerId))

  const updated: OfferRow = { ...offer, status: opts.to, currentAmount: terms.amount, currentConditions: terms.conditions, currentFinanceCondition: terms.financeCondition, expiration: terms.expiration, currentRevisionId: revision.id, updatedAt: nowTs }
  await recordOfferActivity(db, orgId, updated, opts.activityEvent, opts.actor, opts.type === 'countered' ? { amount: terms.amount } : undefined)
  return updated
}

/** `draft` → `submitted`. Permite ajustar los términos antes del primer envío formal. */
export async function submitOffer(db: any, orgId: number, offerId: number, terms: TermsInput, actor: ActorOpts): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['draft'], to: 'submitted', type: 'submitted', terms, actor, activityEvent: 'OFFER_SUBMITTED' })
}

/** `submitted`/`countered` → `countered`, con un importe nuevo — nunca sobrescribe el anterior, queda en `offer_revisions`. */
export async function counterOffer(db: any, orgId: number, offerId: number, terms: Required<Pick<TermsInput, 'amount'>> & TermsInput, actor: ActorOpts): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['submitted', 'countered'], to: 'countered', type: 'countered', terms, actor, activityEvent: 'OFFER_COUNTERED' })
}

/** `submitted`/`countered` → `accepted`, sobre los términos ACTUALES — `expectedRevisionId` evita aceptar una revisión que ya quedó obsoleta por una contraoferta más reciente (§85). */
export async function acceptOffer(db: any, orgId: number, offerId: number, actor: ActorOpts, expectedRevisionId?: number): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['submitted', 'countered'], to: 'accepted', type: 'accepted', actor, expectedRevisionId, activityEvent: 'OFFER_ACCEPTED' })
}

/** `submitted`/`countered` → `rejected`. */
export async function rejectOffer(db: any, orgId: number, offerId: number, actor: ActorOpts): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['submitted', 'countered'], to: 'rejected', type: 'rejected', actor, activityEvent: 'OFFER_REJECTED' })
}

/** `draft`/`submitted`/`countered` → `withdrawn`. */
export async function withdrawOffer(db: any, orgId: number, offerId: number, actor: ActorOpts): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['draft', 'submitted', 'countered'], to: 'withdrawn', type: 'withdrawn', actor, activityEvent: 'OFFER_WITHDRAWN' })
}

/** `submitted`/`countered` con `expiration` ya pasada → `expired`. La llama el cron horario `offers:expire` — nunca la UI. */
export async function expireOffer(db: any, orgId: number, offerId: number): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['submitted', 'countered'], to: 'expired', type: 'expired', actor: { actorType: 'system' }, activityEvent: 'OFFER_EXPIRED' })
}

/** Derivado, nunca guardado: una oferta activa cuya fecha de expiración ya pasó, aunque el cron horario todavía no la haya marcado. */
export function isOfferExpired(offer: Pick<OfferRow, 'status' | 'expiration'>, nowTs: string = now()): boolean {
  return (offer.status === 'submitted' || offer.status === 'countered') && !!offer.expiration && offer.expiration < nowTs
}

export interface ListOffersFilter {
  propertyId?: number
  propertyKind?: PropertyKind
  buyerContactId?: number
  sellerContactId?: number
  leadId?: number
  commercialId?: number
  status?: OfferStatus
}

export async function listOffers(db: any, orgId: number, filter: ListOffersFilter = {}): Promise<OfferRow[]> {
  const conditions = [eq(schema.offers.organizationId, orgId)]
  if (filter.propertyId) {
    conditions.push(eq(schema.offers.propertyId, filter.propertyId))
    if (filter.propertyKind) conditions.push(eq(schema.offers.propertyKind, filter.propertyKind))
  }
  if (filter.buyerContactId) conditions.push(eq(schema.offers.buyerContactId, filter.buyerContactId))
  if (filter.leadId) conditions.push(eq(schema.offers.leadId, filter.leadId))
  if (filter.commercialId) conditions.push(eq(schema.offers.commercialId, filter.commercialId))
  if (filter.status) conditions.push(eq(schema.offers.status, filter.status))

  if (filter.sellerContactId) {
    const sellerRows = await db.select({ offerId: schema.offerSellers.offerId }).from(schema.offerSellers).where(eq(schema.offerSellers.contactId, filter.sellerContactId))
    const offerIds = new Set(sellerRows.map((r: any) => r.offerId))
    if (!offerIds.size) return []
    const rows = await db
      .select()
      .from(schema.offers)
      .where(and(...conditions))
      .orderBy(desc(schema.offers.id))
    return (rows as OfferRow[]).filter((r) => offerIds.has(r.id))
  }

  return db
    .select()
    .from(schema.offers)
    .where(and(...conditions))
    .orderBy(desc(schema.offers.id))
}

/** El offerId ya viene acotado a la organización por quien llama (getOfferWithRevisions/listOffersWithSellers). */
export async function getOfferSellers(db: any, offerId: number): Promise<number[]> {
  const rows = await db.select({ contactId: schema.offerSellers.contactId }).from(schema.offerSellers).where(eq(schema.offerSellers.offerId, offerId))
  return rows.map((r: any) => r.contactId)
}

export async function getOfferWithRevisions(db: any, orgId: number, offerId: number): Promise<{ offer: OfferRow; sellerContactIds: number[]; revisions: OfferRevisionRow[] }> {
  const offer = await getOfferOrThrow(db, orgId, offerId)
  const [sellerContactIds, revisions] = await Promise.all([
    getOfferSellers(db, offerId),
    db.select().from(schema.offerRevisions).where(eq(schema.offerRevisions.offerId, offerId)).orderBy(schema.offerRevisions.createdAt),
  ])
  return { offer, sellerContactIds, revisions }
}
