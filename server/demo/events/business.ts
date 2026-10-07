import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { acceptOffer, counterOffer, createOffer, expireOffer, newOffer, rejectOffer, submitOffer, withdrawOffer, type OfferActorType } from '../../utils/offers/service'
import { closeDeal, createDeal, linkDealRecord, transitionDealStage, updateDeal } from '../../utils/deals/service'
import { setPropertyCommercialStatus } from '../../utils/properties/commercialStatus'
import { applyBindings, resolveContractBindings } from '../../utils/contracts/bindings'
import { renderContractPdf } from '../../utils/contracts/pdfRenderer'
import { buildStructuredKey } from '../../utils/media'
import { registerGeneratedFile } from '../../utils/mediaAssets'
import { assertQuotaAvailable } from '../../utils/mediaQuota'
import { now } from '../../utils/db'
import { formatMoney } from '../../../utils/currency'
import { ctxId, ctxSetId, dayAt, type DemoContext } from '../context'
import { actingUser, commercialId, contactId, leadId, officeId, orgId, propertyId, propertyKindOf, requirementId } from '../helpers'
import { CONTRACTS, CONTRACT_TEMPLATES, DEALS, DEPOSITS, INVOICES, OFFERS, RESERVATIONS, type DemoOffer, type OfferStep } from '../dataset/business'
import { COMMERCIALS, DEVELOPERS } from '../dataset/company'
import { CONTACTS } from '../dataset/crm'
import { PROPERTIES } from '../dataset/properties'
import { fromMinutes, toMinutes } from '../moments'
import type { TimelineBuilder } from '../timeline'

/**
 * El negocio en el tiempo, por los mismos servicios que el panel: cada oferta
 * se crea, se envía y se negocia revisión a revisión (OfferService, con quién
 * mueve en cada paso), la aceptada abre su operación (DealService), que pasa
 * de fase con su motivo y se cierra con la comisión de la ficha. Reservas,
 * contratos (generados desde la plantilla, con su PDF de aceptación),
 * depósitos y facturas se registran en su fecha y se vinculan a la operación.
 *
 * Nada sale de la plataforma: no hay envío del contrato por email, ni cobro
 * por Stripe, ni webhooks. La «aceptación» de los contratos aceptados se
 * marca como simulada en el propio registro y en el PDF.
 */

const DEMO_SIGNATURE_IP = 'n/d (firma simulada en la cuenta demo)'
const DEMO_SIGNATURE_AGENT = 'Cuenta de demostración: sin firma real'

const contactName = (key: string) => CONTACTS.find((c) => c.key === key)?.name ?? key
const propertyOf = (key: string) => PROPERTIES.find((p) => p.key === key)!
const clientNameOf = (key: string) => DEVELOPERS.find((d) => d.key === key)?.name ?? contactName(key)

function eur(amount: number) {
  return formatMoney(amount, 'eur')
}

// ---------------------------------------------------------------------------
// Ofertas
// ---------------------------------------------------------------------------

/** Quién mueve en cada paso: la agencia envía, la propiedad contraoferta, el comprador responde y acepta/rechaza quien no movió el último. */
function offerActor(ctx: DemoContext, o: DemoOffer, step: OfferStep, lastMover: 'buyer' | 'seller'): { actorType: OfferActorType; actorId: number | null } {
  switch (step.op) {
    case 'submit':
      return { actorType: 'user', actorId: actingUser(ctx, o.commercial).id }
    case 'counter':
      return { actorType: 'seller', actorId: null }
    case 'new':
    case 'withdraw':
      return { actorType: 'buyer', actorId: null }
    case 'accept':
    case 'reject':
      return { actorType: lastMover === 'buyer' ? 'seller' : 'buyer', actorId: null }
    case 'expire':
      return { actorType: 'system', actorId: null }
  }
}

function moverAfter(step: OfferStep, before: 'buyer' | 'seller'): 'buyer' | 'seller' {
  if (step.op === 'submit' || step.op === 'new') return 'buyer'
  if (step.op === 'counter') return 'seller'
  return before
}

function sellerContacts(ctx: DemoContext, propertyKey: string): number[] {
  return (propertyOf(propertyKey).owners ?? []).filter((o) => o.role !== 'attorney').map((o) => contactId(ctx, o.contact))
}

async function runOfferStep(ctx: DemoContext, o: DemoOffer, step: OfferStep, lastMover: 'buyer' | 'seller') {
  const id = ctxId(ctx, `offer:${o.key}`)
  const actor = offerActor(ctx, o, step, lastMover)
  const org = orgId(ctx)
  switch (step.op) {
    case 'submit':
      await submitOffer(ctx.db, org, id, {}, actor)
      break
    case 'counter':
      await counterOffer(ctx.db, org, id, { amount: step.amount, ...(step.conditions ? { conditions: step.conditions } : {}) }, actor)
      break
    case 'new':
      await newOffer(ctx.db, org, id, { amount: step.amount, ...(step.conditions ? { conditions: step.conditions } : {}) }, actor)
      break
    case 'accept':
      await acceptOffer(ctx.db, org, id, actor)
      await openDealForOffer(ctx, o)
      break
    case 'reject':
      await rejectOffer(ctx.db, org, id, actor)
      break
    case 'withdraw':
      await withdrawOffer(ctx.db, org, id, actor)
      break
    case 'expire':
      await expireOffer(ctx.db, org, id)
      break
  }
}

/** La operación nace de su oferta aceptada (nunca al aceptarla: el comercial la abre justo después), con la oficina del comercial. */
async function openDealForOffer(ctx: DemoContext, o: DemoOffer) {
  const deal = DEALS.find((d) => d.offer === o.key)
  if (!deal) return
  const actor = actingUser(ctx, o.commercial)
  const row = await createDeal(ctx.db, orgId(ctx), { acceptedOfferId: ctxId(ctx, `offer:${o.key}`) }, { createdBy: actor.id })
  ctxSetId(ctx, `deal:${deal.key}`, row.id)
  const commercial = COMMERCIALS.find((c) => c.key === o.commercial)!
  await updateDeal(ctx.db, orgId(ctx), row.id, { officeId: officeId(ctx, commercial.office) })
}

function addOfferEvents(tl: TimelineBuilder) {
  for (const o of OFFERS) {
    tl.add(o.days, o.at, `Oferta ${o.key}`, async (ctx) => {
      const actor = actingUser(ctx, o.commercial)
      const offer = await createOffer(
        ctx.db,
        orgId(ctx),
        {
          propertyId: propertyId(ctx, o.property),
          propertyKind: propertyKindOf(o.property),
          buyerContactId: contactId(ctx, o.buyer),
          sellerContactIds: sellerContacts(ctx, o.property),
          leadId: leadId(ctx, o.lead),
          buyerRequirementId: o.requirement ? requirementId(ctx, o.requirement) : null,
          commercialId: commercialId(ctx, o.commercial),
          amount: o.amount,
          currency: 'eur',
          conditions: o.conditions ?? null,
          financeCondition: o.financeCondition ?? null,
          expiration: o.expirationDays != null ? dayAt(ctx.state.anchorDay!, o.expirationDays) : null,
        },
        { createdBy: actor.id },
      )
      ctxSetId(ctx, `offer:${o.key}`, offer.id)
    })
    let mover: 'buyer' | 'seller' = 'buyer'
    for (const step of o.steps) {
      const before = mover
      tl.add(step.days, step.at, `Oferta ${o.key}: ${step.op}`, (ctx) => runOfferStep(ctx, o, step, before))
      mover = moverAfter(step, mover)
    }
  }
}

// ---------------------------------------------------------------------------
// Operaciones, reservas, contratos y depósitos
// ---------------------------------------------------------------------------

function dealOffer(dealKey: string): DemoOffer {
  const deal = DEALS.find((d) => d.key === dealKey)!
  return OFFERS.find((o) => o.key === deal.offer)!
}

/** El estado comercial de la ficha al reservar: sólo cuando la propiedad entera queda comprometida (no una promoción con más unidades). */
async function markReserved(ctx: DemoContext, propertyKey: string, actorId: number) {
  const p = propertyOf(propertyKey)
  if (p.commercialStatus === 'available') return
  await setPropertyCommercialStatus(ctx.db, orgId(ctx), p.kind, { id: propertyId(ctx, p.key) }, 'reserved', actorId)
}

function addDealEvents(tl: TimelineBuilder) {
  for (const d of DEALS) {
    const o = dealOffer(d.key)
    for (const s of d.stages) {
      tl.add(s.days, s.at, `Operación ${d.key}: ${s.stage}`, async (ctx) => {
        const actor = actingUser(ctx, o.commercial)
        await transitionDealStage(ctx.db, orgId(ctx), ctxId(ctx, `deal:${d.key}`), s.stage, { actorType: 'user', actorId: actor.id, reason: s.reason })
      })
    }
    if (d.close) {
      tl.add(d.close.days, d.close.at, `Cierre ${d.key}`, async (ctx) => {
        const actor = actingUser(ctx, o.commercial)
        const p = propertyOf(o.property)
        await closeDeal(ctx.db, orgId(ctx), ctxId(ctx, `deal:${d.key}`), { actorType: 'user', actorId: actor.id, reason: p.transactionType === 'rent' ? 'Contrato firmado y llaves entregadas' : 'Escritura firmada ante notario' })
        // El cierre ya pasa una venta de 2ª mano a «Vendida»; un alquiler no
        // tiene disponibilidad que lo diga, así que se indica a mano, como en la ficha.
        if (p.transactionType === 'rent') await setPropertyCommercialStatus(ctx.db, orgId(ctx), p.kind, { id: propertyId(ctx, p.key) }, 'rented', actor.id)
        const reservation = RESERVATIONS.find((r) => r.deal === d.key)
        if (reservation) await ctx.db.update(schema.reservations).set({ status: 'completed' }).where(eq(schema.reservations.id, ctxId(ctx, `reservation:${reservation.key}`)))
      })
    }
  }

  for (const r of RESERVATIONS) {
    tl.add(r.days, r.at, `Reserva ${r.key}`, async (ctx) => {
      const o = r.deal ? dealOffer(r.deal) : null
      const propertyKey = o ? o.property : (r as { property: string }).property
      const p = propertyOf(propertyKey)
      const actor = actingUser(ctx, p.commercial)
      const nowTs = now()
      const [row] = await ctx.db
        .insert(schema.reservations)
        .values({
          organizationId: orgId(ctx),
          reference: r.reference,
          clientName: o ? contactName(o.buyer) : (r as { clientName: string }).clientName,
          propertyId: propertyId(ctx, p.key),
          propertyName: p.title,
          amount: r.amount,
          deposit: r.deposit,
          // Una reserva anulada empezó pendiente: se anula después, en su fecha.
          status: r.status === 'completed' ? 'confirmed' : r.status === 'cancelled' ? 'pending' : r.status,
          reservedAt: nowTs,
          createdAt: nowTs,
        })
        .returning()
      ctxSetId(ctx, `reservation:${r.key}`, row.id)
      if (r.deal) await linkDealRecord(ctx.db, orgId(ctx), ctxId(ctx, `deal:${r.deal}`), 'reservation', row.id, { actorType: 'user', actorId: actor.id })
      await markReserved(ctx, p.key, actor.id)
      if (r.status === 'cancelled') await setPropertyCommercialStatus(ctx.db, orgId(ctx), p.kind, { id: propertyId(ctx, p.key) }, 'reserved', actor.id)
    })
  }

  // Héctor retira su oferta: la reserva se anula y la casa vuelve a estar disponible.
  const cancelled = RESERVATIONS.find((r) => r.status === 'cancelled')
  const withdrawn = cancelled ? OFFERS.find((o) => o.property === (cancelled as { property?: string }).property && o.steps.some((s) => s.op === 'withdraw')) : undefined
  const withdrawStep = withdrawn?.steps.find((s) => s.op === 'withdraw')
  if (cancelled && withdrawn && withdrawStep) {
    tl.add(withdrawStep.days, '10:20', `Anulación ${cancelled.key}`, async (ctx) => {
      const p = propertyOf(withdrawn.property)
      await ctx.db.update(schema.reservations).set({ status: 'cancelled' }).where(eq(schema.reservations.id, ctxId(ctx, `reservation:${cancelled.key}`)))
      await setPropertyCommercialStatus(ctx.db, orgId(ctx), p.kind, { id: propertyId(ctx, p.key) }, 'available', actingUser(ctx, p.commercial).id)
    })
  }

  tl.add(-175, '09:30', 'Plantillas de contrato', async (ctx) => {
    for (const t of CONTRACT_TEMPLATES) {
      const nowTs = now()
      const [row] = await ctx.db
        .insert(schema.contractTemplates)
        .values({ organizationId: orgId(ctx), name: t.name, type: t.type, bodyTemplate: CONTRACT_BODIES[t.type], createdAt: nowTs, updatedAt: nowTs })
        .returning()
      ctxSetId(ctx, `ctemplate:${t.key}`, row.id)
    }
  })

  for (const k of CONTRACTS) {
    tl.add(k.days, k.at, `Contrato ${k.key}`, async (ctx) => {
      const p = propertyOf(k.property)
      const o = dealOffer(k.deal)
      const actor = actingUser(ctx, p.commercial)
      const template = (await ctx.db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.id, ctxId(ctx, `ctemplate:${k.template}`))).limit(1))[0]
      const contact = CONTACTS.find((c) => c.key === k.contact)!
      const reservation = RESERVATIONS.find((r) => r.deal === k.deal)
      const agreed = o.steps.filter((s) => s.op === 'counter' || s.op === 'new').map((s) => (s as { amount: number }).amount).pop() ?? o.amount
      const asset = p.kind === 'developer' ? { assetKind: 'property', assetId: propertyId(ctx, p.key) } : { assetKind: null, assetId: null }
      const bindings = await resolveContractBindings(ctx.event, orgId(ctx), {
        clientName: contact.name,
        clientEmail: contact.email ?? null,
        ...asset,
        variables: {
          'property.name': p.title,
          'property.address': `${p.street}, ${p.city}`,
          importe: eur(agreed),
          senal: eur(reservation?.deposit ?? 0),
          arras: eur(Math.round(agreed * 0.1)),
          renta: eur(p.price),
          fianza: eur(Number(p.legal.rentDeposit ?? p.price)),
        },
      })
      const nowTs = now()
      const [contract] = await ctx.db
        .insert(schema.contracts)
        .values({
          organizationId: orgId(ctx),
          templateId: template.id,
          title: k.title,
          assetKind: asset.assetKind,
          assetId: asset.assetId,
          clientName: contact.name,
          clientEmail: contact.email ?? null,
          bodyText: applyBindings(template.bodyTemplate, bindings),
          status: 'draft',
          createdBy: actor.id,
          createdAt: nowTs,
          updatedAt: nowTs,
        })
        .returning()
      ctxSetId(ctx, `contract:${k.key}`, contract.id)
      await linkDealRecord(ctx.db, orgId(ctx), ctxId(ctx, `deal:${k.deal}`), 'contract', contract.id, { actorType: 'user', actorId: actor.id })
      if (k.status === 'draft') return
      // «Enviado» sin email: en la demo el enlace de aceptación no sale de la plataforma.
      await ctx.db.update(schema.contracts).set({ status: 'sent', managementToken: randomToken(), updatedAt: now() }).where(eq(schema.contracts.id, contract.id))
      if (k.status === 'accepted') await acceptDemoContract(ctx, contract.id, contact.name)
    })
  }

  for (const dp of DEPOSITS) {
    tl.add(dp.days, dp.at, `Depósito ${dp.key}`, async (ctx) => {
      const p = propertyOf(CONTRACTS.find((k) => k.key === dp.contract)!.property)
      const nowTs = now()
      const [row] = await ctx.db
        .insert(schema.depositPayments)
        .values({ organizationId: orgId(ctx), contractId: ctxId(ctx, `contract:${dp.contract}`), amount: dp.amount, currency: 'eur', status: dp.status, createdAt: nowTs, paidAt: dp.status === 'paid' ? nowTs : null })
        .returning()
      ctxSetId(ctx, `deposit:${dp.key}`, row.id)
      await linkDealRecord(ctx.db, orgId(ctx), ctxId(ctx, `deal:${dp.deal}`), 'deposit', row.id, { actorType: 'user', actorId: actingUser(ctx, p.commercial).id })
    })
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Como la aceptación pública (contracts/[token]/accept), pero marcada como simulada: PDF confidencial, sin webhook ni aviso por email. */
async function acceptDemoContract(ctx: DemoContext, contractId: number, byName: string) {
  const contract = (await ctx.db.select().from(schema.contracts).where(eq(schema.contracts.id, contractId)).limit(1))[0]
  const acceptedAt = now()
  const pdfBytes = await renderContractPdf({ title: contract.title, bodyText: contract.bodyText, clientName: contract.clientName, acceptance: { byName, ip: DEMO_SIGNATURE_IP, userAgent: DEMO_SIGNATURE_AGENT, at: acceptedAt } })
  await assertQuotaAvailable(ctx.db, orgId(ctx), pdfBytes.byteLength)
  const r2Key = buildStructuredKey(orgId(ctx), 'contract', 'pdf')
  await ctx.env.MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })
  await registerGeneratedFile(ctx.db, { organizationId: orgId(ctx), r2Key, bytes: pdfBytes, mimeType: 'application/pdf', extension: 'pdf', visibility: 'confidential', category: 'contract', entityType: 'contracts', entityId: contractId })
  await ctx.db
    .update(schema.contracts)
    .set({ status: 'accepted', acceptedByName: byName, acceptedIp: DEMO_SIGNATURE_IP, acceptedUserAgent: DEMO_SIGNATURE_AGENT, acceptedAt, r2Key, updatedAt: acceptedAt })
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.status, 'sent')))
}

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

const VAT = 0.21

/** Cuándo se emite una factura: su día, o media hora después del cierre de su operación (los honorarios se facturan al cerrar). */
function issueMoment(f: (typeof INVOICES)[number]) {
  const closed = 'fromDeal' in f ? DEALS.find((d) => d.key === f.fromDeal)?.close : undefined
  return fromMinutes(Math.max(toMinutes(f.issuedDays, '10:00'), closed ? toMinutes(closed.days, closed.at) + 30 : -Infinity))
}

const dayOfYear = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${day.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1

/**
 * Número de factura correlativo por fecha de emisión, en una serie por año
 * (`NA-2026-0021`), como exige la facturación: como la historia se ancla al día
 * en que se siembra, el número no puede ir fijo en el dataset. El primer año
 * arranca donde iría la serie a esas alturas (unas tres facturas al mes desde
 * enero); si la historia cruza de año, la serie nueva empieza en 1.
 */
export function invoiceNumber(anchorDay: string, key: string): string {
  const ordered = INVOICES.map((f) => ({ key: f.key, at: issueMoment(f) })).sort((a, b) => toMinutes(a.at.days, a.at.at) - toMinutes(b.at.days, b.at.at))
  let year = ''
  let seq = 0
  for (const { key: k, at } of ordered) {
    const day = dayAt(anchorDay, at.days)
    if (day.slice(0, 4) !== year) {
      seq = year === '' ? Math.floor((dayOfYear(day) - 1) / 10) : 0
      year = day.slice(0, 4)
    }
    seq++
    if (k === key) return `NA-${year}-${String(seq).padStart(4, '0')}`
  }
  throw new Error(`Demo: factura desconocida ${key}`)
}

function addInvoiceEvents(tl: TimelineBuilder) {
  for (const f of INVOICES) {
    const issued = issueMoment(f)
    tl.add(issued.days, issued.at, `Factura ${f.key}`, async (ctx) => {
      let amount = 'amount' in f ? f.amount : 0
      const fromDeal = 'fromDeal' in f ? f.fromDeal : null
      if (fromDeal) {
        // Los honorarios de una operación cerrada: la comisión de su cierre (ficha × importe).
        const [deal] = await ctx.db.select({ legacyDealId: schema.dealOperations.legacyDealId }).from(schema.dealOperations).where(eq(schema.dealOperations.id, ctxId(ctx, `deal:${fromDeal}`))).limit(1)
        const [legacy] = await ctx.db.select({ commissionAmount: schema.deals.commissionAmount }).from(schema.deals).where(eq(schema.deals.id, Number(deal?.legacyDealId))).limit(1)
        amount = Number(legacy?.commissionAmount) || 0
      }
      const nowTs = now()
      const [row] = await ctx.db
        .insert(schema.invoices)
        .values({
          organizationId: orgId(ctx),
          number: invoiceNumber(ctx.state.anchorDay!, f.key),
          clientName: clientNameOf(f.client),
          concept: f.concept,
          amount,
          tax: Math.round(amount * VAT * 100) / 100,
          status: f.status === 'draft' ? 'draft' : 'pending',
          issuedAt: dayAt(ctx.state.anchorDay!, issued.days),
          dueAt: dayAt(ctx.state.anchorDay!, f.dueDays),
          createdAt: nowTs,
        })
        .returning()
      ctxSetId(ctx, `invoice:${f.key}`, row.id)
    })
    if (f.status === 'paid' && 'paidDays' in f) {
      tl.add(f.paidDays, '11:15', `Cobro ${f.key}`, async (ctx) => {
        await ctx.db.update(schema.invoices).set({ status: 'paid', paidAt: dayAt(ctx.state.anchorDay!, f.paidDays) }).where(eq(schema.invoices.id, ctxId(ctx, `invoice:${f.key}`)))
        const fromDeal = 'fromDeal' in f ? f.fromDeal : null
        if (fromDeal) {
          // Cobrada la factura, la comisión del cierre queda pagada (lo mismo que «Marcar pagada» en Operaciones).
          const [deal] = await ctx.db.select({ legacyDealId: schema.dealOperations.legacyDealId }).from(schema.dealOperations).where(eq(schema.dealOperations.id, ctxId(ctx, `deal:${fromDeal}`))).limit(1)
          if (deal?.legacyDealId) await ctx.db.update(schema.deals).set({ commissionPaid: 1, paidAt: now() }).where(eq(schema.deals.id, deal.legacyDealId))
        }
      })
    }
    if (f.status === 'overdue') {
      tl.add(f.dueDays + 1, '08:00', `Vencida ${f.key}`, async (ctx) => {
        await ctx.db.update(schema.invoices).set({ status: 'overdue' }).where(eq(schema.invoices.id, ctxId(ctx, `invoice:${f.key}`)))
      })
    }
  }
}

export function addBusinessEvents(tl: TimelineBuilder): void {
  addOfferEvents(tl)
  addDealEvents(tl)
  addInvoiceEvents(tl)
}

// ---------------------------------------------------------------------------
// Texto de las plantillas (claramente de demostración)
// ---------------------------------------------------------------------------

const DEMO_NOTICE = 'DOCUMENTO DE DEMOSTRACIÓN — generado en una cuenta demo con datos ficticios. No tiene validez legal ni se ha firmado.'

const CONTRACT_BODIES: Record<string, string> = {
  reserva: `${DEMO_NOTICE}

CONTRATO DE RESERVA

En {{property.address}}, a {{contract.date}}.

De una parte, {{client.name}} (en adelante, la parte compradora). De otra, {{org.name}}, en nombre de la propiedad del inmueble.

PRIMERA. Objeto. La parte compradora reserva el inmueble «{{property.name}}» por un precio de {{importe}}.

SEGUNDA. Señal. La parte compradora entrega {{senal}} en concepto de señal, que se descontará del precio en la firma de las arras.

TERCERA. Plazo. Las partes se comprometen a firmar el contrato de arras en un plazo máximo de 15 días.

CUARTA. Desistimiento. Si la parte compradora desiste, perderá la señal entregada; si desiste la propiedad, la devolverá duplicada.`,
  arras: `${DEMO_NOTICE}

CONTRATO DE ARRAS PENITENCIALES (art. 1454 del Código Civil)

En {{property.address}}, a {{contract.date}}.

Reunidos {{client.name}} (parte compradora) y la propiedad del inmueble «{{property.name}}», con la intermediación de {{org.name}}.

PRIMERA. Precio. La compraventa se pacta en {{importe}}.

SEGUNDA. Arras. La parte compradora entrega {{arras}} en concepto de arras penitenciales, a cuenta del precio.

TERCERA. Escritura. La escritura pública se otorgará ante el notario que designe la parte compradora en el plazo pactado.

CUARTA. Desistimiento. Si desiste la parte compradora, pierde las arras; si desiste la vendedora, las devolverá duplicadas.`,
  alquiler: `${DEMO_NOTICE}

CONTRATO DE ARRENDAMIENTO DE VIVIENDA

En {{property.address}}, a {{contract.date}}.

Arrendataria: {{client.name}}. Arrendadora: la propiedad de «{{property.name}}», representada por {{org.name}}.

PRIMERA. Renta. {{renta}} mensuales, pagaderas en los cinco primeros días de cada mes.

SEGUNDA. Duración. Un año, prorrogable conforme a la Ley de Arrendamientos Urbanos.

TERCERA. Fianza. {{fianza}}, equivalente a una mensualidad.

CUARTA. Estado. La vivienda se entrega amueblada y en buen estado, según el inventario anexo.`,
  compraventa: `${DEMO_NOTICE}

CONTRATO PRIVADO DE COMPRAVENTA (BORRADOR)

En {{property.address}}, a {{contract.date}}.

Parte compradora: {{client.name}}. Parte vendedora: la promotora de «{{property.name}}», con la intermediación de {{org.name}}.

PRIMERA. Objeto y precio. La vivienda «{{property.name}}» por {{importe}}, IVA no incluido.

SEGUNDA. Pagos a cuenta. Las cantidades entregadas a cuenta se garantizan conforme a la normativa de vivienda en construcción.

TERCERA. Entrega. A la obtención de la licencia de primera ocupación.`,
}
