import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getRequestURL } from 'h3'
import { schema } from '../db'
import { buildPropertyFilterConds, PROPERTY_FEATURE_COLUMNS, propertyTableFor, type PropertyFeature } from '../properties/searchService'
import { livePropertyCond } from '../properties/trash'
import { toPublicProperty } from '../propertyPrivacy'
import { getPropertySchemaFor, isFieldApplicable } from '../propertySchema/registry'
import { upsertLead } from '../leads'
import { LOST_REASONS, setLeadOutcome, STAGES, transitionLeadStage } from '../leads/pipeline'
import { reassignLead } from '../leads/routing'
import { orgDefaultCountryPrefix, resolveContact, searchContacts } from '../contacts/service'
import { createBuyerRequirement, MORTGAGE_STATUSES, OPERATIONS, updateBuyerRequirement } from '../buyerRequirements/service'
import { findPropertiesForRequirement, PROPERTY_KINDS, type PropertyKind } from '../matching/service'
import { createAdminAppointment } from '../appointments/adminCreate'
import { updateAppointment } from '../appointments/update'
import { createTask, TASK_TYPES } from '../tasks/service'
import { openConversation } from '../comms/open'
import { serializeMessage, sharePropertyInConversation } from '../comms/admin'
import { createPropertySelection } from '../selections/service'
import { createOffer } from '../offers/service'
import { ToolError, type DomainTool, type ToolJsonSchema } from './types'

/**
 * Las 14 herramientas iniciales de la Domain Tools API (FASE 31 §23), más find_contacts (de lectura, para la desambiguación de §17). Cada
 * una delega en el servicio de dominio que ya usa el panel — ninguna
 * escribe en la base de datos por su cuenta, ni acepta SQL, nombres de
 * tabla o columna (§25). Las salidas son DTOs compactos (§50).
 */

// --- validación (sin dependencias: el proyecto no usa zod) ------------------------

function fail(message: string): never {
  throw new ToolError('VALIDATION_ERROR', message)
}
const v = {
  str(o: Record<string, unknown>, k: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
    const raw = o[k]
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) fail(`Falta «${k}».`)
      return undefined
    }
    if (typeof raw !== 'string' && typeof raw !== 'number') fail(`«${k}» debe ser texto.`)
    const s = String(raw).trim()
    if (opts.required && !s) fail(`Falta «${k}».`)
    return s.slice(0, opts.max ?? 500) || undefined
  },
  int(o: Record<string, unknown>, k: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | undefined {
    const raw = o[k]
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) fail(`Falta «${k}».`)
      return undefined
    }
    const n = Number(raw)
    if (!Number.isInteger(n)) fail(`«${k}» debe ser un entero.`)
    if (opts.min !== undefined && n < opts.min) fail(`«${k}» debe ser ≥ ${opts.min}.`)
    if (opts.max !== undefined && n > opts.max) fail(`«${k}» debe ser ≤ ${opts.max}.`)
    return n
  },
  num(o: Record<string, unknown>, k: string, opts: { required?: boolean; min?: number } = {}): number | undefined {
    const raw = o[k]
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) fail(`Falta «${k}».`)
      return undefined
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) fail(`«${k}» debe ser un número.`)
    if (opts.min !== undefined && n < opts.min) fail(`«${k}» debe ser ≥ ${opts.min}.`)
    return n
  },
  oneOf<T extends string>(o: Record<string, unknown>, k: string, values: readonly T[], opts: { required?: boolean } = {}): T | undefined {
    const s = v.str(o, k, opts)
    if (s === undefined) return undefined
    if (!(values as readonly string[]).includes(s)) fail(`«${k}» debe ser uno de: ${values.join(', ')}.`)
    return s as T
  },
  strArray(o: Record<string, unknown>, k: string, opts: { max?: number; values?: readonly string[] } = {}): string[] | undefined {
    const raw = o[k]
    if (raw === undefined || raw === null) return undefined
    if (!Array.isArray(raw)) fail(`«${k}» debe ser una lista.`)
    const out = raw.map((x) => String(x).trim()).filter(Boolean).slice(0, opts.max ?? 20)
    if (opts.values) for (const x of out) if (!opts.values.includes(x)) fail(`«${k}»: «${x}» no es válido (${opts.values.join(', ')}).`)
    return out.length ? out : undefined
  },
  datetime(o: Record<string, unknown>, k: string, opts: { required?: boolean } = {}): string | undefined {
    const s = v.str(o, k, opts)
    if (s === undefined) return undefined
    const norm = s.replace('T', ' ').replace(/Z$/, '').slice(0, 19)
    const withSeconds = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(norm) ? `${norm}:00` : norm
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(withSeconds)) fail(`«${k}» debe ser fecha y hora «AAAA-MM-DD HH:MM» (hora local de la agencia, como en el calendario).`)
    return withSeconds
  },
  date(o: Record<string, unknown>, k: string): string | undefined {
    const s = v.str(o, k)
    if (s === undefined) return undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`«${k}» debe ser una fecha «AAAA-MM-DD».`)
    return s
  },
  kind(o: Record<string, unknown>, k = 'propertyKind'): PropertyKind {
    return v.oneOf(o, k, PROPERTY_KINDS, { required: true })!
  },
}

/**
 * Las citas y tareas guardan la hora tal cual se ve en el calendario del
 * panel (el `datetime-local` del navegador, sin zona): la hora local de la
 * agencia, no UTC. «Mañana a las 17:00» es «AAAA-MM-DD 17:00».
 */
const WHEN_DESC = 'Hora local de la agencia, como en el calendario: «AAAA-MM-DD HH:MM».'
const schemaOf = (properties: Record<string, any>, required: string[] = []): ToolJsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const KIND_SCHEMA = { type: 'string', enum: ['developer', 'agent'], description: 'Catálogo: «developer» = Propiedades (web, obra nueva), «agent» = Propiedades 2ª mano.' }
const FEATURES = Object.keys(PROPERTY_FEATURE_COLUMNS) as PropertyFeature[]

// --- DTOs compactos de propiedad --------------------------------------------------

function featuresOf(row: any): PropertyFeature[] {
  return FEATURES.filter((f) => Number(row[PROPERTY_FEATURE_COLUMNS[f]]) === 1)
}
function compactProperty(kind: PropertyKind, raw: any) {
  const p = toPublicProperty(raw) as any
  return {
    id: p.id,
    kind,
    reference: raw.reference ?? null,
    title: kind === 'developer' ? p.name : p.street || p.city || `Inmueble #${p.id}`,
    type: p.propertyType ?? null,
    operation: p.transactionType ?? null,
    price: p.price ?? null,
    location: { city: p.city ?? null, district: p.district ?? null },
    area: p.area ?? null,
    plotArea: raw.plotArea ?? null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    features: featuresOf(raw),
    cover: raw.mainImage ?? raw.coverImage ?? null,
    status: p.status ?? null,
    published: kind === 'developer' ? Boolean(raw.publishedAt) : null,
  }
}

/**
 * ¿Se puede enseñar a un comprador? (PROPERTY_NOT_PUBLISHABLE, §49). Obra
 * nueva: sólo si está publicada en la web — un borrador no sale de la
 * agencia. 2ª mano: sólo si sigue disponible — una vendida no se ofrece.
 */
function assertPublishable(kind: PropertyKind, row: any) {
  if (kind === 'developer' && !row.publishedAt) throw new ToolError('PROPERTY_NOT_PUBLISHABLE', 'La propiedad no está publicada: publícala antes de enviarla.')
  if (kind === 'agent' && row.status !== 'available') throw new ToolError('PROPERTY_NOT_PUBLISHABLE', `La propiedad no está disponible (estado «${row.status}»).`)
}

/** Tipo de entidad de una propiedad en trazas y en el contexto de INMO: el catálogo forma parte de su identidad. */
const propertyEntity = (kind: PropertyKind) => (kind === 'agent' ? 'agent_property' : 'developer_property')

/**
 * Para INMO y la Domain Tools API una propiedad en la papelera no existe:
 * ni se enseña, ni se envía, ni se le crea una cita u oferta. Misma
 * respuesta que una que no es de la agencia.
 */
async function loadOwnedProperty(db: any, orgId: number, kind: PropertyKind, id: number) {
  const P = propertyTableFor(kind) as any
  const [row] = await db.select().from(P).where(and(eq(P.id, id), eq(P.organizationId, orgId), livePropertyCond(P))).limit(1)
  if (!row) throw new ToolError('NOT_FOUND', 'Propiedad no encontrada.')
  return row
}

async function loadOwnedLead(db: any, orgId: number, leadId: number) {
  const [lead] = await db
    .select({ id: schema.leads.id, name: schema.leads.name, email: schema.leads.email, phone: schema.leads.phone, contactId: schema.leads.contactId, stage: schema.leads.stage, status: schema.leads.status, agentId: schema.leads.agentId, score: schema.leads.score })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
    .limit(1)
  if (!lead) throw new ToolError('NOT_FOUND', 'Lead no encontrado.')
  return lead
}

// --- herramientas -----------------------------------------------------------------

const searchProperties: DomainTool = {
  name: 'search_properties',
  description:
    'Busca propiedades reales de la agencia con criterios estructurados (PropertySearchService). Devuelve fichas compactas. No inventes criterios: lo que el usuario no dijo, no se envía.',
  kind: 'read',
  area: 'web',
  action: 'read',
  inputSchema: schemaOf({
    catalog: { type: 'string', enum: ['developer', 'agent', 'both'], description: 'Por defecto los dos.' },
    text: { type: 'string', description: 'Nombre o referencia de una propiedad concreta («Villa Mediterránea»). No lo uses para zonas ni características.' },
    operation: { type: 'string', enum: ['sale', 'rent'] },
    propertyTypes: { type: 'array', items: { type: 'string' }, description: 'Apartment, Villa, Penthouse, Townhouse, Studio, Land, Office, Retail, Warehouse, Garage, Building…' },
    zones: { type: 'array', items: { type: 'string' }, description: 'Ciudades o distritos (cualquiera de ellos).' },
    priceMin: { type: 'number' },
    priceMax: { type: 'number' },
    areaMin: { type: 'number', description: 'm² construidos. En una búsqueda sólo de Suelo (Land) se aplica a la parcela.' },
    areaMax: { type: 'number' },
    plotAreaMin: { type: 'number', description: 'm² de parcela («parcela de más de 2.000 m²»).' },
    plotAreaMax: { type: 'number' },
    bedroomsMin: { type: 'integer' },
    bathroomsMin: { type: 'integer' },
    features: { type: 'array', items: { type: 'string', enum: FEATURES }, description: 'Características que DEBE tener.' },
    commercialId: { type: 'integer', description: 'Sólo las de este comercial (el comercial asignado existe sólo en 2ª mano).' },
    sort: { type: 'string', enum: ['price_asc', 'price_desc', 'newest'] },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
  }),
  parse: (o) => ({
    catalog: v.oneOf(o, 'catalog', ['developer', 'agent', 'both'] as const) ?? 'both',
    text: v.str(o, 'text', { max: 120 }),
    operation: v.oneOf(o, 'operation', OPERATIONS),
    propertyTypes: v.strArray(o, 'propertyTypes', { max: 10 }),
    zones: v.strArray(o, 'zones', { max: 10 }),
    priceMin: v.num(o, 'priceMin', { min: 0 }),
    priceMax: v.num(o, 'priceMax', { min: 0 }),
    areaMin: v.num(o, 'areaMin', { min: 0 }),
    areaMax: v.num(o, 'areaMax', { min: 0 }),
    plotAreaMin: v.num(o, 'plotAreaMin', { min: 0 }),
    plotAreaMax: v.num(o, 'plotAreaMax', { min: 0 }),
    bedroomsMin: v.int(o, 'bedroomsMin', { min: 0, max: 20 }),
    bathroomsMin: v.int(o, 'bathroomsMin', { min: 0, max: 20 }),
    features: v.strArray(o, 'features', { values: FEATURES }) as PropertyFeature[] | undefined,
    commercialId: v.int(o, 'commercialId', { min: 1 }),
    sort: v.oneOf(o, 'sort', ['price_asc', 'price_desc', 'newest'] as const) ?? 'newest',
    limit: v.int(o, 'limit', { min: 1, max: 20 }) ?? 10,
  }),
  async run(ctx, input) {
    let kinds: PropertyKind[] = input.catalog === 'both' ? ['developer', 'agent'] : [input.catalog]
    // Obra nueva no tiene comercial asignado: filtrar por comercial sólo puede devolver 2ª mano.
    if (input.commercialId) kinds = kinds.filter((k) => k === 'agent')
    const results: any[] = []
    let total = 0
    for (const kind of kinds) {
      const P = propertyTableFor(kind) as any
      // §9: la superficie que cuenta la decide el PropertySchemaRegistry. Si
      // TODOS los tipos pedidos carecen de `area` y tienen parcela (Suelo),
      // «de más de 2.000 m²» es la parcela, no los m² construidos.
      const plotOnly = Boolean(input.propertyTypes?.length) && input.propertyTypes!.every((t: string) => {
        const s = getPropertySchemaFor(kind, t)
        return !isFieldApplicable(s, 'area') && isFieldApplicable(s, 'plotArea')
      })
      const conds = [
        eq(P.organizationId, ctx.orgId),
        ...buildPropertyFilterConds(kind, {
          transactionType: input.operation,
          text: input.text,
          propertyTypes: input.propertyTypes,
          zones: input.zones,
          priceMin: input.priceMin,
          priceMax: input.priceMax,
          areaMin: plotOnly ? undefined : input.areaMin,
          areaMax: plotOnly ? undefined : input.areaMax,
          plotAreaMin: input.plotAreaMin ?? (plotOnly ? input.areaMin : undefined),
          plotAreaMax: input.plotAreaMax ?? (plotOnly ? input.areaMax : undefined),
          bedroomsMin: input.bedroomsMin,
          bathroomsMin: input.bathroomsMin,
          features: input.features,
        }),
      ]
      // Sólo lo que la agencia tiene en oferta: 2ª mano disponible, y nada de la papelera en ningún catálogo.
      if (kind === 'agent') conds.push(eq(P.status, 'available'))
      if (input.commercialId) conds.push(eq(P.agentId, input.commercialId))
      conds.push(livePropertyCond(P))
      const order = input.sort === 'price_asc' ? asc(P.price) : input.sort === 'price_desc' ? desc(P.price) : desc(P.id)
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)` }).from(P).where(and(...conds))
      total += Number(n)
      const rows = await ctx.db.select().from(P).where(and(...conds)).orderBy(order).limit(input.limit)
      results.push(...rows.map((r: any) => compactProperty(kind, r)))
    }
    if (input.sort === 'price_asc') results.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    else if (input.sort === 'price_desc') results.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
    return { output: { total, returned: Math.min(results.length, input.limit), results: results.slice(0, input.limit) } }
  },
}

const getProperty: DomainTool = {
  name: 'get_property',
  description: 'Una propiedad concreta. «public» = sólo datos publicables (lo que se puede enseñar a un comprador); «internal» = ficha interna compacta, sólo si tu usuario puede leer el catálogo.',
  kind: 'read',
  area: 'web',
  action: 'read',
  inputSchema: schemaOf({ propertyId: { type: 'integer' }, propertyKind: KIND_SCHEMA, view: { type: 'string', enum: ['public', 'internal'] } }, ['propertyId', 'propertyKind']),
  parse: (o) => ({ propertyId: v.int(o, 'propertyId', { required: true, min: 1 })!, propertyKind: v.kind(o), view: v.oneOf(o, 'view', ['public', 'internal'] as const) ?? 'public' }),
  async run(ctx, input) {
    const row = await loadOwnedProperty(ctx.db, ctx.orgId, input.propertyKind, input.propertyId)
    const base = compactProperty(input.propertyKind, row)
    if (input.view === 'public') {
      const p = toPublicProperty(row) as any
      return { output: { ...base, view: 'public', description: p.description ? String(p.description).slice(0, 600) : null }, target: { type: propertyEntity(input.propertyKind), id: row.id } }
    }
    // Ficha interna compacta: referencias, mandato y dirección exacta — nunca la fila entera.
    return {
      output: {
        ...base,
        view: 'internal',
        location: { city: row.city ?? null, district: row.district ?? null, street: row.street ?? null, streetNumber: row.streetNumber ?? null, locationPrivacy: row.locationPrivacy ?? null },
        agencyReference: row.agencyReference ?? null,
        mandateType: row.mandateType ?? null,
        isExclusive: row.isExclusive != null ? Boolean(row.isExclusive) : null,
        captureDate: row.captureDate ?? null,
        description: row.description ? String(row.description).slice(0, 600) : null,
      },
      target: { type: propertyEntity(input.propertyKind), id: row.id },
    }
  },
}

const createLeadTool: DomainTool = {
  name: 'create_lead',
  description: 'Crea (o reutiliza, si el email ya tiene lead) un lead real por el pipeline central: Contacto y deduplicación, enrutado, SLA y Activity.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf(
    { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string', description: 'Con prefijo internacional.' }, budget: { type: 'number' }, notes: { type: 'string' }, propertyId: { type: 'integer', description: 'Sólo Propiedades (web).' } },
    ['name'],
  ),
  parse: (o) => {
    const input = { name: v.str(o, 'name', { required: true, max: 200 })!, email: v.str(o, 'email', { max: 200 }), phone: v.str(o, 'phone', { max: 40 }), budget: v.num(o, 'budget', { min: 0 }), notes: v.str(o, 'notes', { max: 2000 }), propertyId: v.int(o, 'propertyId', { min: 1 }) }
    if (!input.email && !input.phone) fail('Hace falta email o teléfono.')
    return input
  },
  async run(ctx, input) {
    let propertyName: string | null = null
    if (input.propertyId) propertyName = (await loadOwnedProperty(ctx.db, ctx.orgId, 'developer', input.propertyId)).name ?? null
    const r = await upsertLead(ctx.event, {
      organizationId: ctx.orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: ctx.source === 'inmo' ? 'inmo' : 'manual',
      budget: input.budget ?? null,
      propertyId: input.propertyId ?? null,
      propertyName,
      notes: input.notes ?? null,
    })
    const lead = await loadOwnedLead(ctx.db, ctx.orgId, r.id)
    return { output: { leadId: lead.id, created: r.created, contactId: lead.contactId, stage: lead.stage, commercialId: lead.agentId, score: lead.score }, target: { type: 'lead', id: lead.id } }
  },
}

const updateLeadTool: DomainTool = {
  name: 'update_lead',
  description: 'Mueve un lead de fase (con su historial), lo reasigna a otro comercial, o lo marca perdido/reactivado — por el pipeline real.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  inputSchema: schemaOf(
    { leadId: { type: 'integer' }, stage: { type: 'string', enum: [...STAGES] }, commercialId: { type: ['integer', 'null'] }, lost: { type: 'boolean' }, lostReason: { type: 'string', enum: [...LOST_REASONS] }, reason: { type: 'string' } },
    ['leadId'],
  ),
  parse: (o) => {
    const input = {
      leadId: v.int(o, 'leadId', { required: true, min: 1 })!,
      stage: v.oneOf(o, 'stage', STAGES),
      commercialId: o.commercialId === null ? null : v.int(o, 'commercialId', { min: 1 }),
      lost: typeof o.lost === 'boolean' ? o.lost : undefined,
      lostReason: v.oneOf(o, 'lostReason', LOST_REASONS),
      reason: v.str(o, 'reason', { max: 300 }),
    }
    if (input.stage === undefined && input.commercialId === undefined && input.lost === undefined) fail('Indica stage, commercialId o lost.')
    return input
  },
  async run(ctx, input) {
    await loadOwnedLead(ctx.db, ctx.orgId, input.leadId)
    if (input.commercialId !== undefined) await reassignLead(ctx.event, ctx.orgId, input.leadId, input.commercialId, { userId: ctx.user.id, reason: input.reason ?? 'INMO' })
    if (input.stage) await transitionLeadStage(ctx.event, ctx.orgId, input.leadId, { toStage: input.stage, reason: input.reason }, { userId: ctx.user.id })
    if (input.lost !== undefined) await setLeadOutcome(ctx.event, ctx.orgId, input.leadId, { lost: input.lost, lostReason: input.lostReason, note: input.reason }, { userId: ctx.user.id })
    const lead = await loadOwnedLead(ctx.db, ctx.orgId, input.leadId)
    return { output: { leadId: lead.id, stage: lead.stage, status: lead.status, commercialId: lead.agentId }, target: { type: 'lead', id: lead.id } }
  },
}

const createContactTool: DomainTool = {
  name: 'create_contact',
  description: 'Crea un Contacto o reutiliza el existente si coincide exactamente (email/teléfono). Si hay coincidencias dudosas las devuelve para que una persona decida — nunca fusiona.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf({ name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, notes: { type: 'string' } }, ['name']),
  parse: (o) => ({ name: v.str(o, 'name', { required: true, max: 200 })!, email: v.str(o, 'email', { max: 200 }), phone: v.str(o, 'phone', { max: 40 }), notes: v.str(o, 'notes', { max: 2000 }) }),
  async run(ctx, input) {
    const defaultCountryPrefix = await orgDefaultCountryPrefix(ctx.event, ctx.orgId)
    const r = await resolveContact(ctx.event, ctx.orgId, { name: input.name, email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null }, { createdBy: ctx.user.id, defaultCountryPrefix })
    return {
      output: { contactId: r.contactId, created: r.created, possibleDuplicates: r.candidates.filter((c) => c.level !== 'exact').map((c) => ({ contactId: c.contactId, name: c.name, matchedOn: c.matchedOn })) },
      target: { type: 'contact', id: r.contactId },
    }
  },
}

const findContacts: DomainTool = {
  name: 'find_contacts',
  description:
    'Busca personas (Contactos) por nombre, email o teléfono, con sus leads y necesidades de compra. Si hay más de una coincidencia, NO elijas: pregunta al usuario cuál es (AMBIGUOUS_ENTITY en las herramientas que reciben un id).',
  kind: 'read',
  area: 'crm',
  action: 'read',
  inputSchema: schemaOf({ query: { type: 'string', description: 'Nombre, email o teléfono.' } }, ['query']),
  parse: (o) => ({ query: v.str(o, 'query', { required: true, max: 120 })! }),
  async run(ctx, input) {
    const rows = await searchContacts(ctx.db, ctx.orgId, input.query, 8)
    const ids = rows.map((r) => r.id)
    const leads = ids.length
      ? await ctx.db
          .select({ id: schema.leads.id, contactId: schema.leads.contactId, stage: schema.leads.stage, status: schema.leads.status, commercialId: schema.leads.agentId, score: schema.leads.score })
          .from(schema.leads)
          .where(and(eq(schema.leads.organizationId, ctx.orgId), inArray(schema.leads.contactId, ids)))
      : []
    const requirements = ids.length
      ? await ctx.db
          .select({ id: schema.buyerRequirements.id, contactId: schema.buyerRequirements.contactId, title: schema.buyerRequirements.title, status: schema.buyerRequirements.status })
          .from(schema.buyerRequirements)
          .where(and(eq(schema.buyerRequirements.organizationId, ctx.orgId), inArray(schema.buyerRequirements.contactId, ids), isNull(schema.buyerRequirements.deletedAt)))
      : []
    return {
      output: {
        matches: rows.length,
        ambiguous: rows.length > 1,
        contacts: rows.map((c) => ({
          contactId: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          leads: leads.filter((l: any) => l.contactId === c.id).map(({ contactId: _c, ...l }: any) => l),
          buyerRequirements: requirements.filter((r: any) => r.contactId === c.id).map(({ contactId: _c, ...r }: any) => r),
        })),
      },
      target: rows.length === 1 ? { type: 'contact', id: rows[0].id } : null,
    }
  },
}

const updateBuyerRequirementsTool: DomainTool = {
  name: 'update_buyer_requirements',
  description: 'Guarda la necesidad de compra REAL de un Contacto (crea una nueva o actualiza una existente). Sólo para persistir lo que la persona ha pedido — una búsqueda exploratoria no necesita guardarse.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  inputSchema: schemaOf(
    {
      requirementId: { type: 'integer', description: 'Para actualizar una existente.' },
      contactId: { type: 'integer', description: 'Para crear una nueva.' },
      title: { type: 'string' },
      operation: { type: 'string', enum: [...OPERATIONS] },
      propertyTypes: { type: 'array', items: { type: 'string' } },
      desiredZones: { type: 'array', items: { type: 'string' }, description: 'Ciudades, distritos o urbanizaciones.' },
      priceMin: { type: 'number' },
      priceMax: { type: 'number' },
      areaMin: { type: 'number' },
      bedroomsMin: { type: 'integer' },
      bathroomsMin: { type: 'integer' },
      desiredDate: { type: 'string', description: 'AAAA-MM-DD' },
      mortgageStatus: { type: 'string', enum: [...MORTGAGE_STATUSES] },
      urgency: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      notes: { type: 'string' },
    },
  ),
  parse: (o) => {
    const input = {
      requirementId: v.int(o, 'requirementId', { min: 1 }),
      contactId: v.int(o, 'contactId', { min: 1 }),
      fields: {
        title: v.str(o, 'title', { max: 200 }),
        operation: v.oneOf(o, 'operation', OPERATIONS),
        propertyTypes: v.strArray(o, 'propertyTypes', { max: 10 }),
        // Una zona en texto libre se guarda como `label`: el motor de Matching la compara con distrito, ciudad y urbanización.
        desiredZones: v.strArray(o, 'desiredZones', { max: 10 })?.map((label) => ({ label })),
        priceMin: v.num(o, 'priceMin', { min: 0 }),
        priceMax: v.num(o, 'priceMax', { min: 0 }),
        areaMin: v.num(o, 'areaMin', { min: 0 }),
        bedroomsMin: v.int(o, 'bedroomsMin', { min: 0, max: 20 }),
        bathroomsMin: v.int(o, 'bathroomsMin', { min: 0, max: 20 }),
        desiredDate: v.date(o, 'desiredDate'),
        mortgageStatus: v.oneOf(o, 'mortgageStatus', MORTGAGE_STATUSES),
        urgency: v.oneOf(o, 'urgency', ['low', 'medium', 'high', 'urgent'] as const),
        notes: v.str(o, 'notes', { max: 2000 }),
      },
    }
    if (!input.requirementId && !input.contactId) fail('Indica requirementId (actualizar) o contactId (crear).')
    return input
  },
  async run(ctx, input) {
    const fields = Object.fromEntries(Object.entries(input.fields).filter(([, val]) => val !== undefined))
    const req = input.requirementId
      ? await updateBuyerRequirement(ctx.event, ctx.orgId, input.requirementId, fields as any)
      : await createBuyerRequirement(ctx.event, ctx.orgId, { contactId: input.contactId!, operation: 'sale', ...fields } as any, { createdBy: ctx.user.id })
    if (!req) throw new ToolError('NOT_FOUND', 'Necesidad no encontrada.')
    return { output: { requirementId: req.id, contactId: req.contactId, status: req.status, created: !input.requirementId }, target: { type: 'buyer_requirement', id: req.id } }
  },
}

const findMatches: DomainTool = {
  name: 'find_matches',
  description: 'Propiedades compatibles con una necesidad de compra, calculadas por el motor de Matching (score 0-100 con su desglose). No puntúes tú: usa este resultado.',
  kind: 'read',
  area: 'crm',
  action: 'read',
  inputSchema: schemaOf({ buyerRequirementId: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['buyerRequirementId']),
  parse: (o) => ({ buyerRequirementId: v.int(o, 'buyerRequirementId', { required: true, min: 1 })!, limit: v.int(o, 'limit', { min: 1, max: 20 }) ?? 10 }),
  async run(ctx, input) {
    const found = await findPropertiesForRequirement(ctx.event, ctx.orgId, input.buyerRequirementId, { limit: input.limit })
    if (!found) throw new ToolError('NOT_FOUND', 'Necesidad no encontrada.')
    return {
      output: {
        buyerRequirementId: input.buyerRequirementId,
        scanned: found.scanned,
        results: found.results.map((m: any) => ({
          property: { id: m.property.id, kind: m.propertyKind, title: m.property.name || m.property.location || `Inmueble #${m.property.id}`, price: m.property.price ?? null },
          score: m.result.score,
          eligibility: m.result.eligibility,
          matched: m.result.matched.map((c: any) => c.label),
          partial: m.result.partial.map((c: any) => `${c.label}: ${c.detail}`),
          hardFailures: m.result.failed.map((c: any) => `${c.label}: ${c.detail}`),
          persistedStatus: m.persisted?.status ?? null,
        })),
      },
      target: { type: 'buyer_requirement', id: input.buyerRequirementId },
    }
  },
}

const bookViewing: DomainTool = {
  name: 'book_viewing',
  description: 'Agenda una visita a una propiedad para un lead con un comercial, con la comprobación real de solapes.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  requiresConfirmation: true,
  idempotent: true,
  inputSchema: schemaOf(
    { leadId: { type: 'integer' }, commercialId: { type: 'integer' }, propertyId: { type: 'integer' }, propertyKind: KIND_SCHEMA, scheduledAt: { type: 'string', description: WHEN_DESC } },
    ['leadId', 'commercialId', 'propertyId', 'propertyKind', 'scheduledAt'],
  ),
  parse: (o) => ({
    leadId: v.int(o, 'leadId', { required: true, min: 1 })!,
    commercialId: v.int(o, 'commercialId', { required: true, min: 1 })!,
    propertyId: v.int(o, 'propertyId', { required: true, min: 1 })!,
    propertyKind: v.kind(o),
    scheduledAt: v.datetime(o, 'scheduledAt', { required: true })!,
  }),
  async run(ctx, input) {
    const lead = await loadOwnedLead(ctx.db, ctx.orgId, input.leadId)
    await loadOwnedProperty(ctx.db, ctx.orgId, input.propertyKind, input.propertyId)
    const visit = await createAdminAppointment(ctx.db, ctx.orgId, {
      clientName: lead.name,
      clientEmail: lead.email,
      clientPhone: lead.phone,
      agentId: input.commercialId,
      propertyId: input.propertyId,
      propertyKind: input.propertyKind,
      scheduledAt: input.scheduledAt,
      type: 'property_viewing',
      leadId: lead.id,
    })
    return { output: { appointmentId: visit.id, scheduledAt: visit.scheduledAt, status: visit.status, commercialId: visit.agentId }, target: { type: 'appointment', id: visit.id } }
  },
}

async function loadOwnedAppointment(db: any, orgId: number, id: number) {
  const [visit] = await db
    .select({ id: schema.visits.id, status: schema.visits.status, scheduledAt: schema.visits.scheduledAt, agentId: schema.visits.agentId })
    .from(schema.visits)
    .where(and(eq(schema.visits.id, id), eq(schema.visits.organizationId, orgId)))
    .limit(1)
  if (!visit) throw new ToolError('NOT_FOUND', 'Cita no encontrada.')
  return visit
}

const rescheduleViewing: DomainTool = {
  name: 'reschedule_viewing',
  description: 'Cambia la hora (y opcionalmente el comercial) de una cita existente — la misma cita, con su historial; nunca crea otra.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  requiresConfirmation: true,
  inputSchema: schemaOf({ appointmentId: { type: 'integer' }, scheduledAt: { type: 'string', description: WHEN_DESC }, commercialId: { type: 'integer' } }, ['appointmentId', 'scheduledAt']),
  parse: (o) => ({ appointmentId: v.int(o, 'appointmentId', { required: true, min: 1 })!, scheduledAt: v.datetime(o, 'scheduledAt', { required: true })!, commercialId: v.int(o, 'commercialId', { min: 1 }) }),
  async run(ctx, input) {
    const before = await loadOwnedAppointment(ctx.db, ctx.orgId, input.appointmentId)
    if (before.status === 'cancelled') throw new ToolError('CONFLICT', 'La cita está cancelada.')
    await updateAppointment(ctx.db, ctx.orgId, input.appointmentId, { scheduledAt: input.scheduledAt, ...(input.commercialId ? { agentId: input.commercialId } : {}) }, { userId: ctx.user.id, actorType: ctx.source === 'inmo' ? 'ai' : 'user', env: ctx.env })
    const after = await loadOwnedAppointment(ctx.db, ctx.orgId, input.appointmentId)
    return { output: { appointmentId: after.id, from: before.scheduledAt, to: after.scheduledAt, status: after.status }, target: { type: 'appointment', id: after.id } }
  },
}

const cancelViewing: DomainTool = {
  name: 'cancel_viewing',
  description: 'Cancela una cita: queda como «cancelled» con su historial (nunca se borra) y se avisa al cliente.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  requiresConfirmation: true,
  inputSchema: schemaOf({ appointmentId: { type: 'integer' } }, ['appointmentId']),
  parse: (o) => ({ appointmentId: v.int(o, 'appointmentId', { required: true, min: 1 })! }),
  async run(ctx, input) {
    const before = await loadOwnedAppointment(ctx.db, ctx.orgId, input.appointmentId)
    if (before.status === 'cancelled') return { output: { appointmentId: before.id, status: 'cancelled', alreadyCancelled: true }, target: { type: 'appointment', id: before.id } }
    await updateAppointment(ctx.db, ctx.orgId, input.appointmentId, { status: 'cancelled' }, { userId: ctx.user.id, actorType: ctx.source === 'inmo' ? 'ai' : 'user', env: ctx.env })
    return { output: { appointmentId: before.id, status: 'cancelled' }, target: { type: 'appointment', id: before.id } }
  },
}

const createTaskTool: DomainTool = {
  name: 'create_task',
  description: 'Crea una Task real (actualiza la próxima acción del lead y queda en Activity).',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf(
    { title: { type: 'string' }, type: { type: 'string', enum: [...TASK_TYPES] }, dueAt: { type: 'string', description: WHEN_DESC }, assigneeId: { type: 'integer' }, leadId: { type: 'integer' }, contactId: { type: 'integer' } },
    ['title'],
  ),
  parse: (o) => ({
    title: v.str(o, 'title', { required: true, max: 200 })!,
    type: v.oneOf(o, 'type', TASK_TYPES) ?? 'other',
    dueAt: v.datetime(o, 'dueAt'),
    assigneeId: v.int(o, 'assigneeId', { min: 1 }),
    leadId: v.int(o, 'leadId', { min: 1 }),
    contactId: v.int(o, 'contactId', { min: 1 }),
  }),
  async run(ctx, input) {
    // createTask() comprueba que lead, contacto y responsable sean de esta organización.
    const task = await createTask(ctx.db, ctx.orgId, { type: input.type, title: input.title, dueAt: input.dueAt ?? null, assigneeId: input.assigneeId ?? null, leadId: input.leadId ?? null, contactId: input.contactId ?? null }, { createdBy: ctx.user.id })
    return { output: { taskId: task.id, title: task.title, dueAt: task.dueAt, status: task.status }, target: { type: 'task', id: task.id } }
  },
}

const sendProperty: DomainTool = {
  name: 'send_property',
  description:
    'Envía la ficha publicable de una propiedad por WhatsApp a un lead, por el Centro de Comunicaciones. Nunca datos internos. Obra nueva tiene que estar publicada y 2ª mano disponible (si no: PROPERTY_NOT_PUBLISHABLE). El PropertyMatch sólo pasa a «enviado» si el proveedor aceptó el envío.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  requiresConfirmation: true,
  idempotent: true,
  inputSchema: schemaOf(
    { leadId: { type: 'integer' }, propertyId: { type: 'integer' }, propertyKind: KIND_SCHEMA, buyerRequirementId: { type: 'integer', description: 'Para marcar el match como enviado.' }, note: { type: 'string' } },
    ['leadId', 'propertyId', 'propertyKind'],
  ),
  parse: (o) => ({
    leadId: v.int(o, 'leadId', { required: true, min: 1 })!,
    propertyId: v.int(o, 'propertyId', { required: true, min: 1 })!,
    propertyKind: v.kind(o),
    buyerRequirementId: v.int(o, 'buyerRequirementId', { min: 1 }),
    note: v.str(o, 'note', { max: 500 }),
  }),
  async run(ctx, input) {
    await loadOwnedLead(ctx.db, ctx.orgId, input.leadId)
    assertPublishable(input.propertyKind, await loadOwnedProperty(ctx.db, ctx.orgId, input.propertyKind, input.propertyId))
    const conversation = await openConversation(ctx.db, ctx.env, ctx.orgId, { leadId: input.leadId })
    const { result } = await sharePropertyInConversation(ctx.event, ctx.db, ctx.env, ctx.orgId, ctx.user.id, conversation.id, {
      propertyId: input.propertyId,
      propertyKind: input.propertyKind,
      note: input.note ?? null,
      buyerRequirementId: input.buyerRequirementId ?? null,
      statusCallbackUrl: `${getRequestURL(ctx.event).origin}/api/comms/webhooks/twilio/status`,
    })
    if (!result.ok) {
      if (result.code === 'provider') throw new ToolError('PROVIDER_ERROR', result.error || 'El proveedor rechazó el envío.')
      throw new ToolError(result.code === 'window_closed' ? 'CONFLICT' : 'VALIDATION_ERROR', result.error || 'No se pudo enviar.', { code: result.code })
    }
    const m = serializeMessage(result.message!) as any
    return { output: { messageId: m.id, conversationId: conversation.id, status: m.status, propertyId: input.propertyId, propertyKind: input.propertyKind }, target: { type: 'comms_message', id: m.id } }
  },
}

const createPropertySelectionTool: DomainTool = {
  name: 'create_property_selection',
  description: 'Guarda una selección persistente de propiedades para un Contacto (con orden y nota por propiedad) — nunca sólo una lista en la conversación.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  idempotent: true,
  inputSchema: schemaOf(
    {
      contactId: { type: 'integer' },
      title: { type: 'string' },
      leadId: { type: 'integer' },
      buyerRequirementId: { type: 'integer' },
      items: { type: 'array', items: { type: 'object', properties: { propertyId: { type: 'integer' }, propertyKind: KIND_SCHEMA, note: { type: 'string' } }, required: ['propertyId', 'propertyKind'] } },
    },
    ['contactId', 'title', 'items'],
  ),
  parse: (o) => {
    if (!Array.isArray(o.items) || !o.items.length) fail('«items» debe ser una lista con al menos una propiedad.')
    return {
      contactId: v.int(o, 'contactId', { required: true, min: 1 })!,
      title: v.str(o, 'title', { required: true, max: 200 })!,
      leadId: v.int(o, 'leadId', { min: 1 }),
      buyerRequirementId: v.int(o, 'buyerRequirementId', { min: 1 }),
      items: (o.items as any[]).slice(0, 30).map((it) => ({ propertyId: v.int(it || {}, 'propertyId', { required: true, min: 1 })!, propertyKind: v.kind(it || {}), note: v.str(it || {}, 'note', { max: 500 }) })),
    }
  },
  async run(ctx, input) {
    const sel = await createPropertySelection(ctx.db, ctx.orgId, input, { createdBy: ctx.user.id })
    return { output: { selectionId: sel!.id, title: sel!.title, contactId: sel!.contactId, items: sel!.items }, target: { type: 'property_selection', id: sel!.id } }
  },
}

const createOfferTool: DomainTool = {
  name: 'create_offer',
  description: 'Crea una oferta en borrador (con su revisión inicial y Activity) por el servicio de ofertas. Nunca cambia el precio de la propiedad.',
  kind: 'write',
  area: 'crm',
  action: 'write',
  requiresConfirmation: true,
  idempotent: true,
  inputSchema: schemaOf(
    { propertyId: { type: 'integer' }, propertyKind: KIND_SCHEMA, buyerContactId: { type: 'integer' }, amount: { type: 'number' }, leadId: { type: 'integer' }, buyerRequirementId: { type: 'integer' }, conditions: { type: 'string' }, expiration: { type: 'string', description: 'AAAA-MM-DD' } },
    ['propertyId', 'propertyKind', 'buyerContactId', 'amount'],
  ),
  parse: (o) => ({
    propertyId: v.int(o, 'propertyId', { required: true, min: 1 })!,
    propertyKind: v.kind(o),
    buyerContactId: v.int(o, 'buyerContactId', { required: true, min: 1 })!,
    amount: v.num(o, 'amount', { required: true, min: 1 })!,
    leadId: v.int(o, 'leadId', { min: 1 }),
    buyerRequirementId: v.int(o, 'buyerRequirementId', { min: 1 }),
    conditions: v.str(o, 'conditions', { max: 2000 }),
    expiration: v.date(o, 'expiration'),
  }),
  async run(ctx, input) {
    await loadOwnedProperty(ctx.db, ctx.orgId, input.propertyKind, input.propertyId)
    // El comercial de la oferta es el del lead, igual que al crearla desde el resultado de una visita.
    const commercialId = input.leadId ? (await loadOwnedLead(ctx.db, ctx.orgId, input.leadId)).agentId : null
    const offer = await createOffer(
      ctx.db,
      ctx.orgId,
      { propertyId: input.propertyId, propertyKind: input.propertyKind, buyerContactId: input.buyerContactId, amount: input.amount, leadId: input.leadId ?? null, buyerRequirementId: input.buyerRequirementId ?? null, commercialId, conditions: input.conditions ?? null, expiration: input.expiration ?? null },
      { createdBy: ctx.user.id },
    )
    return { output: { offerId: offer.id, status: offer.status, amount: offer.currentAmount, propertyId: offer.propertyId, propertyKind: offer.propertyKind }, target: { type: 'offer', id: offer.id } }
  },
}

export const DOMAIN_TOOLS: DomainTool[] = [
  searchProperties,
  getProperty,
  createLeadTool,
  updateLeadTool,
  createContactTool,
  findContacts,
  updateBuyerRequirementsTool,
  findMatches,
  bookViewing,
  rescheduleViewing,
  cancelViewing,
  createTaskTool,
  sendProperty,
  createPropertySelectionTool,
  createOfferTool,
]
