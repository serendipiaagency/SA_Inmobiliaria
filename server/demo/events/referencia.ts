import { and, asc, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../../utils/db'
import { adminResources, buildPayload, syncTranslations } from '../../utils/adminResources'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { authorizeRecord } from '../../utils/tenantPolicy'
import { extractSheetPayload, hasSheetChanges, savePropertySheet } from '../../utils/properties/extendedSheet'
import { normalizeMediaMetadata } from '../../utils/properties/media'
import { createPropertyDocumentFromUpload } from '../../utils/properties/documents'
import { saveEntityCustomFields } from '../../utils/customFields/service'
import { addTagToEntity } from '../../utils/tags/service'
import { dayAt, type DemoContext } from '../context'
import { actingUser, orgId, propertyId, uploadDemoAsset } from '../helpers'
import { DEVELOPERS } from '../dataset/company'
import { PROPERTIES, type DemoProperty } from '../dataset/properties'
import { REFERENCE_CONTENT, type ReferenceContent } from '../dataset/referencia'
import { renderDemoDocumentPdf } from '../pdf'
import type { TimelineBuilder } from '../timeline'

/**
 * Las cuatro propiedades de referencia de la cuenta demo (server/demo/reference.ts):
 * dos de Propiedades (web) —el chalet p10 y el ático p02— y dos de
 * Propiedades 2ª mano —el piso p11 y la casa p19—, llevadas a todo lo que el
 * editor admite (dataset/referencia.ts).
 *
 * Cada propiedad se enriquece en pasos separados (ficha, estancias, fotos,
 * planos, documentos): cada uno cabe holgado en el presupuesto de consultas de
 * una invocación, y al restablecer una demo ya sembrada el ejecutor sólo corre
 * los pasos que su instantánea no tiene. Todos son idempotentes (se reconocen
 * por su contenido y no duplican): ejecutarlos dos veces deja lo mismo.
 *
 * La ficha se guarda por las mismas funciones que el editor (`buildPayload`,
 * `extractSheetPayload`, `savePropertySheet`, `syncTranslations`), y los
 * hijos —estancias, planos, documentos— por el mismo alta que el panel.
 */

const resourceOf = (p: DemoProperty) => (p.kind === 'developer' ? 'developer-properties' : 'properties')
const parentKey = (p: DemoProperty) => (p.kind === 'developer' ? 'developerPropertyId' : 'propertyId')

async function enrichSheet(ctx: DemoContext, p: DemoProperty, c: ReferenceContent) {
  const actor = actingUser(ctx, p.commercial)
  const resource = resourceOf(p)
  const def = adminResources[resource]
  const id = propertyId(ctx, p.key)
  const body: Record<string, any> = { ...c.fields, keyHighlights: c.highlights.join('\n') }
  if (p.kind === 'developer') {
    body.description = c.description
    // Logo de la promotora y, en el chalet, el esquema de la parcela como plano de situación de la finca.
    const dev = DEVELOPERS.find((d) => d.key === p.developer)
    if (dev?.logo) body.logo = await uploadDemoAsset(ctx, dev.logo, { category: 'logo' })
    if (p.key === 'p10') body.masterPlanImage = await uploadDemoAsset(ctx, 'planos/p10-parcela.png', { category: 'property-photo', entityType: resource, entityId: id, createdBy: actor.id })
  }
  const data = await buildPayload(def, body, false, ctx.event)
  delete data.organizationId
  const sheet = extractSheetPayload(body)
  const { authorized } = await authorizeRecord(ctx.db, { resourceKey: resource, table: def.table, policy: def.tenantPolicy, id, orgId: orgId(ctx) })
  if (Object.keys(data).length) await ctx.db.update(def.table).set({ ...data, updatedAt: now() }).where(and(eq(def.table.id, id), eq((def.table as any).organizationId, orgId(ctx))))
  if (hasSheetChanges(sheet)) await savePropertySheet(ctx.db, orgId(ctx), p.kind, id, sheet, actor.id)
  // 2ª mano: la descripción vive en la traducción al español (el editor la guarda igual).
  if (p.kind === 'agent') await syncTranslations(ctx.db, def, authorized, [{ locale: 'es', title: p.title, description: c.description }])
  await saveEntityCustomFields(ctx.db, orgId(ctx), actor.id, { entityType: 'property', entityKind: p.kind, entityId: id }, c.customFields)
  for (const name of c.tags) await addTagToEntity(ctx.db, orgId(ctx), ['agent', 'developer'], { entityType: p.kind, entityId: id, name })
}

async function enrichRooms(ctx: DemoContext, p: DemoProperty, c: ReferenceContent) {
  const actor = actingUser(ctx, p.commercial)
  const resource = p.kind === 'developer' ? 'developer-property-rooms' : 'agent-property-rooms'
  const table: any = p.kind === 'developer' ? schema.developerPropertyRooms : schema.agentPropertyRooms
  const id = propertyId(ctx, p.key)
  const existing = await ctx.db.select({ name: table.name }).from(table).where(eq(table[parentKey(p)], id))
  const have = new Set(existing.map((r: any) => r.name))
  for (const [i, r] of c.rooms.entries()) {
    if (have.has(r.name)) continue
    await insertResourceRecord(ctx.db, resource, adminResources[resource], { [parentKey(p)]: id, type: r.type, name: r.name, area: r.area, floor: r.floor, orientation: r.orientation ?? null, notes: r.notes ?? null, sortOrder: i + 1 }, { orgId: orgId(ctx), user: actor, event: ctx.event })
  }
  // Obra nueva: la tipología de la promoción («Tipos de unidad»).
  if (p.kind === 'developer') {
    const types = await ctx.db.select({ unitType: schema.propertyTypes.unitType }).from(schema.propertyTypes).where(eq(schema.propertyTypes.developerPropertyId, id))
    const haveTypes = new Set(types.map((t: any) => t.unitType))
    for (const u of c.unitTypes ?? []) {
      if (haveTypes.has(u.unitType)) continue
      await insertResourceRecord(ctx.db, 'property-types', adminResources['property-types'], { developerPropertyId: id, ...u }, { orgId: orgId(ctx), user: actor, event: ctx.event })
    }
  }
}

/** Estancia, texto alternativo, título y descripción de cada foto, por su orden en la galería (la captación las numeró 1, 2, 3…). */
async function classifyPhotos(ctx: DemoContext, p: DemoProperty, c: ReferenceContent) {
  const table: any = p.kind === 'developer' ? schema.images : schema.propertyGalleryImages
  const id = propertyId(ctx, p.key)
  const rows = await ctx.db.select({ id: table.id, sortOrder: table.sortOrder }).from(table).where(eq(table[parentKey(p)], id)).orderBy(asc(table.sortOrder), asc(table.id))
  const bySort = new Map<number, number>(rows.map((r: any) => [r.sortOrder, r.id]))
  for (const photo of c.photos) {
    const index = p.gallery.indexOf(photo.path)
    const rowId = index >= 0 ? bySort.get(index + 1) : undefined
    if (!rowId) continue
    const meta = normalizeMediaMetadata({ title: photo.title, alt: photo.alt, description: photo.description, room: photo.room })
    await ctx.db.update(table).set(meta).where(and(eq(table.id, rowId), eq(table[parentKey(p)], id)))
  }
}

async function addPlans(ctx: DemoContext, p: DemoProperty, c: ReferenceContent) {
  const actor = actingUser(ctx, p.commercial)
  const resource = p.kind === 'developer' ? 'floor-plans' : 'agent-property-floor-plans'
  const table: any = p.kind === 'developer' ? schema.floorPlans : schema.agentPropertyFloorPlans
  const id = propertyId(ctx, p.key)
  const existing = await ctx.db.select({ title: table.title }).from(table).where(eq(table[parentKey(p)], id))
  const have = new Set(existing.map((r: any) => r.title))
  for (const [i, plan] of c.plans.entries()) {
    if (have.has(plan.title)) continue
    const key = await uploadDemoAsset(ctx, plan.file, { category: 'property-photo', entityType: resource, entityId: id, createdBy: actor.id })
    await insertResourceRecord(ctx.db, resource, adminResources[resource], { [parentKey(p)]: id, title: plan.title, image: key, category: plan.category, unitType: plan.unitType, floorDetails: plan.floorDetails, sizes: plan.sizes, type: plan.type, sortOrder: i + 1, isPublic: 1 }, { orgId: orgId(ctx), user: actor, event: ctx.event })
  }
}

async function addDocuments(ctx: DemoContext, p: DemoProperty, c: ReferenceContent) {
  const actor = actingUser(ctx, p.commercial)
  const id = propertyId(ctx, p.key)
  const existing = await ctx.db
    .select({ title: schema.propertyDocuments.title })
    .from(schema.propertyDocuments)
    .where(and(eq(schema.propertyDocuments.organizationId, orgId(ctx)), eq(schema.propertyDocuments.propertyKind, p.kind), eq(schema.propertyDocuments.propertyId, id)))
  const have = new Set(existing.map((r: any) => r.title))
  const base = { propertyKind: p.kind, propertyId: String(id) }
  const text = (name: string, value: string) => ({ name, data: new TextEncoder().encode(value) })
  const send = async (fields: Record<string, string>, filename: string, type: string, data: Uint8Array) => {
    const parts = [...Object.entries({ ...base, ...fields }).map(([k, v]) => text(k, v)), { name: 'file', filename, type, data }]
    await createPropertyDocumentFromUpload(ctx.event, ctx.db, orgId(ctx), actor, parts)
  }
  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  for (const doc of c.documents) {
    if (have.has(doc.title)) continue
    const pdf = await renderDemoDocumentPdf({ title: doc.title, subtitle: `${p.title} · ${p.city}`, sections: doc.sections, footer: 'Norte Astur Inmobiliaria (cuenta demo)' })
    await send({ docType: doc.docType, title: doc.title, visibility: doc.visibility, issuedAt: dayAt(ctx.state.anchorDay!, p.days + doc.issuedDays), notes: doc.notes }, `${slug(doc.title)}.pdf`, 'application/pdf', pdf)
  }
  // El plano también como documento (la imagen del plano de cada planta), para quien lo descarga desde «Documentos».
  for (const plan of c.plans) {
    const title = `${plan.title} (plano de demostración)`
    if (have.has(title)) continue
    const bytes = await ctx.assets.load(plan.file)
    await send({ docType: 'plans', title, visibility: p.kind === 'developer' ? 'public' : 'authorized_buyer', issuedAt: dayAt(ctx.state.anchorDay!, p.days + 3), notes: 'Esquema de demostración sin validez legal, dibujado a partir de las estancias de la ficha.' }, plan.file.split('/').pop()!, 'image/png', bytes)
  }
}

export function addReferenceEvents(tl: TimelineBuilder): void {
  for (const c of REFERENCE_CONTENT) {
    const p = PROPERTIES.find((x) => x.key === c.key)
    if (!p) throw new Error(`Demo: la propiedad de referencia ${c.key} no existe`)
    // Después de la captación de la propiedad (y de su galería); cada paso, en su minuto.
    const day = p.days + 4
    tl.add(day, '11:00', `Referencia ${p.key}: ficha completa`, (ctx) => enrichSheet(ctx, p, c))
    tl.add(day, '11:10', `Referencia ${p.key}: estancias`, (ctx) => enrichRooms(ctx, p, c))
    tl.add(day, '11:20', `Referencia ${p.key}: fotos clasificadas`, (ctx) => classifyPhotos(ctx, p, c))
    tl.add(day, '11:30', `Referencia ${p.key}: planos`, (ctx) => addPlans(ctx, p, c))
    tl.add(day, '11:40', `Referencia ${p.key}: documentos`, (ctx) => addDocuments(ctx, p, c))
  }
}
