import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { adminResources } from '../../utils/adminResources'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { createContactFromAdmin, syncContactRoles } from '../../utils/contacts/crm'
import { updateContact } from '../../utils/contacts/service'
import { upsertLead } from '../../utils/leads'
import { createLeadFromAdmin } from '../../utils/leads/admin'
import { markLeadContacted } from '../../utils/leads/sla'
import { setLeadOutcome, transitionLeadStage } from '../../utils/leads/pipeline'
import { createBuyerRequirement, validateBudget } from '../../utils/buyerRequirements/service'
import { findPropertiesForRequirement, markMatchSent, setMatchStatus } from '../../utils/matching/service'
import { createSelectionFromMatch } from '../../utils/matching/actions'
import { recordWebFormSubmission } from '../../utils/comms/web'
import { saveEntityCustomFields } from '../../utils/customFields/service'
import { addTagToEntity } from '../../utils/tags/service'
import { ctxSetId, type DemoContext } from '../context'
import { actingUser, commercialId, contactId, hasId, leadId, officeId, orgId, personPhotoPath, propertyId, propertyKindOf, requirementId, uploadDemoAsset } from '../helpers'
import { CONTACTS, LEADS, REQUIREMENTS, type DemoContact, type DemoLead } from '../dataset/crm'
import { PROPERTIES } from '../dataset/properties'
import { COMMERCIALS, OFFICES } from '../dataset/company'
import { clockNow } from '../../utils/clock'
import type { TimelineBuilder } from '../timeline'

/**
 * El CRM en el tiempo: contactos (los que no llegan por un lead), leads por
 * su canal real (web y portales por la captación pública, que enruta sola;
 * teléfono, oficina, referidos y eventos con alta manual del comercial),
 * primer contacto, fases con su motivo, necesidades y compatibilidades.
 */

const PUBLIC_SOURCES = new Set(['web', 'portal', 'ads', 'social'])

const STAGE_ORDER = ['contacted', 'qualifying', 'qualified', 'viewing', 'offer', 'negotiation', 'won'] as const
const STAGE_REASON: Record<string, string> = {
  contacted: 'Primer contacto hecho: le interesa seguir',
  qualifying: 'Recogiendo necesidades, plazos y financiación',
  qualified: 'Presupuesto y necesidad confirmados',
  viewing: 'Visitas programadas',
  offer: 'Oferta presentada a la propiedad',
  negotiation: 'Oferta aceptada: operación en curso',
  won: 'Operación cerrada',
}
const CLIENT_TYPE: Record<string, string> = { buyer: 'buyer', investor: 'investor', tenant: 'tenant', seller: 'seller', owner: 'seller', landlord: 'seller' }
const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', web: 'Email', portal: 'Teléfono', phone: 'Teléfono', walk_in: 'Teléfono', referral: 'Teléfono', event: 'Email', social: 'WhatsApp' }

const contactOf = (key: string) => CONTACTS.find((c) => c.key === key)!
const leadOfContact = (key: string) => LEADS.find((l) => l.contact === key)
const leadByKey = (key: string) => LEADS.find((l) => l.key === key)!

function addMinutes(hhmm: string, minutes: number): { dayShift: number; at: string } {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const dayShift = Math.floor(total / 1440)
  const rest = ((total % 1440) + 1440) % 1440
  return { dayShift, at: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}` }
}

/** Completa la ficha del contacto: país, origen, comercial, oficina, notas, roles, etiquetas, foto y preferencias. */
async function enrichContact(ctx: DemoContext, c: DemoContact, id: number) {
  const actor = actingUser(ctx, c.commercial)
  const photo = await uploadDemoAsset(ctx, personPhotoPath(c.key), { category: 'upload', entityType: 'contacts', entityId: id, createdBy: actor.id })
  await updateContact(ctx.event, orgId(ctx), id, {
    country: c.country,
    source: c.source,
    language: c.language,
    assignedCommercialId: commercialId(ctx, c.commercial),
    officeId: officeId(ctx, c.office),
    notes: c.notes ?? null,
    photo,
    ...(c.whatsapp && c.phone ? { whatsapp: c.phone } : {}),
  })
  await syncContactRoles(ctx.db, orgId(ctx), id, c.roles, actor.id)
  for (const name of c.tags ?? []) await addTagToEntity(ctx.db, orgId(ctx), ['contact'], { entityType: 'contact', entityId: id, name })
  await saveEntityCustomFields(ctx.db, orgId(ctx), actor.id, { entityType: 'contact', entityKind: 'contact', entityId: id }, {
    canal_preferido: c.whatsapp ? 'WhatsApp' : CANAL[c.source] || 'Teléfono',
    comprador_inversor: c.roles.includes('investor'),
  })
}

/** Alta en «Clientes» (Clientes → Nuevo) enlazada a su contacto. */
async function registerClient(ctx: DemoContext, c: DemoContact, stage: 'active' | 'closed' | 'inactive') {
  if (hasId(ctx, `client:${c.key}`)) return
  const role = c.roles.find((r) => CLIENT_TYPE[r]) || 'buyer'
  const commercial = COMMERCIALS.find((x) => x.key === c.commercial)!
  const { id } = await insertResourceRecord(
    ctx.db,
    'clients',
    adminResources.clients,
    { name: c.name, email: c.email ?? null, phone: c.phone ?? null, type: CLIENT_TYPE[role], stage, agentName: commercial.name, location: OFFICES.find((o) => o.key === c.office)!.city, notes: c.notes ?? null },
    { orgId: orgId(ctx), user: actingUser(ctx, c.commercial), event: ctx.event },
  )
  await ctx.db.update(schema.clients).set({ contactId: contactId(ctx, c.key) }).where(and(eq(schema.clients.id, id), eq(schema.clients.organizationId, orgId(ctx))))
  ctxSetId(ctx, `client:${c.key}`, id)
}

async function createLead(ctx: DemoContext, lead: DemoLead) {
  const c = contactOf(lead.contact)
  const prop = lead.property ? PROPERTIES.find((p) => p.key === lead.property)! : null
  const actor = actingUser(ctx, c.commercial)
  const existingContact = hasId(ctx, `contact:${c.key}`) ? contactId(ctx, c.key) : null
  const base = {
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    whatsapp: c.whatsapp ? c.phone ?? null : null,
    source: lead.source,
    portal: lead.portal ?? null,
    campaign: lead.campaign ?? null,
    utmSource: lead.utmSource ?? null,
    utmMedium: lead.utmMedium ?? null,
    utmCampaign: lead.campaign ?? null,
    originalMessage: lead.message,
    budget: lead.budget ?? null,
    priority: lead.priority ?? null,
    language: c.language,
    propertyId: prop ? propertyId(ctx, prop.key) : null,
    propertyKind: prop ? prop.kind : null,
  }
  let id: number
  if (PUBLIC_SOURCES.has(lead.source)) {
    // La captación pública: resuelve o crea el contacto, enruta y calcula el score.
    const res = await upsertLead(ctx.event, { organizationId: orgId(ctx), ...base, propertyName: prop?.title ?? null, landingPage: prop ? `/propiedades/${prop.key}` : '/contacto' })
    id = res.id
    if (lead.source !== 'portal') {
      await recordWebFormSubmission(ctx.db, {
        orgId: orgId(ctx),
        formType: lead.source === 'web' ? (prop ? 'visit_request' : 'contact') : 'lead_form',
        leadId: id,
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        message: lead.message,
        propertyId: base.propertyId,
        propertyKind: base.propertyKind,
        pageUrl: prop ? `/propiedades/${prop.key}` : '/contacto',
      })
    }
  } else {
    // Teléfono, oficina, referidos, eventos, WhatsApp desde el móvil: alta
    // manual por el comercial que lo atiende (queda asignado a él).
    const res = await createLeadFromAdmin(ctx.event, orgId(ctx), actor, {
      ...base,
      contactId: existingContact,
      agentId: commercialId(ctx, c.commercial),
      officeId: officeId(ctx, c.office),
      force: true,
    })
    id = res.id
  }
  ctxSetId(ctx, `lead:${lead.key}`, id)
  const [row] = await ctx.db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(eq(schema.leads.id, id)).limit(1)
  if (row?.contactId && !hasId(ctx, `contact:${c.key}`)) {
    ctxSetId(ctx, `contact:${c.key}`, row.contactId)
    await enrichContact(ctx, c, row.contactId)
  }
  await saveEntityCustomFields(ctx.db, orgId(ctx), actor.id, { entityType: 'lead', entityKind: 'lead', entityId: id }, {
    plazo_estimado: lead.priority === 'high' ? 'Menos de 3 meses' : lead.stage === 'new' || lead.stage === 'contacted' ? '6-12 meses' : '3-6 meses',
  })
}

export function addCrmEvents(tl: TimelineBuilder): void {
  // Contactos que no llegan por un lead (propietarios, pareja, representante),
  // o que existían antes de su lead (un propietario que luego compra).
  for (const c of CONTACTS) {
    const lead = leadOfContact(c.key)
    const standalone = !lead || lead.days > c.days + 1
    if (!standalone) continue
    tl.add(c.days, c.at, `Contacto ${c.key}`, async (ctx) => {
      const res = await createContactFromAdmin(ctx.event, orgId(ctx), actingUser(ctx, c.commercial), {
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        whatsapp: c.whatsapp ? c.phone ?? null : null,
        language: c.language,
        roles: c.roles,
        force: true,
      })
      ctxSetId(ctx, `contact:${c.key}`, res.id)
      await enrichContact(ctx, c, res.id)
      if (c.roles.includes('owner')) await registerClient(ctx, c, ['c37', 'c42', 'c43'].includes(c.key) ? 'closed' : 'active')
    })
  }

  for (const lead of LEADS) {
    tl.add(lead.days, lead.at, `Lead ${lead.key}`, (ctx) => createLead(ctx, lead))

    const c = contactOf(lead.contact)
    if (lead.contactAfterMin != null) {
      const first = addMinutes(lead.at, lead.contactAfterMin)
      tl.add(lead.days + first.dayShift, first.at, `Primer contacto ${lead.key}`, async (ctx) => {
        await markLeadContacted(ctx.db, orgId(ctx), { leadId: leadId(ctx, lead.key) }, { human: true })
      })
    }
    ;(lead.stageDays ?? []).forEach((offset, i) => {
      const toStage = STAGE_ORDER[i]
      if (!toStage) return
      // El mismo día que el primer contacto, justo después de él.
      const at = offset === 0 && lead.contactAfterMin != null ? addMinutes(lead.at, lead.contactAfterMin + 3) : { dayShift: 0, at: i % 2 ? '17:10' : '11:20' }
      tl.add(lead.days + offset + at.dayShift, at.at, `Fase ${toStage} ${lead.key}`, async (ctx) => {
        await transitionLeadStage(ctx.event, orgId(ctx), leadId(ctx, lead.key), { toStage, reason: STAGE_REASON[toStage] }, { userId: actingUser(ctx, c.commercial).id })
        if (toStage === 'qualified') await registerClient(ctx, c, 'active')
        if (toStage === 'won') await ctx.db.update(schema.clients).set({ stage: 'closed' }).where(eq(schema.clients.id, ctx.state.ids[`client:${c.key}`] ?? 0))
      })
    })
    if (lead.lost) {
      tl.add(lead.days + lead.lost.afterDays, '13:00', `Lead perdido ${lead.key}`, async (ctx) => {
        await setLeadOutcome(ctx.event, orgId(ctx), leadId(ctx, lead.key), { lost: true, lostReason: lead.lost!.reason, note: lead.lost!.note }, { userId: actingUser(ctx, c.commercial).id })
      })
    }
  }

  for (const r of REQUIREMENTS) {
    const c = contactOf(r.contact)
    tl.add(r.days, '12:40', `Necesidad ${r.key}`, async (ctx) => {
      const actor = actingUser(ctx, c.commercial)
      const req = await createBuyerRequirement(
        ctx.event,
        orgId(ctx),
        {
          contactId: contactId(ctx, c.key),
          title: r.title,
          status: 'active',
          operation: r.operation,
          propertyTypes: r.propertyTypes,
          priceMin: r.priceMin ?? null,
          priceMax: r.priceMax,
          areaMin: r.areaMin ?? null,
          bedroomsMin: r.bedroomsMin ?? null,
          bathroomsMin: r.bathroomsMin ?? null,
          desiredZones: r.zones.map((z) => ({ city: z.city, district: z.district, label: z.district ? `${z.district}, ${z.city}` : z.city })),
          buildPref: r.buildPref ?? null,
          conditionPref: r.conditionPref ?? null,
          urgency: r.urgency ?? 'medium',
          needsMortgage: r.needsMortgage == null ? null : r.needsMortgage ? 1 : 0,
          mortgageStatus: r.mortgageStatus ?? null,
          desiredDate: r.desiredInDays ? new Date(clockNow().getTime() + r.desiredInDays * 86_400_000).toISOString().slice(0, 10) : null,
          notes: r.notes ?? null,
          assignedCommercialId: commercialId(ctx, c.commercial),
          importances: r.importances,
          features: r.features,
        },
        { createdBy: actor.id },
      )
      const id = Number((req as { id: number }).id)
      ctxSetId(ctx, `req:${r.key}`, id)
      if (r.budgetValidated) await validateBudget(ctx.event, orgId(ctx), id, actor.id, true)
    })

    // Compatibilidades: el motor real puntúa; el comercial selecciona las
    // buenas, envía las mejores y descarta alguna con su motivo.
    tl.add(r.days, '13:05', `Compatibilidades ${r.key}`, async (ctx) => {
      const actor = actingUser(ctx, c.commercial)
      const res = await findPropertiesForRequirement(ctx.event, orgId(ctx), requirementId(ctx, r.key), { limit: 20 })
      const ranked = [...(res?.results ?? [])].sort((a, b) => (b.result.score ?? 0) - (a.result.score ?? 0))
      const strong = ranked.slice(0, 3)
      for (const m of strong) {
        await setMatchStatus(ctx.event, orgId(ctx), { buyerRequirementId: requirementId(ctx, r.key), propertyId: Number(m.property.id), propertyKind: m.propertyKind, status: 'selected' }, { userId: actor.id })
      }
      const weak = ranked.slice(5, 6)
      for (const m of weak) {
        await setMatchStatus(ctx.event, orgId(ctx), { buyerRequirementId: requirementId(ctx, r.key), propertyId: Number(m.property.id), propertyKind: m.propertyKind, status: 'discarded', discardedReason: 'No encaja con la zona que prioriza' }, { userId: actor.id })
      }
      ctx.state.ids[`matches:${r.key}`] = strong.length
      strong.forEach((m, i) => {
        ctx.state.ids[`match:${r.key}:${i}`] = Number(m.property.id)
        ctx.state.ids[`matchKind:${r.key}:${i}`] = m.propertyKind === 'agent' ? 1 : 2
      })
    })
    tl.add(r.days + 1, '10:15', `Envío de propiedades ${r.key}`, async (ctx) => {
      const actor = actingUser(ctx, c.commercial)
      const n = Math.min(2, ctx.state.ids[`matches:${r.key}`] ?? 0)
      const items: { propertyId: number; propertyKind: 'agent' | 'developer' }[] = []
      for (let i = 0; i < n; i++) {
        const pid = ctx.state.ids[`match:${r.key}:${i}`]
        const kind = ctx.state.ids[`matchKind:${r.key}:${i}`] === 1 ? 'agent' : 'developer'
        if (!pid) continue
        await markMatchSent(ctx.event, orgId(ctx), { buyerRequirementId: requirementId(ctx, r.key), propertyId: pid, propertyKind: kind }, { userId: actor.id })
        items.push({ propertyId: pid, propertyKind: kind })
      }
      if (items.length && ['r01', 'r03', 'r15', 'r17', 'r22'].includes(r.key)) {
        await createSelectionFromMatch(ctx.event, orgId(ctx), { buyerRequirementId: requirementId(ctx, r.key), items, title: `Selección para ${c.name.split(' ')[0]}` }, { userId: actor.id })
      }
    })
  }
}

export { propertyKindOf, leadByKey }
