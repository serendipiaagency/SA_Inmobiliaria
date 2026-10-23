import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEvent } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { PROPERTY_BUILDER_SECTIONS, buildPropertySections, sectionFieldSpecs, type FieldsSection, type MediaSection } from '../../composables/usePropertyBuilderConfig'
import { adminResources } from '../../server/utils/adminResources'
import { insertResourceRecord } from '../../server/utils/adminResourceCreate'
import { uniquePropertySlug } from '../../server/utils/properties/slug'
import { toPublicProperty, toPublicSheet } from '../../server/utils/propertyPrivacy'
import { AGENT_PROPERTY_TYPE_TO_SCHEMA, PROPERTY_SCHEMAS } from '../../server/utils/propertySchema/registry'
import { forgetDemoOrgCache } from '../../server/utils/demo/tenant'
import { CURRENCIES } from '../../utils/currency'
import { PROPERTY_CONDITIONS, PROPERTY_CONDITION_LABELS, PROPERTY_SHEET_FIELD_MAP } from '../../utils/propertySheet'
import { createD1Shim } from './helpers/d1Shim'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cola 11 — el Constructor de Propiedades único para Propiedades (web) y
 * Propiedades 2ª mano: los mismos 13 apartados, los mismos campos y las mismas
 * validaciones; lo que cambia entre catálogos son capacidades, no formularios.
 */
const DEV = PROPERTY_BUILDER_SECTIONS['developer-properties']!
const AGENT = PROPERTY_BUILDER_SECTIONS.properties!
const read = (f: string) => readFileSync(join(import.meta.dirname, '../..', f), 'utf8')
const fieldsOf = (sections: typeof DEV) => sections.flatMap((s) => sectionFieldSpecs(s))
const section = (sections: typeof DEV, key: string) => sections.find((s) => s.key === key)!
const KEYS = ['info', 'location', 'price', 'features', 'rooms', 'installations', 'media', 'commercial', 'owners', 'legal', 'documents', 'portals', 'buyer-matches']
const LABELS = ['Información básica', 'Ubicación', 'Precio', 'Características', 'Estancias personalizadas', 'Instalaciones y exteriores', 'Multimedia y planos', 'Comercial / Inversión', 'Propietarios', 'Legal y certificados', 'Documentos', 'Portales', 'Compradores compatibles']

describe('un solo constructor para los dos catálogos', () => {
  it('trece apartados, en este orden, en los dos', () => {
    expect(DEV.map((s) => s.key)).toEqual(KEYS)
    expect(AGENT.map((s) => s.key)).toEqual(KEYS)
  })
  it('con los mismos nombres', () => {
    expect(DEV.map((s) => s.label)).toEqual(LABELS)
    expect(AGENT.map((s) => s.label)).toEqual(LABELS)
  })
  it('se generan con la misma función y el mismo tipo de apartado en cada posición', () => {
    expect(DEV.map((s) => s.kind)).toEqual(AGENT.map((s) => s.kind))
    expect(buildPropertySections('developer').map((s) => s.key)).toEqual(KEYS)
  })
  it('los pasos antiguos ya no existen como apartado', () => {
    for (const gone of ['description', 'building', 'gallery', 'floorplans', 'unittypes', 'social']) {
      expect(DEV.some((s) => s.key === gone), gone).toBe(false)
      expect(AGENT.some((s) => s.key === gone), gone).toBe(false)
    }
  })
  it('los campos comunes son los mismos: lo único exclusivo de un catálogo es una capacidad suya', () => {
    const dev = new Set(fieldsOf(DEV).map((f) => f.key))
    const agent = new Set(fieldsOf(AGENT).map((f) => f.key))
    const onlyDev = [...dev].filter((k) => !agent.has(k)).sort()
    const onlyAgent = [...agent].filter((k) => !dev.has(k)).sort()
    expect(onlyDev).toEqual(['constructionPercentage', 'developerId', 'downPercentage', 'handoverDate', 'handoverPercentage', 'coverImage', 'locationMapDescription', 'masterPlanDescription', 'floorPlanDescription'].sort())
    expect(onlyAgent).toEqual(['location', 'mainImage'].sort())
  })
  it('ningún campo está repetido dentro de un catálogo', () => {
    for (const sections of [DEV, AGENT]) {
      const keys = fieldsOf(sections).map((f) => f.key)
      expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
    }
  })
  it('las capacidades de cada catálogo: ninguna «Información básica» muestra editor de traducciones; tipologías sólo en obra nueva', () => {
    // El editor de título/descripción en inglés y árabe del apartado SEO se
    // retiró de «01. Información básica» (petición del propietario): ni obra
    // nueva ni 2ª mano lo muestran. La tabla property_translations y su
    // sincronización siguen intactas (sin migración); simplemente no se edita
    // desde el formulario.
    const extras = (sections: typeof DEV) => (section(sections, 'info') as FieldsSection).extras?.map((e) => e.kind) ?? []
    expect(extras(DEV)).toEqual([])
    expect(extras(AGENT)).toEqual([])
    expect(((section(DEV, 'features') as FieldsSection).extras || []).map((e) => e.kind)).toEqual(['child-table'])
    expect((section(AGENT, 'features') as FieldsSection).extras).toBeUndefined()
  })
  it('los recursos hijos de cada catálogo apuntan a sus tablas', () => {
    const dm = section(DEV, 'media') as MediaSection
    const am = section(AGENT, 'media') as MediaSection
    expect(dm.gallery.childResource).toBe('project-images')
    expect(am.gallery.childResource).toBe('gallery-images')
    expect(dm.coverField).toBe('coverImage')
    expect(am.coverField).toBe('mainImage')
  })
  it('cada campo del constructor está conectado: columna del recurso, ficha ampliada o campo de la interfaz', () => {
    for (const [resource, sections] of [['developer-properties', DEV], ['properties', AGENT]] as const) {
      const def = adminResources[resource]!
      const missing = fieldsOf(sections)
        .filter((f) => !f.virtual && f.type !== 'computed' && !(f.key in def.fields) && !PROPERTY_SHEET_FIELD_MAP[f.key] && !['lat', 'lng'].includes(f.key))
        .map((f) => f.key)
      expect(missing, resource).toEqual([])
    }
  })
})

describe('Información básica', () => {
  const info = (sections: typeof DEV) => section(sections, 'info') as FieldsSection
  it('«Título» sustituye a «Nombre», y no queda ningún «Nombre»', () => {
    for (const sections of [DEV, AGENT]) {
      expect(info(sections).fields[0]).toMatchObject({ key: 'name', label: 'Título' })
      expect(fieldsOf(sections).some((f) => f.label === 'Nombre')).toBe(false)
    }
    expect(adminResources['developer-properties']!.fields.name!.label).toBe('Título')
  })
  it('el título es obligatorio en obra nueva y recomendado en 2ª mano (lo que ya exigía el servidor)', () => {
    expect(info(DEV).fields[0]).toMatchObject({ required: true })
    expect(info(AGENT).fields[0]).toMatchObject({ recommended: true })
    expect(info(AGENT).fields[0]!.required).toBeFalsy()
  })
  it('la descripción va justo debajo del título, y ya no es un apartado', () => {
    for (const sections of [DEV, AGENT]) {
      expect(info(sections).fields[1]).toMatchObject({ key: 'description', label: 'Descripción', type: 'rich-text' })
      expect(sections.some((s) => s.label === 'Descripción')).toBe(false)
    }
  })
  it('«Referencias» agrupa exactamente las cuatro referencias y arranca plegado', () => {
    for (const sections of [DEV, AGENT]) {
      const refs = info(sections).fields.filter((f) => f.group === 'Referencias').map((f) => f.key)
      expect(refs).toEqual(['reference', 'agencyReference', 'externalSource', 'externalReference'])
      expect(info(sections).collapsedGroups).toEqual(['Referencias', 'SEO'])
      // Ninguna de las cuatro anda suelta por otro grupo.
      for (const k of refs) expect(info(sections).fields.filter((f) => f.key === k)).toHaveLength(1)
    }
  })
  it('«SEO» contiene el slug', () => {
    for (const sections of [DEV, AGENT]) expect(info(sections).fields.filter((f) => f.group === 'SEO').map((f) => f.key)).toEqual(['slug'])
  })
  it('el slug y la referencia interna son automáticos; sólo el slug se puede sobrescribir', () => {
    for (const sections of [DEV, AGENT]) {
      const slug = info(sections).fields.find((f) => f.key === 'slug')!
      const ref = info(sections).fields.find((f) => f.key === 'reference')!
      expect(slug).toMatchObject({ autoOverridable: true })
      expect(slug.auto).toContain('no cambia aunque cambies el título')
      expect(ref.auto).toContain('no se vuelve a generar')
      expect(ref.autoOverridable).toBeFalsy()
    }
  })
  it('el precio por m² es automático y nunca se guarda', () => {
    const f = fieldsOf(DEV).find((x) => x.key === 'pricePerSquareMeter')!
    expect(f).toMatchObject({ type: 'computed', virtual: true })
    expect(f.auto).toBeTruthy()
  })
  it('ningún campo que exija intervención manual se marca como automático', () => {
    const autos = fieldsOf(DEV).filter((f) => f.auto).map((f) => f.key).sort()
    expect(autos).toEqual(['pricePerSquareMeter', 'reference', 'slug'])
    for (const f of fieldsOf(DEV).filter((x) => x.auto)) expect(f.required).toBeFalsy()
  })
  it('«Estado» tiene exactamente seis opciones, en este orden', () => {
    for (const sections of [DEV, AGENT]) {
      const estado = fieldsOf(sections).find((f) => f.key === 'condition')!
      expect(estado.label).toBe('Estado')
      expect(estado.options).toEqual(['new', 'excellent', 'good', 'renovated', 'to_renovate', 'to_reform'])
      expect(estado.options!.map((o) => estado.optionLabels![o])).toEqual(['A estrenar', 'Excelente', 'Buen estado', 'Reformado', 'Para renovar', 'Para reformar'])
    }
    expect([...PROPERTY_CONDITIONS]).toEqual(['new', 'excellent', 'good', 'renovated', 'to_renovate', 'to_reform'])
    expect(Object.keys(PROPERTY_CONDITION_LABELS)).toHaveLength(6)
  })
  it('«Estado de la obra» y «Estado físico» ya no se llaman así en ninguna parte del constructor', () => {
    for (const sections of [DEV, AGENT]) {
      const labels = fieldsOf(sections).map((f) => f.label)
      expect(labels).not.toContain('Estado de la obra')
      expect(labels).not.toContain('Estado físico')
    }
    expect(adminResources.properties!.fields.condition!.label).toBe('Estado')
  })
  it('la fase de la obra se conserva como dato, en Características, sólo en obra nueva', () => {
    expect(fieldsOf(DEV).find((f) => f.key === 'status')).toMatchObject({ label: 'Fase de la obra', group: 'Edificio y vivienda' })
    expect((section(DEV, 'features') as FieldsSection).fields.some((f) => f.key === 'status')).toBe(true)
    expect(fieldsOf(AGENT).find((f) => f.key === 'status')).toMatchObject({ label: expect.stringMatching(/Disponibilidad/) })
  })
  it('la captación vive en Comercial / Inversión y no en Información básica', () => {
    for (const sections of [DEV, AGENT]) {
      expect((section(sections, 'commercial') as FieldsSection).fields.filter((f) => f.group === 'Captación').map((f) => f.key)).toEqual(['captureDate', 'captureSource'])
      expect(info(sections).fields.some((f) => f.group === 'Captación' || f.key === 'captureDate' || f.key === 'captureSource')).toBe(false)
    }
  })
})

describe('Precio, Características e Instalaciones', () => {
  it('el precio tiene su «Tipo de moneda», con las monedas ISO que soporta la plataforma', () => {
    for (const sections of [DEV, AGENT]) {
      const f = (section(sections, 'price') as FieldsSection).fields.find((x) => x.key === 'currency')!
      expect(f.label).toBe('Tipo de moneda')
      // Las monedas con tasa primero, y después el resto de ISO 4217.
      expect(f.options!.slice(0, CURRENCIES.length)).toEqual(CURRENCIES.map((c) => c.code))
      expect(f.options).toEqual(expect.arrayContaining(['EUR', 'USD', 'GBP', 'MXN']))
      expect(f.optionLabels!.EUR).toContain('EUR')
    }
    expect(adminResources.properties!.fields.currency!.options).toEqual(expect.arrayContaining(CURRENCIES.map((c) => c.code)))
    expect(adminResources.properties!.fields.currency!.options).toContain('MXN')
    expect(adminResources['developer-properties']!.fields.currency!.options).toEqual(expect.arrayContaining(CURRENCIES.map((c) => c.code)))
  })
  it('«Estado físico» desaparece de Características (es el mismo campo «Estado»)', () => {
    for (const sections of [DEV, AGENT]) expect((section(sections, 'features') as FieldsSection).fields.some((f) => f.key === 'condition')).toBe(false)
  })
  it('Características une dimensiones, edificio y vivienda, equipamiento y adicionales', () => {
    for (const sections of [DEV, AGENT]) {
      const groups = [...new Set((section(sections, 'features') as FieldsSection).fields.map((f) => f.group))]
      expect(groups).toEqual(['Superficies y distribución', ...(sections === DEV ? [] : []), 'Edificio y vivienda', 'Equipamiento y dimensiones', 'Características adicionales'])
    }
  })
  it('«Reformado» (casilla anterior) se conserva sólo si la ficha la traía, sin duplicar el nuevo «Estado → Reformado»', () => {
    const f = fieldsOf(DEV).find((x) => x.key === 'isRenovated')!
    expect(f.legacyOnly).toBe(true)
    expect(f.hint).toContain('Estado')
  })
  it('en Instalaciones y exteriores, dentro de cada grupo, primero los desplegables y después las casillas', () => {
    for (const sections of [DEV, AGENT]) {
      const groups = new Map<string, string[]>()
      for (const f of (section(sections, 'installations') as FieldsSection).fields) groups.set(f.group!, [...(groups.get(f.group!) || []), f.type === 'checkbox' ? 'check' : 'field'])
      expect([...groups.keys()]).toEqual(['Instalaciones', 'Zonas comunes', 'Exterior'])
      for (const [name, order] of groups) {
        const firstCheck = order.indexOf('check')
        expect(firstCheck === -1 || order.slice(firstCheck).every((o) => o === 'check'), name).toBe(true)
      }
    }
    const instal = (section(DEV, 'installations') as FieldsSection).fields
    expect(instal.filter((f) => f.group === 'Instalaciones').slice(0, 3).map((f) => f.key)).toEqual(['heating', 'hotWater', 'installationsCondition'])
  })
  it('el armazón dibuja los desplegables primero y las casillas como píldoras después', () => {
    const view = read('components/property-builder/PropertyBuilder.vue')
    expect(view.indexOf('nonCheckboxes(g.fields)')).toBeLessThan(view.indexOf('checkboxes(g.fields)'))
    expect(view).toContain('property-group-checks-')
  })
})

describe('Multimedia y planos', () => {
  it('un solo apartado con portada, galería, vídeo, planos y tours', () => {
    for (const sections of [DEV, AGENT]) {
      const m = section(sections, 'media') as MediaSection
      expect(m.kind).toBe('media')
      expect(m.gallery.childResource).toBeTruthy()
      expect(m.floorPlans.childResource).toBeTruthy()
      expect(m.videoField.key).toBe('videoUrl')
      expect(m.tourFields.map((f) => f.key)).toEqual(['virtualTourUrl'])
    }
  })
  it('«Fotografía premium» ya no tiene pantalla (los datos guardados no se tocan)', () => {
    for (const sections of [DEV, AGENT]) {
      const keys = fieldsOf(sections).map((f) => f.key)
      for (const k of ['dronePhoto', 'nightPhoto', 'beforePhoto', 'afterPhoto', 'aiStagedPhoto']) expect(keys, k).not.toContain(k)
    }
    // Las columnas siguen en el recurso: nada se borra.
    for (const k of ['dronePhoto', 'nightPhoto', 'beforePhoto', 'afterPhoto', 'aiStagedPhoto']) expect(adminResources.properties!.fields[k], k).toBeTruthy()
  })
  it('el componente enseña las cinco partes y reutiliza los gestores de siempre', () => {
    const v = read('components/property-builder/PropertyMediaSuite.vue')
    for (const id of ['media-cover', 'media-gallery', 'media-videos', 'media-plans', 'media-tours']) expect(v).toContain(id)
    for (const c of ['GalleryManager', 'ChildCardManager']) expect(v).toContain(c)
    expect(v).toContain('Sólo hay una portada activa')
  })
  it('la portada cuenta para el progreso y la búsqueda de campos la encuentra', () => {
    const v = read('components/property-builder/PropertyBuilder.vue')
    expect(v).toContain("type: 'image', recommended: true")
    expect(v).toContain('mediaSearchFields')
  })
})

describe('Guardar y progreso', () => {
  it('el pie lleva un «Guardar» independiente de Anterior/Siguiente, con su estado', () => {
    const f = read('components/property-builder/PropertyEditorFooter.vue')
    expect(f).toContain('property-editor-guardar"')
    for (const t of ['Cambios pendientes', 'Guardando…', 'Error al guardar', 'Sin cambios']) expect(f).toContain(t)
    expect(f).toContain('property-editor-prev')
    expect(f).toContain('property-editor-next')
    expect(f).not.toContain('Finalizar')
  })
  it('el armazón pasa el estado y guarda con el mismo camino que el autoguardado', () => {
    const v = read('components/property-builder/PropertyBuilder.vue')
    expect(v).toContain('@save="save"')
    expect(v).toContain(':state="saveState"')
    expect(v).toContain('Para guardar por primera vez falta')
  })
  it('un campo automático nunca cuenta para el progreso', () => {
    const v = read('components/property-builder/PropertyBuilder.vue')
    expect(v).toContain('!f.auto')
  })
  it('las etiquetas «Automático» y «Dato interno» se calculan con las reglas reales de visibilidad', () => {
    const v = read('components/property-builder/PropertyBuilder.vue')
    expect(v).toContain('publicExposable === false')
    const field = read('components/property-builder/PropertyBuilderField.vue')
    expect(field).toContain('Automático')
    expect(field).toContain('Dato interno')
    expect(field).toContain('<Generado automáticamente>')
  })
})

describe('slug automático', () => {
  it('sale del título, sin tildes ni caracteres no válidos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugA')
    expect(await uniquePropertySlug(db, schema.developerProperties, a.orgId, 'Ático reformado con terraza en Gijón')).toBe('atico-reformado-con-terraza-en-gijon')
    expect(await uniquePropertySlug(db, schema.developerProperties, a.orgId, '  ¡Chalet  "Los Pinos" — 5 hab.!  ')).toBe('chalet-los-pinos-5-hab')
    expect(await uniquePropertySlug(db, schema.developerProperties, a.orgId, '!!!')).toBeNull()
    expect(await uniquePropertySlug(db, schema.developerProperties, a.orgId, '')).toBeNull()
  })
  it('es único en la empresa: -2, -3…, el primero libre', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugB')
    const def = adminResources['developer-properties']!
    const make = async (name: string, extra: Record<string, any> = {}) => {
      const r = await insertResourceRecord(db, 'developer-properties', def, { name, developerId: a.developerId, ...extra }, { orgId: a.orgId, user: { id: a.userId, role: 'admin' } as any })
      const [row] = await db.select().from(schema.developerProperties).where((await import('drizzle-orm')).eq(schema.developerProperties.id, r.id))
      return row.slug
    }
    expect(await make('Villa del Mar')).toBe('villa-del-mar')
    expect(await make('Villa del Mar')).toBe('villa-del-mar-2')
    expect(await make('Villa del Mar')).toBe('villa-del-mar-3')
    expect(await make('Villa del Mar', { slug: 'mi-slug-a-mano' })).toBe('mi-slug-a-mano')
  })
  it('un título larguísimo no rompe (D1 rechaza LIKE de más de 50 bytes) y se recorta; el sufijo no excede el máximo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugLargo')
    const def = adminResources['developer-properties']!
    const largo = 'Ático-dúplex-con-terraza-panorámica-y-piscina-privada-en-primera-línea-de-playa-con-garaje-doble'
    const make = async () => {
      const r = await insertResourceRecord(db, 'developer-properties', def, { name: largo, developerId: a.developerId }, { orgId: a.orgId, user: { id: a.userId, role: 'admin' } as any })
      const [row] = await db.select().from(schema.developerProperties).where((await import('drizzle-orm')).eq(schema.developerProperties.id, r.id))
      return row.slug as string
    }
    const first = await make()
    const second = await make()
    expect(first.length).toBeLessThanOrEqual(80)
    expect(second).not.toBe(first)
    expect(second.length).toBeLessThanOrEqual(80)
    expect(second).toMatch(/-2$/)
  })
  it('otra empresa puede usar el mismo slug', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugC')
    const b = await seedTenant(db, 'SlugD')
    const def = adminResources['developer-properties']!
    const make = async (t: any) => {
      const r = await insertResourceRecord(db, 'developer-properties', def, { name: 'Casa Azul', developerId: t.developerId }, { orgId: t.orgId, user: { id: t.userId, role: 'admin' } as any })
      const [row] = await db.select().from(schema.developerProperties).where((await import('drizzle-orm')).eq(schema.developerProperties.id, r.id))
      return row.slug
    }
    expect(await make(a)).toBe('casa-azul')
    expect(await make(b)).toBe('casa-azul')
  })
  it('un título largo no pasa de 80 caracteres y sigue siendo único', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugE')
    const long = 'Casa '.repeat(40)
    const s1 = await uniquePropertySlug(db, schema.developerProperties, a.orgId, long)
    expect(s1!.length).toBeLessThanOrEqual(80)
  })
  it('las propiedades de 2ª mano también la generan a partir de su título (migración 0099)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlugF')
    const def = adminResources.properties!
    const r = await insertResourceRecord(db, 'properties', def, { name: 'Piso luminoso en Oviedo', propertyType: 'Apartment' }, { orgId: a.orgId, user: { id: a.userId, role: 'admin' } as any })
    const [row] = await db.select().from(schema.agentProperties).where((await import('drizzle-orm')).eq(schema.agentProperties.id, r.id))
    expect(row).toMatchObject({ name: 'Piso luminoso en Oviedo', slug: 'piso-luminoso-en-oviedo' })
  })
  it('editar el título no cambia la dirección pública (el servidor sólo la genera al crear)', () => {
    const src = read('server/utils/adminResourceCreate.ts')
    expect(src).toContain('uniquePropertySlug')
    expect(src).toContain('!(body && body.slug)')
    // El PUT no recalcula nada: buildPayload sólo genera el slug con isCreate.
    expect(read('server/utils/adminResources.ts')).toContain('def.slugFrom && isCreate')
  })
})

describe('moneda y descripción de 2ª mano (migraciones 0098 y 0099)', () => {
  it('la descripción, el título y la moneda se guardan', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MonedaA')
    const r = await insertResourceRecord(db, 'properties', adminResources.properties!, { name: 'Casa', description: '<p>Con jardín</p>', currency: 'USD', price: 250000 }, { orgId: a.orgId, user: { id: a.userId, role: 'admin' } as any })
    const [row] = await db.select().from(schema.agentProperties).where((await import('drizzle-orm')).eq(schema.agentProperties.id, r.id))
    expect(row).toMatchObject({ name: 'Casa', description: '<p>Con jardín</p>', currency: 'USD', price: 250000 })
  })
  it('sin moneda propia queda en null (la de la inmobiliaria), como hasta ahora', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MonedaB')
    const r = await insertResourceRecord(db, 'developer-properties', adminResources['developer-properties']!, { name: 'Promo', developerId: a.developerId, price: 1 }, { orgId: a.orgId, user: { id: a.userId, role: 'admin' } as any })
    const [row] = await db.select().from(schema.developerProperties).where((await import('drizzle-orm')).eq(schema.developerProperties.id, r.id))
    expect(row.currency).toBeNull()
  })
})

describe('«Reformado» en el filtro público', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    forgetDemoOrgCache()
  })
  it('el estado «renovated» se encuentra con el filtro «Reformado»; el resto, no', async () => {
    const { DB } = createD1Shim()
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(DB as any, { schema })
    const h3 = await import('h3')
    vi.stubGlobal('defineEventHandler', (f: any) => f)
    for (const k of ['createError', 'getQuery', 'readBody', 'getRequestHeader', 'getCookie', 'setResponseHeader', 'getRequestIP'] as const) vi.stubGlobal(k, (h3 as any)[k])
    const a = await seedTenant(db, 'ReformadoA')
    const ts = '2026-01-01 00:00:00'
    const mk = async (name: string, condition: string | null) => {
      const [p] = await db.insert(schema.developerProperties).values({ organizationId: a.orgId, developerId: a.developerId, name, slug: name.toLowerCase().replace(/\W+/g, '-'), status: 'new', price: 100000, condition, publishedAt: ts, createdAt: ts, updatedAt: ts } as any).returning({ id: schema.developerProperties.id })
      return p.id as number
    }
    const reformada = await mk('Reformada', 'renovated')
    await mk('Buena', 'good')
    await mk('Sin estado', null)
    const handler = (await import('../../server/api/public/properties.get')).default as (e: any) => Promise<any>
    const req: any = { method: 'GET', url: '/api/public/properties?estado=reformado', headers: { host: 'agencia.test' } }
    const event = createEvent(req, { statusCode: 200, setHeader: () => {}, getHeader: () => undefined, removeHeader: () => {} } as any)
    ;(event.context as any).cloudflare = { env: { DB, MEDIA: {} } }
    ;(event.context as any).org = { id: a.orgId }
    const res = await handler(event)
    const ids = res.rows.map((r: any) => r.id)
    expect(ids).toContain(reformada)
    expect(res.rows.filter((r: any) => r.id !== reformada && r.name !== 'Reformada').map((r: any) => r.name)).toEqual([])
  })
})

describe('«Dato interno»: no es decorativo, el dato no sale en lo público', () => {
  const internalKeys = (catalog: 'developer' | 'agent') => {
    const schemaDef = catalog === 'developer' ? PROPERTY_SCHEMAS.newDevelopment : PROPERTY_SCHEMAS[AGENT_PROPERTY_TYPE_TO_SCHEMA.Apartment!]
    return Object.values(schemaDef.fields).filter((r) => r.publicExposable === false).map((r) => r.key)
  }
  it('los campos que el constructor marca como internos (regla publicExposable) no están en la proyección pública de la propiedad', () => {
    for (const catalog of ['developer', 'agent'] as const) {
      const keys = internalKeys(catalog)
      expect(keys.length).toBeGreaterThan(5)
      const row: Record<string, any> = { propertyType: 'Apartment', locationPrivacy: 'exact', name: 'Pública', price: 100 }
      for (const k of keys) row[k] = 'SECRETO'
      const out = toPublicProperty(row as any, { catalog }) as Record<string, unknown>
      for (const k of keys) expect(out, `${catalog}.${k}`).not.toHaveProperty(k)
      expect(out.name).toBe('Pública')
      expect(JSON.stringify(out)).not.toContain('SECRETO')
    }
  })
  it('lo mismo con la ficha ampliada (datos legales, comisiones, oficina…)', () => {
    for (const catalog of ['developer', 'agent'] as const) {
      const keys = internalKeys(catalog)
      const sheet: Record<string, any> = { heating: 'gas' }
      for (const k of keys) sheet[k] = 'SECRETO'
      const out = toPublicSheet(sheet, catalog, 'Apartment')
      expect(JSON.stringify(out)).not.toContain('SECRETO')
    }
  })
  it('las referencias internas y de captación lo son; el título y la descripción, no', () => {
    const keys = new Set([...internalKeys('developer'), ...internalKeys('agent')])
    for (const k of ['reference', 'agencyReference', 'externalSource', 'externalReference', 'captureDate', 'captureSource', 'mandateType', 'cadastralReference']) expect(keys.has(k), k).toBe(true)
    for (const k of ['name', 'description', 'price', 'slug']) expect(keys.has(k), k).toBe(false)
  })
})

describe('Multimedia y planos: sin «Identidad del proyecto»', () => {
  it('ni Propiedades (web) ni 2ª mano editan logo, imagen del master plan ni mapa de ubicación', () => {
    for (const sections of [DEV, AGENT]) {
      const media = sections.find((s) => s.kind === 'media') as MediaSection
      expect(media.projectImages).toEqual([])
      const keys = sectionFieldSpecs(media).map((f) => f.key)
      for (const k of ['logo', 'masterPlanImage', 'locationMap']) expect(keys).not.toContain(k)
    }
  })
})
