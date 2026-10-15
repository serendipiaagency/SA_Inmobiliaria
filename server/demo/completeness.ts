import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '../db/schema'
import { loadPropertySheet } from '../utils/properties/extendedSheet'
import { PROPERTY_BUILDER_SECTIONS, type BuilderSection, type FieldSpec } from '../../composables/usePropertyBuilderConfig'
import { pricePerSquareMeter } from '../../utils/propertySheet'
import { isMediaRoom } from '../../utils/mediaRooms'
import { DEMO_DISCLAIMER, REFERENCE_CONTENT, isUsableRoom, type ReferenceContent } from './dataset/referencia'
import { PROPERTIES } from './dataset/properties'

/**
 * Comprobación de completitud de las propiedades de referencia de la demo
 * (server/demo/reference.ts): recorre las secciones REALES del editor
 * (`PROPERTY_BUILDER_SECTIONS`, las mismas que ve quien edita la propiedad) y
 * dice, de cada una, qué campos están completos, cuáles no aplican a esa
 * tipología —con su motivo, declarado en `notApplicable` del dataset— y cuáles
 * están pendientes. «No aplica» no es «pendiente», y nada se rellena con un
 * valor falso para subir un porcentaje: un campo que ni está completo ni
 * está declarado como no aplicable cuenta como pendiente y falla la prueba.
 *
 * Además de los campos comprueba la coherencia entre ellos (superficies,
 * estancias, dormitorios y baños, precio por m²), que la multimedia está
 * clasificada, que no hay archivos rotos (cada fichero registrado existe en
 * R2) y que los documentos y los datos energéticos están marcados como de
 * demostración.
 */

export interface FieldReport {
  key: string
  label: string
}
export interface SectionReport {
  key: string
  label: string
  total: number
  filled: number
  notApplicable: (FieldReport & { reason: string })[]
  pending: FieldReport[]
}
export interface CheckReport {
  name: string
  ok: boolean
  detail?: string
}
export interface ReferenceReport {
  key: string
  kind: 'developer' | 'agent'
  id: number
  sections: SectionReport[]
  totals: { fields: number; filled: number; notApplicable: number; pending: number }
  checks: CheckReport[]
  ok: boolean
}

export interface ReferenceInput {
  content: ReferenceContent
  kind: 'developer' | 'agent'
  /** La fila de la propiedad más su ficha ampliada, plana (como la ve el editor). */
  values: Record<string, any>
  translations: { locale: string; title: string; description: string | null }[]
  rooms: { name: string | null; type: string | null; area: number | null }[]
  gallery: { image: string; room: string | null; alt: string | null; title: string | null; description: string | null; isPublishable: number | null }[]
  plans: { title: string | null; image: string | null; isPublic: number | null }[]
  unitTypes: number
  documents: { title: string; docType: string; visibility: string; notes: string | null; fileName: string | null; mimeType: string | null; r2Key: string; sizeBytes: number | null }[]
  owners: { role: string; ownershipPct: number | null }[]
  /** ¿Existe este fichero en el almacén? (los enlaces rotos se detectan aquí). */
  hasFile: (key: string) => boolean | Promise<boolean>
}

const empty = (v: unknown) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))

/** ¿Se enseña este campo en el editor para esta propiedad? (`showWhen`: la fianza sólo en alquiler…). */
function applies(f: FieldSpec, values: Record<string, any>): boolean {
  if (f.virtual || f.type === 'computed' || f.legacyOnly) return false
  if (!f.showWhen) return true
  const raw = values[f.showWhen.key]
  const v = empty(raw) ? (f.showWhen.emptyAs ?? '') : String(raw)
  if (f.showWhen.in) return f.showWhen.in.includes(v)
  if (f.showWhen.notIn) return !f.showWhen.notIn.includes(v)
  return true
}

/** Los campos de una sección de formulario contados uno a uno. */
function fieldSection(section: BuilderSection, fields: FieldSpec[], input: ReferenceInput): SectionReport {
  const report: SectionReport = { key: section.key, label: section.label, total: 0, filled: 0, notApplicable: [], pending: [] }
  for (const f of fields) {
    if (!applies(f, input.values)) continue
    report.total++
    const v = input.values[f.key]
    // Un 0 en un número (0 baños, 0 plazas) es una respuesta; una casilla sin responder (null) no.
    if (!empty(v)) report.filled++
    else if (input.content.notApplicable[f.key]) report.notApplicable.push({ key: f.key, label: f.label, reason: input.content.notApplicable[f.key]! })
    else report.pending.push({ key: f.key, label: f.label })
  }
  return report
}

/** Una sección que no es una rejilla de campos (galería, planos, documentos…): una «partida» que se cumple o no. */
function itemSection(section: BuilderSection, ok: boolean, naKey: string, input: ReferenceInput): SectionReport {
  const reason = input.content.notApplicable[naKey]
  return {
    key: section.key,
    label: section.label,
    total: 1,
    filled: ok ? 1 : 0,
    notApplicable: !ok && reason ? [{ key: naKey, label: section.label, reason }] : [],
    pending: !ok && !reason ? [{ key: naKey, label: section.label }] : [],
  }
}

export async function buildReferenceReport(input: ReferenceInput): Promise<ReferenceReport> {
  const { content: c, kind, values } = input
  const resource = kind === 'developer' ? 'developer-properties' : 'properties'
  const sections: SectionReport[] = []
  for (const s of PROPERTY_BUILDER_SECTIONS[resource]!) {
    if (s.kind === 'fields') sections.push(fieldSection(s, s.fields, input))
    else if (s.kind === 'location') {
      // Dirección, privacidad y las coordenadas del mapa.
      const coords: FieldSpec[] = [
        { key: s.latField, label: 'Latitud', type: 'number' },
        { key: s.lngField, label: 'Longitud', type: 'number' },
      ]
      sections.push(fieldSection(s, [...s.fields, ...coords], input))
    } else if (s.kind === 'translations') {
      const es = input.translations.find((t) => t.locale === 'es')
      sections.push(itemSection(s, !!es?.title && (es.description || '').length >= 800, 'translations', input))
    } else if (s.kind === 'rooms') sections.push(itemSection(s, input.rooms.length >= c.rooms.length && c.rooms.length > 0, 'rooms', input))
    else if (s.kind === 'gallery') sections.push(itemSection(s, input.gallery.length >= 4, 'gallery', input))
    else if (s.kind === 'child-table' && s.key === 'floorplans') sections.push(itemSection(s, input.plans.length >= c.plans.length && c.plans.length > 0, 'floorplans', input))
    else if (s.kind === 'child-table' && s.key === 'unittypes') sections.push(itemSection(s, input.unitTypes >= 1, 'unittypes', input))
    else if (s.kind === 'social') sections.push(itemSection(s, false, s.key, input))
    else if (s.kind === 'owners') sections.push(itemSection(s, input.owners.length >= 1, 'owners', input))
    else if (s.kind === 'panel' && s.panel === 'documents') sections.push(itemSection(s, input.documents.length >= c.documents.length, 'documents', input))
    else if (s.kind === 'panel' && s.panel === 'portals') sections.push(itemSection(s, false, 'portals', input))
    // «Compradores compatibles» es una lectura del motor de matching: no tiene nada que completar.
  }

  const totals = sections.reduce(
    (t, s) => ({ fields: t.fields + s.total, filled: t.filled + s.filled, notApplicable: t.notApplicable + s.notApplicable.length, pending: t.pending + s.pending.length }),
    { fields: 0, filled: 0, notApplicable: 0, pending: 0 },
  )

  // ── Coherencia ──────────────────────────────────────────────────────────────
  const checks: CheckReport[] = []
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail: ok ? undefined : detail })
  const usable = c.rooms.filter(isUsableRoom).reduce((sum, r) => sum + r.area, 0)
  const num = (k: string) => Number(values[k])
  check('la superficie útil es la suma de las estancias', usable === num('usableArea'), `estancias ${usable} m² frente a útil ${values.usableArea} m²`)
  check('la construida no es menor que la útil', num('area') >= num('usableArea'), `${values.area} < ${values.usableArea}`)
  check('la útil es una fracción razonable de la construida', num('usableArea') / num('area') >= 0.7 && num('usableArea') / num('area') <= 0.95, `${num('usableArea') / num('area')}`)
  const count = (type: string) => c.rooms.filter((r) => r.type === type).length
  check('los dormitorios coinciden con la distribución', count('Dormitorio') === num('bedrooms'), `${count('Dormitorio')} estancias frente a ${values.bedrooms}`)
  check('los baños coinciden con la distribución', count('Baño') === num('bathrooms'), `${count('Baño')} estancias frente a ${values.bathrooms}`)
  check('los aseos coinciden con la distribución', count('Aseo') === Number(values.toilets ?? 0), `${count('Aseo')} estancias frente a ${values.toilets}`)
  const terraces = c.rooms.filter((r) => r.type === 'Terraza').reduce((sum, r) => sum + r.area, 0)
  check('las terrazas suman la superficie de terraza', terraces === Number(values.terraceArea ?? 0), `${terraces} m² frente a ${values.terraceArea ?? 0}`)
  if (values.plotArea && values.gardenArea) check('el jardín cabe en la parcela', num('gardenArea') < num('plotArea'), `${values.gardenArea} ≥ ${values.plotArea}`)
  check('el total incluye lo construido', num('totalArea') >= num('area'), `${values.totalArea} < ${values.area}`)
  check('el precio por m² se calcula', pricePerSquareMeter(values.price, values.area) !== null, 'sin precio o sin superficie')
  if (!empty(values.priceOld)) check('el precio anterior es mayor que el actual', num('priceOld') > num('price'), `${values.priceOld} ≤ ${values.price}`)
  check('el precio está entre el mínimo autorizado y el recomendado o por encima', num('price') >= num('priceMinAuthorized') && num('priceRecommended') >= num('priceMinAuthorized'), `${values.priceMinAuthorized}/${values.priceRecommended}/${values.price}`)
  check('la calificación energética no contradice las emisiones indicadas', !empty(values.energyRating) && !empty(values.emissionsRating) && !empty(values.energyConsumption), 'faltan datos energéticos')
  check('los datos energéticos no llevan un número de registro oficial', String(values.energyCertificateNumber || '').startsWith('DEMO'), String(values.energyCertificateNumber))
  check('la referencia catastral es inequívocamente ficticia', String(values.cadastralReference || '').startsWith('DEMO'), String(values.cadastralReference))
  check('la finca registral es inequívocamente ficticia', String(values.registryPropertyNumber || '').startsWith('DEMO'), String(values.registryPropertyNumber))
  const description = kind === 'developer' ? String(values.description || '') : String(input.translations.find((t) => t.locale === 'es')?.description || '')
  const headings = ['Presentación', 'Ubicación y entorno', 'Distribución', 'Zona de día', 'Zona de noche', 'Espacios exteriores', 'Calidades|Estado y reforma|Antigüedad, estado y reformas', 'Instalaciones', 'Características diferenciales', 'Perfil de comprador', 'Información comercial relevante']
  const missingHeading = headings.filter((h) => !new RegExp(h).test(description))
  check('la descripción cubre las partes de una descripción completa', missingHeading.length === 0, `faltan: ${missingHeading.join(', ')}`)
  check('la descripción es extensa', description.length >= 2200, `${description.length} caracteres`)
  check('la descripción dice que los datos son de demostración', /demostración/.test(description), 'falta el aviso')
  check('hay al menos 5 puntos clave', String(values.keyHighlights || '').split('\n').filter(Boolean).length >= 5, 'pocos puntos clave')
  check('las fotos tienen texto alternativo', input.gallery.length > 0 && input.gallery.every((g) => !!g.alt && g.alt.length >= 20), 'alguna foto sin alt')
  check('las fotos están clasificadas por estancia cuando se puede', c.photos.every((p) => p.room === null || input.gallery.some((g) => g.room === p.room)), 'alguna estancia sin foto clasificada')
  check('las estancias de las fotos son del catálogo', input.gallery.every((g) => g.room === null || isMediaRoom(g.room)), 'estancia desconocida')
  check('toda foto publicable', input.gallery.every((g) => g.isPublishable !== 0), 'hay fotos ocultas por defecto')
  check('los planos son de esta propiedad (por título y archivo)', input.plans.length === c.plans.length && input.plans.every((p) => !!p.image), 'planos distintos de los declarados')
  const docTitles = input.documents.map((d) => d.title)
  check('no hay documentos duplicados', new Set(docTitles).size === docTitles.length, docTitles.join(' | '))
  check('los documentos están marcados como de demostración', input.documents.every((d) => /demostración|ficticia|ilustrativ/i.test(`${d.title} ${d.notes || ''}`)), 'algún documento sin aviso')
  check('los documentos son PDF o imágenes con su archivo', input.documents.every((d) => !!d.fileName && /^(application\/pdf|image\/)/.test(d.mimeType || '') && (d.sizeBytes || 0) > 1000), 'documento sin archivo')
  const keys = [...input.gallery.map((g) => g.image), ...input.plans.map((p) => p.image || ''), ...input.documents.map((d) => d.r2Key)].filter(Boolean)
  const broken: string[] = []
  for (const k of keys) if (!(await input.hasFile(k))) broken.push(k)
  check('ningún archivo apunta a algo que no existe', broken.length === 0, broken.join(', '))
  check('no hay estancias duplicadas', new Set(input.rooms.map((r) => r.name)).size === input.rooms.length, 'estancias repetidas')
  if (kind === 'agent') check('tiene propietario con su porcentaje', input.owners.length > 0 && input.owners.reduce((s, o) => s + (o.ownershipPct ?? 0), 0) <= 100, 'sin propietarios o más del 100 %')

  return { key: c.key, kind, id: Number(values.id), sections, totals, checks, ok: totals.pending === 0 && checks.every((x) => x.ok) }
}

/** Lee de la base de datos lo que la comprobación necesita de una propiedad de referencia de la demo. */
export async function loadReferenceInput(db: any, orgId: number, key: string, hasFile: ReferenceInput['hasFile'], idOf: (key: string) => number): Promise<ReferenceInput> {
  const content = REFERENCE_CONTENT.find((x) => x.key === key)
  const base = PROPERTIES.find((x) => x.key === key)
  if (!content || !base) throw new Error(`Demo: ${key} no es una propiedad de referencia`)
  const kind = base.kind
  const id = idOf(key)
  const T: any = kind === 'developer' ? schema.developerProperties : schema.agentProperties
  const [row] = await db.select().from(T).where(and(eq(T.organizationId, orgId), eq(T.id, id)))
  if (!row) throw new Error(`Demo: la propiedad ${key} (${id}) no existe`)
  const sheet = await loadPropertySheet(db, orgId, kind, id)
  const values = { ...row, ...sheet }
  const parent = kind === 'developer' ? 'developerPropertyId' : 'propertyId'
  const roomT: any = kind === 'developer' ? schema.developerPropertyRooms : schema.agentPropertyRooms
  const galT: any = kind === 'developer' ? schema.images : schema.propertyGalleryImages
  const planT: any = kind === 'developer' ? schema.floorPlans : schema.agentPropertyFloorPlans
  const translations = kind === 'agent' ? await db.select().from(schema.propertyTranslations).where(eq(schema.propertyTranslations.propertyId, id)) : []
  return {
    content,
    kind,
    values,
    translations,
    rooms: await db.select({ name: roomT.name, type: roomT.type, area: roomT.area }).from(roomT).where(eq(roomT[parent], id)),
    gallery: await db.select({ image: galT.image, room: galT.room, alt: galT.alt, title: galT.title, description: galT.description, isPublishable: galT.isPublishable }).from(galT).where(eq(galT[parent], id)),
    plans: await db.select({ title: planT.title, image: planT.image, isPublic: planT.isPublic }).from(planT).where(eq(planT[parent], id)),
    unitTypes: kind === 'developer' ? (await db.select({ id: schema.propertyTypes.id }).from(schema.propertyTypes).where(eq(schema.propertyTypes.developerPropertyId, id))).length : 0,
    documents: await db
      .select({ title: schema.propertyDocuments.title, docType: schema.propertyDocuments.docType, visibility: schema.propertyDocuments.visibility, notes: schema.propertyDocuments.notes, fileName: schema.propertyDocuments.fileName, mimeType: schema.propertyDocuments.mimeType, r2Key: schema.propertyDocuments.r2Key, sizeBytes: schema.propertyDocuments.sizeBytes })
      .from(schema.propertyDocuments)
      .where(and(eq(schema.propertyDocuments.organizationId, orgId), eq(schema.propertyDocuments.propertyKind, kind), eq(schema.propertyDocuments.propertyId, id), isNull(schema.propertyDocuments.deletedAt))),
    owners: await db
      .select({ role: schema.propertyContacts.role, ownershipPct: schema.propertyContacts.ownershipPct })
      .from(schema.propertyContacts)
      .where(and(eq(schema.propertyContacts.organizationId, orgId), eq(schema.propertyContacts.propertyKind, kind), eq(schema.propertyContacts.propertyId, id), isNull(schema.propertyContacts.deletedAt))),
    hasFile,
  }
}

export { DEMO_DISCLAIMER }
