import { and, desc, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { advancePropertyMatches, tablesFor, type PropertyKind } from '../matching/service'
import { assertLiveProperty } from '../properties/trash'
import { contactNames, propertyNameOf, propertyNames, teamMemberNames, userNames } from '../crm/labels'
import { selectInChunks } from '../sqlChunks'
import { OFFER_FINANCE_CONDITIONS, OFFER_OPEN_STATUSES, OFFER_STATUSES } from '../../../utils/pipelineCatalog'

/**
 * OfferService (FASE 23) — el único sitio que crea o transiciona una Offer.
 * "No modificar status/amount directamente desde UI" (§84 del encargo): no
 * hay un PATCH genérico — cada acción real (enviar, contraofertar, aceptar,
 * rechazar, retirar, expirar) es una función con su propia validación de
 * qué transiciones son legales, y cada una escribe una revisión inmutable
 * antes de actualizar la proyección `offers.current*`.
 */

// Los valores válidos (y su etiqueta) viven en el catálogo compartido con el panel.
export { OFFER_STATUSES }
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

/**
 * Normaliza los términos que llegan del panel (bloque N6, FASE 23): la
 * condición de financiación es del catálogo (`OFFER_FINANCE_CONDITIONS`) y
 * la fecha de vencimiento tiene el formato de fecha del proyecto — una fecha
 * sola (`2026-11-30`) vence al final de ese día. `undefined` = no tocar;
 * `null`/'' = vaciar. 422 con un mensaje claro si algo no cuadra: nunca se
 * guarda a medias.
 */
export function normalizeOfferTerms<T extends TermsInput>(terms: T): T {
  const out: T = { ...terms }
  if (out.conditions !== undefined) {
    const v = out.conditions == null ? '' : String(out.conditions).trim()
    if (v.length > 4000) throw createError({ statusCode: 422, statusMessage: 'Las condiciones admiten como máximo 4000 caracteres' })
    out.conditions = v || null
  }
  if (out.financeCondition !== undefined) {
    const v = out.financeCondition == null ? '' : String(out.financeCondition).trim()
    if (v && !(OFFER_FINANCE_CONDITIONS as readonly string[]).includes(v)) throw createError({ statusCode: 422, statusMessage: 'Condición de financiación no válida' })
    out.financeCondition = v || null
  }
  if (out.expiration !== undefined) {
    const v = out.expiration == null ? '' : String(out.expiration).trim().replace('T', ' ')
    if (v && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(v)) throw createError({ statusCode: 422, statusMessage: 'Fecha de vencimiento no válida (usa AAAA-MM-DD)' })
    out.expiration = !v ? null : v.length === 10 ? `${v} 23:59:59` : v.length === 16 ? `${v}:00` : v
  }
  return out
}


async function assertContactExists(db: any, orgId: number, contactId: number, label: string) {
  const rows = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: `${label} no encontrado` })
}

async function inOrg(db: any, table: any, id: number, orgId: number): Promise<boolean> {
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
  return rows.length > 0
}

/** Lead, necesidad, match y comercial de una oferta: si vienen, tienen que ser de esta organización (404 si no). */
async function assertOfferReferences(db: any, orgId: number, input: Pick<CreateOfferInput, 'leadId' | 'buyerRequirementId' | 'matchId' | 'commercialId' | 'propertyKind'>) {
  const missing = (what: string) => createError({ statusCode: 404, statusMessage: `${what} no encontrado en esta organización` })
  if (input.leadId && !(await inOrg(db, schema.leads, input.leadId, orgId))) throw missing('Lead')
  if (input.buyerRequirementId && !(await inOrg(db, schema.buyerRequirements, input.buyerRequirementId, orgId))) throw missing('Necesidad')
  if (input.commercialId && !(await inOrg(db, schema.teamMembers, input.commercialId, orgId))) throw missing('Comercial')
  if (input.matchId && !(await inOrg(db, tablesFor(input.propertyKind).match, input.matchId, orgId))) throw missing('Match')
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
export async function createOffer(db: any, orgId: number, rawInput: CreateOfferInput, opts: { createdBy?: number | null } = {}): Promise<OfferRow> {
  const input = normalizeOfferTerms(rawInput)
  if (!(input.amount > 0)) throw createError({ statusCode: 422, statusMessage: 'El importe debe ser mayor que cero' })
  if (input.propertyKind !== 'agent' && input.propertyKind !== 'developer') throw createError({ statusCode: 422, statusMessage: 'Catálogo de inmueble no válido' })
  // Una oferta nueva necesita una propiedad de esta agencia y fuera de la papelera.
  // Las ofertas que ya existían sobre una propiedad borrada siguen su curso (historia).
  await assertLiveProperty(db, orgId, input.propertyKind, input.propertyId, { action: 'crear una oferta', notFoundMessage: 'Inmueble no encontrado' })
  await assertContactExists(db, orgId, input.buyerContactId, 'Comprador')
  const sellerIds = [...new Set(input.sellerContactIds || [])]
  if (sellerIds.includes(input.buyerContactId)) throw createError({ statusCode: 422, statusMessage: 'El comprador no puede ser también vendedor de su propia oferta' })
  for (const id of sellerIds) await assertContactExists(db, orgId, id, 'Vendedor')
  // Bloque N6: cada referencia opcional también es de esta agencia (404 si no).
  await assertOfferReferences(db, orgId, input)

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
  if (opts.terms) opts = { ...opts, terms: normalizeOfferTerms(opts.terms) }
  if (!(OFFER_ACTOR_TYPES as readonly string[]).includes(opts.actor.actorType)) throw createError({ statusCode: 422, statusMessage: 'Quién hace el movimiento: comprador, vendedor, comercial o sistema' })
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
  await recordOfferActivity(db, orgId, updated, opts.activityEvent, opts.actor, opts.type === 'countered' || opts.type === 'new_offer' ? { amount: terms.amount, by: opts.actor.actorType } : undefined)
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

/**
 * Nueva oferta (bloque N6, FASE 23): la respuesta del comprador a una
 * contraoferta, con sus términos completos (importe, condiciones,
 * financiación, vencimiento). `countered` → `submitted` — la pelota vuelve
 * al vendedor —, y queda como revisión `new_offer` en el historial, distinta
 * de la oferta inicial y de la contraoferta. Nunca sobrescribe nada.
 */
export async function newOffer(db: any, orgId: number, offerId: number, terms: Required<Pick<TermsInput, 'amount'>> & TermsInput, actor: ActorOpts): Promise<OfferRow> {
  return transition(db, orgId, offerId, { from: ['countered'], to: 'submitted', type: 'new_offer', terms, actor, activityEvent: 'OFFER_RESUBMITTED' })
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

/** `open` = negociación viva (borrador, enviada o contraoferta). */
export type OfferStatusFilter = OfferStatus | 'open'

export interface ListOffersFilter {
  propertyId?: number
  propertyKind?: PropertyKind
  buyerContactId?: number
  sellerContactId?: number
  leadId?: number
  commercialId?: number
  status?: OfferStatusFilter
}

export async function listOffers(db: any, orgId: number, filter: ListOffersFilter = {}): Promise<OfferRow[]> {
  const conditions = [eq(schema.offers.organizationId, orgId)]
  if (filter.propertyId) {
    conditions.push(eq(schema.offers.propertyId, filter.propertyId))
    if (filter.propertyKind) conditions.push(eq(schema.offers.propertyKind, filter.propertyKind))
  } else if (filter.propertyKind) {
    conditions.push(eq(schema.offers.propertyKind, filter.propertyKind))
  }
  if (filter.buyerContactId) conditions.push(eq(schema.offers.buyerContactId, filter.buyerContactId))
  if (filter.leadId) conditions.push(eq(schema.offers.leadId, filter.leadId))
  if (filter.commercialId) conditions.push(eq(schema.offers.commercialId, filter.commercialId))
  if (filter.status === 'open') conditions.push(inArray(schema.offers.status, [...OFFER_OPEN_STATUSES]))
  else if (filter.status) conditions.push(eq(schema.offers.status, filter.status))

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

/** Una oferta con los nombres de sus partes ya resueltos (sólo lectura, para el panel). */
export interface OfferWithLabels extends OfferRow {
  buyerName: string | null
  sellerContactIds: number[]
  sellers: { id: number; name: string | null }[]
  propertyName: string | null
  commercialName: string | null
  /** La operación que nació de esta oferta, si ya existe. */
  dealId: number | null
  /** Derivado (`isOfferExpired`): activa pero con el vencimiento ya pasado, aunque el cron horario aún no la haya marcado. */
  isExpired: boolean
}

/**
 * Añade a cada oferta comprador, vendedores, inmueble, comercial y su
 * operación — todo resuelto dentro de la organización (los vendedores se
 * leen por `offer_sellers` de ofertas que ya están acotadas a ella).
 */
export async function withOfferLabels(db: any, orgId: number, rows: OfferRow[]): Promise<OfferWithLabels[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  // Troceado: D1 no admite más de 100 parámetros por consulta y el listado global no pagina.
  const [sellerRows, dealRows]: [any[], any[]] = await Promise.all([
    selectInChunks(ids, (part) => db.select({ offerId: schema.offerSellers.offerId, contactId: schema.offerSellers.contactId }).from(schema.offerSellers).where(inArray(schema.offerSellers.offerId, part))),
    selectInChunks(ids, (part) =>
      db
        .select({ id: schema.dealOperations.id, acceptedOfferId: schema.dealOperations.acceptedOfferId })
        .from(schema.dealOperations)
        .where(and(eq(schema.dealOperations.organizationId, orgId), inArray(schema.dealOperations.acceptedOfferId, part))),
    ),
  ])
  const sellersByOffer = new Map<number, number[]>()
  for (const r of sellerRows) sellersByOffer.set(r.offerId, [...(sellersByOffer.get(r.offerId) || []), r.contactId])
  const dealByOffer = new Map<number, number>(dealRows.map((r: any) => [r.acceptedOfferId, r.id]))

  const [contacts, properties, commercials] = await Promise.all([
    contactNames(db, orgId, [...rows.map((r) => r.buyerContactId), ...sellerRows.map((r: any) => r.contactId)]),
    propertyNames(db, orgId, rows.map((r) => ({ id: r.propertyId, kind: r.propertyKind }))),
    teamMemberNames(db, orgId, rows.map((r) => r.commercialId)),
  ])
  const nowTs = now()
  return rows.map((r) => {
    const sellerIds = sellersByOffer.get(r.id) || []
    return {
      ...r,
      buyerName: contacts.get(r.buyerContactId) ?? null,
      sellerContactIds: sellerIds,
      sellers: sellerIds.map((id) => ({ id, name: contacts.get(id) ?? null })),
      propertyName: propertyNameOf(properties, r.propertyId, r.propertyKind),
      commercialName: r.commercialId ? (commercials.get(r.commercialId) ?? null) : null,
      dealId: dealByOffer.get(r.id) ?? null,
      isExpired: isOfferExpired(r, nowTs),
    }
  })
}

export interface OfferRevisionWithActor extends OfferRevisionRow {
  /** Nombre del usuario del panel que la registró (sólo `actorType: 'user'`). */
  actorName: string | null
}

/**
 * La oferta con su historial completo. Las revisiones salen en orden de
 * inserción (id), que es el orden real en que ocurrieron — dos movimientos en
 * el mismo segundo no se reordenan.
 */
export async function getOfferWithRevisions(db: any, orgId: number, offerId: number): Promise<{ offer: OfferWithLabels; sellerContactIds: number[]; revisions: OfferRevisionWithActor[] }> {
  const offerRow = await getOfferOrThrow(db, orgId, offerId)
  const [[offer], revisionRows] = await Promise.all([
    withOfferLabels(db, orgId, [offerRow]),
    db.select().from(schema.offerRevisions).where(and(eq(schema.offerRevisions.offerId, offerId), eq(schema.offerRevisions.organizationId, orgId))).orderBy(schema.offerRevisions.id),
  ])
  const users = await userNames(db, orgId, (revisionRows as OfferRevisionRow[]).filter((r) => r.actorType === 'user').map((r) => r.actorId))
  const revisions = (revisionRows as OfferRevisionRow[]).map((r) => ({ ...r, actorName: r.actorType === 'user' && r.actorId ? (users.get(r.actorId) ?? null) : null }))
  return { offer, sellerContactIds: offer.sellerContactIds, revisions }
}
