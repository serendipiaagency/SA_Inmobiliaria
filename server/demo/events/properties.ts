import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { adminResources } from '../../utils/adminResources'
import { markFeaturesReviewed } from '../../utils/matching/service'
import { updatePropertyPrice } from '../../utils/bulkActions/propertyActions'
import { saveEntityCustomFields } from '../../utils/customFields/service'
import { addTagToEntity } from '../../utils/tags/service'
import { ctxId, ctxSetId, dayAt, type DemoContext } from '../context'
import { actingUser, contactId, orgId, propertyId, uploadDemoAsset } from '../helpers'
import { COMMUNITIES } from '../dataset/company'
import { PROPERTIES, type DemoProperty } from '../dataset/properties'
import { mediaAlt } from '../dataset/media'
import type { TimelineBuilder } from '../timeline'

/**
 * Captación de las 20 propiedades, cada una en su día: ficha completa por el
 * alta del panel (validación, ficha ampliada, estado comercial), galería con
 * portada, alt y orden, propietarios, características repasadas (para que el
 * matching distinga «no tiene» de «no consta») y los cambios de precio
 * posteriores con su motivo, por la misma función que la acción del panel.
 */

const ORIENTACION: Record<string, string> = {
  p01: 'Primera vivienda', p02: 'Lujo', p03: 'Primera vivienda', p04: 'Lujo', p05: 'Primera vivienda', p06: 'Segunda residencia', p07: 'Segunda residencia', p08: 'Primera vivienda', p09: 'Primera vivienda', p10: 'Lujo',
  p11: 'Primera vivienda', p12: 'Inversión', p13: 'Primera vivienda', p14: 'Lujo', p15: 'Primera vivienda', p16: 'Segunda residencia', p17: 'Segunda residencia', p18: 'Inversión', p19: 'Segunda residencia', p20: 'Segunda residencia',
}
const LLAVES: Record<string, string> = { p02: 'Portero / conserje', p11: 'En oficina', p12: 'En oficina', p13: 'Las tiene la propiedad', p14: 'Las tiene la propiedad', p15: 'En oficina', p16: 'Caja de seguridad', p17: 'En oficina', p18: 'En oficina', p19: 'Caja de seguridad', p20: 'En oficina' }
const TAGS: Record<string, string[]> = {
  p01: ['Obra nueva', 'Terraza'], p02: ['Ático', 'Terraza', 'Centro'], p03: ['Obra nueva', 'Piscina'], p04: ['Vistas al mar', 'Ático'], p06: ['Jardín', 'Cerca de la playa'], p07: ['Cerca de la playa'], p10: ['Vistas al mar', 'Lujo', 'Piscina'],
  p11: ['Exclusiva', 'Reformado'], p12: ['Inversión', 'Para reformar'], p14: ['Jardín', 'Lujo'], p16: ['Vistas al mar'], p17: ['Vistas al mar', 'Terraza'], p19: ['Casa de piedra', 'Exclusiva'], p20: ['Casa de piedra'],
}

const yes = (v: boolean | undefined) => (v ? 1 : 0)

function initialPrice(p: DemoProperty): number {
  return p.priceHistory?.[0]?.price ?? p.price
}

async function captureProperty(ctx: DemoContext, p: DemoProperty) {
  const actor = actingUser(ctx, p.commercial)
  const resource = p.kind === 'developer' ? 'developer-properties' : 'properties'
  const community = p.community ? COMMUNITIES.find((c) => c.key === p.community)!.name : null
  const exclusive = p.exclusive
  const core: Record<string, any> = {
    slug: `${p.key}-${p.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`,
    propertyType: p.propertyType,
    transactionType: p.transactionType,
    price: initialPrice(p),
    city: p.city,
    district: p.district,
    postalCode: p.postalCode,
    street: p.street,
    country: 'España',
    lat: p.lat,
    lng: p.lng,
    locationPrivacy: p.privacy,
    locationPrivacyRadius: p.privacy === 'approximate' ? 300 : null,
    area: p.area,
    usableArea: p.usableArea,
    plotArea: p.plotArea ?? null,
    terraceArea: p.terraceArea ?? null,
    gardenArea: p.gardenArea ?? null,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    floor: p.floor ?? null,
    yearBuilt: p.yearBuilt,
    condition: p.condition,
    energyRating: p.energyRating,
    orientation: p.orientation,
    hasElevator: yes(p.features.elevator),
    hasGarage: yes(p.features.garage),
    hasTerrace: yes(p.features.terrace),
    hasGarden: yes(p.features.garden),
    hasPool: yes(p.features.pool),
    petsAllowed: yes(p.features.pets),
    accessible: yes(p.features.accessible),
    garageSpaces: p.features.garage ? (p.key === 'p04' ? 2 : 1) : 0,
    livingRooms: 1,
    kitchens: 1,
    furnished: p.transactionType === 'rent' ? 'yes' : 'no',
    keyHighlights: p.highlights.join('\n'),
    agentId: ctxId(ctx, `tm:${p.commercial}`),
    agencyReference: `NA-${p.key.toUpperCase()}`,
    captureDate: dayAt(ctx.state.anchorDay!, p.days),
    captureSource: p.captureSource,
    mandateType: p.mandateType ?? null,
    isExclusive: exclusive ? 1 : 0,
    exclusiveFrom: exclusive ? dayAt(ctx.state.anchorDay!, exclusive.fromDays) : null,
    exclusiveUntil: exclusive ? dayAt(ctx.state.anchorDay!, exclusive.untilDays) : null,
    publishedAt: dayAt(ctx.state.anchorDay!, p.days + 2),
    serviceChargeAnnual: p.serviceChargeAnnual ?? null,
    rentalYield: p.rentalYield ?? null,
    hasTour: 0,
    // Ficha ampliada (property_details / property_legal_economics).
    subtype: p.subtype,
    officeId: ctxId(ctx, `office:${p.office}`),
    teamId: ctxId(ctx, `team:${p.team}`),
    commercialStatus: 'available',
    municipality: p.municipality,
    neighborhood: p.district,
    streetType: p.streetType,
    renovationYear: p.renovationYear ?? null,
    ...p.sheet,
    ...p.legal,
  }
  if (p.kind === 'developer') {
    Object.assign(core, {
      name: p.title,
      description: p.description,
      developerId: ctxId(ctx, `dev:${p.developer}`),
      community,
      status: p.buildStatus ?? 'new',
      handoverDate: p.handover ?? null,
    })
  } else {
    Object.assign(core, {
      location: `${p.district}, ${p.city}`,
      community,
      status: 'available',
      translations: [{ locale: 'es', title: p.title, description: p.description }],
    })
  }

  const def = adminResources[resource]
  const { id } = await insertResourceRecord(ctx.db, resource, def, core, { orgId: orgId(ctx), user: actor, event: ctx.event })
  ctxSetId(ctx, `prop:${p.key}`, id)

  // Galería: portada + fotos ordenadas, con texto alternativo y publicables.
  const galleryResource = p.kind === 'developer' ? 'project-images' : 'gallery-images'
  let cover: string | null = null
  for (const [i, path] of p.gallery.entries()) {
    const key = await uploadDemoAsset(ctx, path, { category: 'property-photo', entityType: resource, entityId: id, createdBy: actor.id })
    if (i === 0) cover = key
    const parent = p.kind === 'developer' ? { developerPropertyId: id } : { propertyId: id }
    await insertResourceRecord(ctx.db, galleryResource, adminResources[galleryResource], { ...parent, image: key, sortOrder: i + 1, title: p.title, alt: mediaAlt(path, p.title), language: 'es', isPublishable: 1, isPrivate: 0, isHidden: 0 }, { orgId: orgId(ctx), user: actor, event: ctx.event })
  }
  if (p.kind === 'developer') await ctx.db.update(schema.developerProperties).set({ coverImage: cover }).where(eq(schema.developerProperties.id, id))
  else await ctx.db.update(schema.agentProperties).set({ mainImage: cover }).where(eq(schema.agentProperties.id, id))

  // Propietarios (PropertyContact): uno, copropietarios o representante.
  for (const o of p.owners ?? []) {
    await insertResourceRecord(ctx.db, 'property-contacts', adminResources['property-contacts'], { propertyKind: p.kind, propertyId: id, contactId: contactId(ctx, o.contact), role: o.role, ownershipPct: o.pct ?? null, isPrimary: o.primary ? 1 : 0 }, { orgId: orgId(ctx), user: actor, event: ctx.event })
  }

  await markFeaturesReviewed(ctx.event, orgId(ctx), id, p.kind, actor.id)
  const values: Record<string, unknown> = { orientacion_comercial: ORIENTACION[p.key] }
  if (LLAVES[p.key]) values.llaves = LLAVES[p.key]
  await saveEntityCustomFields(ctx.db, orgId(ctx), actor.id, { entityType: 'property', entityKind: p.kind, entityId: id }, values)
  for (const name of TAGS[p.key] ?? []) {
    await addTagToEntity(ctx.db, orgId(ctx), ['agent', 'developer'], { entityType: p.kind, entityId: id, name })
  }
}

export function addPropertyEvents(tl: TimelineBuilder): void {
  for (const p of PROPERTIES) {
    tl.add(p.days, '10:30', `Captación ${p.key}`, (ctx) => captureProperty(ctx, p))
    const history = p.priceHistory ?? []
    history.forEach((h, i) => {
      const next = history[i + 1]?.price ?? p.price
      tl.add(h.days, '12:15', `Cambio de precio ${p.key}`, async (ctx) => {
        await updatePropertyPrice(ctx.event, orgId(ctx), p.kind, propertyId(ctx, p.key), { price: next, reason: h.reason }, actingUser(ctx, p.commercial).id)
      })
    })
  }
}
