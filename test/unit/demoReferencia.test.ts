import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asc, desc, eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { PROPERTIES } from '../../server/demo/dataset/properties'
import { REFERENCE_CONTENT, DEMO_DISCLAIMER, isUsableRoom } from '../../server/demo/dataset/referencia'
import { DEMO_REFERENCE_PROPERTIES, demoReferenceFor, demoReferenceRefs, isDemoReferenceRef, referenceFlagSql, referenceRankSql } from '../../server/demo/reference'
import { renderDemoDocumentPdf } from '../../server/demo/pdf'
import { adminResources } from '../../server/utils/adminResources'
import { PROPERTY_BUILDER_SECTIONS, sectionFieldSpecs } from '../../composables/usePropertyBuilderConfig'
import { PROPERTY_SHEET_FIELD_MAP, PROPERTY_DOCUMENT_TYPES, DOCUMENT_VISIBILITIES } from '../../utils/propertySheet'
import { MEDIA_ROOMS } from '../../utils/mediaRooms'
import { createTestDb } from './helpers/tenantFixtures'

/**
 * Las cuatro propiedades de referencia de la cuenta demo (docs/demo.md): dos de
 * Propiedades (web) y dos de 2ª mano, llevadas a todo lo que admite el editor.
 * Aquí, lo que se puede comprobar sin generar la demo entera: que el contenido
 * usa sólo catálogos reales, que es coherente consigo mismo, que sus archivos
 * existen, que los documentos salen marcados y que la prioridad del listado
 * sólo se aplica a la empresa demo. La comprobación contra la demo generada
 * (campos del editor, enlaces, relaciones) está en demoSeed.test.ts.
 */

const ASSETS = join(import.meta.dirname, '../../public/demo-assets/norte-astur')
const base = (key: string) => PROPERTIES.find((p) => p.key === key)!

describe('propiedades de referencia: qué son', () => {
  it('son cuatro: dos de Propiedades (web) y dos de 2ª mano, sin duplicar ninguna', () => {
    expect(DEMO_REFERENCE_PROPERTIES.map((p) => `${p.kind}:${p.key}`)).toEqual(['developer:p10', 'developer:p02', 'agent:p11', 'agent:p19'])
    expect(REFERENCE_CONTENT.map((c) => c.key).sort()).toEqual(['p02', 'p10', 'p11', 'p19'])
    expect(new Set(DEMO_REFERENCE_PROPERTIES.map((p) => p.ref)).size).toBe(4)
    for (const r of DEMO_REFERENCE_PROPERTIES) {
      const p = base(r.key)
      expect(p.kind, r.key).toBe(r.kind)
      // La referencia de agencia que el seed le da a cada propiedad (events/properties.ts): por ella se reconoce.
      expect(`NA-${p.key.toUpperCase()}`, r.key).toBe(r.ref)
    }
  })

  it('son las tipologías pedidas: chalet y ático en la web; piso y casa en 2ª mano', () => {
    expect(base('p10').propertyType).toBe('Villa')
    expect(base('p02').propertyType).toBe('Penthouse')
    expect(base('p11').propertyType).toBe('Apartment')
    expect(base('p19').propertyType).toBe('House')
  })

  it('las referencias de cada catálogo salen en su orden', () => {
    expect(demoReferenceRefs('developer')).toEqual(['NA-P10', 'NA-P02'])
    expect(demoReferenceRefs('agent')).toEqual(['NA-P11', 'NA-P19'])
    expect(isDemoReferenceRef('developer', 'NA-P10')).toBe(true)
    // Una propiedad de 2ª mano no es de referencia por llamarse como una de la web, ni al revés.
    expect(isDemoReferenceRef('agent', 'NA-P10')).toBe(false)
    expect(isDemoReferenceRef('developer', null)).toBe(false)
    expect(isDemoReferenceRef('developer', 'NA-P03')).toBe(false)
  })
})

describe('propiedades de referencia: contenido dentro de catálogo', () => {
  const editorKeys = (kind: 'developer' | 'agent') => {
    const keys = new Set<string>()
    for (const s of PROPERTY_BUILDER_SECTIONS[kind === 'developer' ? 'developer-properties' : 'properties']!) {
      keys.add(s.key)
      for (const f of sectionFieldSpecs(s)) keys.add(f.key)
      if (s.kind === 'location') {
        keys.add(s.latField)
        keys.add(s.lngField)
      }
    }
    return keys
  }

  it('cada campo que se completa existe (columna del recurso o ficha ampliada) y su valor es del catálogo', () => {
    const problems: string[] = []
    for (const c of REFERENCE_CONTENT) {
      const def = adminResources[base(c.key).kind === 'developer' ? 'developer-properties' : 'properties']!
      for (const [key, value] of Object.entries(c.fields)) {
        const field = PROPERTY_SHEET_FIELD_MAP[key]
        if (field) {
          if (field.type === 'select' && !field.options!.includes(String(value))) problems.push(`${c.key}: ${key}=${String(value)}`)
          if (field.type === 'bool' && typeof value !== 'boolean') problems.push(`${c.key}: ${key} debería ser sí/no`)
          if ((field.type === 'number' || field.type === 'integer') && typeof value !== 'number') problems.push(`${c.key}: ${key} debería ser un número`)
        } else if (!(key in def.fields)) problems.push(`${c.key}: campo desconocido ${key}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('cada «no aplica» se refiere a un campo o sección reales del editor (nada de entradas obsoletas)', () => {
    for (const c of REFERENCE_CONTENT) {
      const known = editorKeys(base(c.key).kind)
      for (const key of Object.keys(c.notApplicable)) expect(known.has(key), `${c.key}: ${key}`).toBe(true)
    }
  })

  it('lo que se completa no se declara también como «no aplica»', () => {
    for (const c of REFERENCE_CONTENT) {
      const filled = new Set(Object.entries({ ...base(c.key).sheet, ...base(c.key).legal, ...c.fields }).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k]) => k))
      const both = Object.keys(c.notApplicable).filter((k) => filled.has(k))
      expect(both, c.key).toEqual([])
    }
  })

  it('los documentos usan tipos y visibilidades del catálogo', () => {
    for (const c of REFERENCE_CONTENT) {
      for (const d of c.documents) {
        expect(PROPERTY_DOCUMENT_TYPES as readonly string[], `${c.key}: ${d.title}`).toContain(d.docType)
        expect(DOCUMENT_VISIBILITIES as readonly string[], `${c.key}: ${d.title}`).toContain(d.visibility)
      }
    }
  })
})

describe('propiedades de referencia: coherencia de los datos', () => {
  const merged = (key: string) => ({ ...base(key), ...base(key).sheet, ...base(key).legal, ...REFERENCE_CONTENT.find((c) => c.key === key)!.fields }) as Record<string, any>

  it.each(['p10', 'p02', 'p11', 'p19'])('%s: las estancias suman la superficie útil y cuadran con dormitorios, baños y terrazas', (key) => {
    const c = REFERENCE_CONTENT.find((x) => x.key === key)!
    const p = base(key)
    const v = merged(key)
    expect(c.rooms.filter(isUsableRoom).reduce((s, r) => s + r.area, 0)).toBe(p.usableArea)
    expect(c.rooms.filter((r) => r.type === 'Dormitorio')).toHaveLength(p.bedrooms)
    expect(c.rooms.filter((r) => r.type === 'Baño')).toHaveLength(p.bathrooms)
    expect(c.rooms.filter((r) => r.type === 'Aseo')).toHaveLength(Number(v.toilets ?? 0))
    expect(c.rooms.filter((r) => r.type === 'Terraza').reduce((s, r) => s + r.area, 0)).toBe(v.terraceArea ?? 0)
    // Las habitaciones totales: dormitorios, salones, cocinas y despachos.
    const habitable = c.rooms.filter((r) => ['Dormitorio', 'Salón', 'Cocina', 'Despacho'].includes(r.type)).length
    expect(habitable).toBe(v.roomsTotal)
    expect(new Set(c.rooms.map((r) => r.name)).size).toBe(c.rooms.length)
    expect(v.livingRooms).toBe(c.rooms.filter((r) => r.type === 'Salón').length)
    expect(v.kitchens).toBe(c.rooms.filter((r) => r.type === 'Cocina').length)
  })

  it.each(['p10', 'p02', 'p11', 'p19'])('%s: superficies y precios coherentes', (key) => {
    const p = base(key)
    const v = merged(key)
    expect(p.area).toBeGreaterThan(p.usableArea)
    expect(p.usableArea / p.area).toBeGreaterThan(0.7)
    expect(p.usableArea / p.area).toBeLessThan(0.95)
    expect(v.totalArea).toBeGreaterThanOrEqual(p.area)
    expect(v.computableArea).toBeLessThanOrEqual(v.totalArea)
    if (p.plotArea) expect(p.gardenArea! + 1).toBeLessThan(p.plotArea)
    expect(v.priceMinAuthorized).toBeLessThanOrEqual(p.price)
    expect(v.priceRecommended).toBeGreaterThanOrEqual(v.priceMinAuthorized)
    if (v.priceOld) expect(v.priceOld).toBeGreaterThan(p.price)
    // Con historial de precios, el anterior es el último de la lista.
    if (p.priceHistory?.length) expect(v.priceOld).toBe(p.priceHistory[p.priceHistory.length - 1]!.price)
    // Comunidad: la mensual del dataset y la anual (dato anterior) dicen lo mismo.
    if (p.serviceChargeAnnual) expect(p.serviceChargeAnnual).toBe(Number(p.legal.communityFeeMonthly) * 12)
  })

  it.each(['p10', 'p02', 'p11', 'p19'])('%s: lo que se instala no se contradice', (key) => {
    const v = merged(key)
    // Suelo radiante, aerotermia y calefacción dicen lo mismo.
    expect(v.hasUnderfloorHeating === true, `${key} suelo radiante`).toBe(v.heating === 'radiant_floor')
    if (v.hasAerothermal) expect(['heat_pump', 'radiant_floor']).toContain(v.heating)
    if (v.hasSolarPanels && v.hotWater) expect(['solar', 'heat_pump']).toContain(v.hotWater)
    // Sin chimenea declarada no hay chimenea; con terraza hay metros de terraza.
    const f = base(key).features
    expect(Boolean(f.terrace)).toBe(Number(v.terraceArea ?? 0) > 0)
    expect(Boolean(f.garden)).toBe(Number(v.gardenArea ?? 0) > 0)
    expect(Boolean(f.garage)).toBe(Number(v.garageSpaces ?? 0) > 0)
    expect(Boolean(f.pool || v.hasPrivatePool)).toBe(key === 'p10')
  })

  it('los datos energéticos no llevan un número de registro oficial y las referencias son ficticias', () => {
    for (const c of REFERENCE_CONTENT) {
      expect(c.fields.energyCertificateNumber, c.key).toBe('DEMO-SIN-REGISTRO')
      expect(String(c.fields.cadastralReference), c.key).toMatch(/^DEMO\d{16}$/)
      expect(String(c.fields.registryPropertyNumber), c.key).toMatch(/^DEMO-FINCA-\d{4}$/)
      expect(c.fields.energyCertificateExpiry, c.key).toBeUndefined()
    }
  })

  it('las descripciones son extensas, no se repiten entre propiedades y avisan de que son de demostración', () => {
    for (const c of REFERENCE_CONTENT) {
      const text = c.description.replace(/<[^>]+>/g, ' ')
      expect(text.length, c.key).toBeGreaterThan(2200)
      expect(text, c.key).toMatch(/Propiedad ficticia de la cuenta demo/)
      expect(c.highlights.length, c.key).toBeGreaterThanOrEqual(5)
    }
    const paragraphs = REFERENCE_CONTENT.flatMap((c) => c.description.split(/\n{2,}|<\/p>/).map((x) => x.replace(/<[^>]+>/g, '').trim()).filter((x) => x.length > 80))
    // Sólo se repite el aviso de demostración (mismo texto en las cuatro).
    const dup = paragraphs.filter((t, i) => paragraphs.indexOf(t) !== i && !/Propiedad ficticia/.test(t))
    expect(dup).toEqual([])
  })
})

describe('propiedades de referencia: multimedia', () => {
  it('cada foto es de la galería de su propiedad, está clasificada con una estancia del catálogo y tiene alt y descripción', () => {
    for (const c of REFERENCE_CONTENT) {
      const p = base(c.key)
      for (const photo of c.photos) {
        expect(p.gallery, `${c.key}: ${photo.path}`).toContain(photo.path)
        expect(existsSync(join(ASSETS, photo.path)), photo.path).toBe(true)
        if (photo.room !== null) expect(MEDIA_ROOMS as readonly string[], `${c.key}: ${photo.path}`).toContain(photo.room)
        expect(photo.alt.length, photo.path).toBeGreaterThanOrEqual(25)
        expect(photo.description.length, photo.path).toBeGreaterThanOrEqual(20)
      }
      // Todas las fotos de la galería están descritas (ninguna se queda sin alt propio).
      expect(c.photos.map((x) => x.path).sort(), c.key).toEqual([...p.gallery].sort())
      // Una foto sin estancia sólo si no se puede decir con certeza lo que enseña.
      expect(c.photos.filter((x) => x.room === null).length, c.key).toBeLessThanOrEqual(2)
    }
  })

  it('las fotos del entorno dicen que lo son (no pasan por la vivienda)', () => {
    for (const c of REFERENCE_CONTENT) for (const photo of c.photos.filter((x) => x.path.startsWith('asturias/'))) expect(photo.description, `${c.key}: ${photo.path}`).toMatch(/del entorno/)
  })

  it('los planos existen, son PNG y salen de estancias de la propia ficha', () => {
    for (const c of REFERENCE_CONTENT) {
      expect(c.plans.length, c.key).toBeGreaterThanOrEqual(1)
      for (const plan of c.plans) {
        const file = join(ASSETS, plan.file)
        expect(existsSync(file), plan.file).toBe(true)
        expect(readFileSync(file).subarray(1, 4).toString('latin1'), plan.file).toBe('PNG')
        for (const f of plan.floors) expect(c.rooms.some((r) => r.floor === f), `${c.key}: ${f}`).toBe(true)
        // Lo que dice el plano de sus metros es la suma de sus estancias útiles.
        const total = c.rooms.filter((r) => plan.floors.includes(r.floor) && isUsableRoom(r)).reduce((s, r) => s + r.area, 0)
        expect(plan.sizes, plan.file).toContain(`${total} m²`)
      }
    }
    expect(existsSync(join(ASSETS, 'planos/p10-parcela.png'))).toBe(true)
  })
})

describe('propiedades de referencia: documentos de demostración', () => {
  it('cada documento sale como PDF con el rótulo «sin validez legal» en cada página y sin caracteres que la fuente no admite', async () => {
    for (const c of REFERENCE_CONTENT) {
      for (const d of c.documents) {
        const bytes = await renderDemoDocumentPdf({ title: d.title, subtitle: base(c.key).title, sections: d.sections, footer: 'Norte Astur Inmobiliaria (cuenta demo)' })
        expect(new TextDecoder().decode(bytes.subarray(0, 5)), d.title).toBe('%PDF-')
        const doc = await PDFDocument.load(bytes)
        expect(doc.getPageCount(), d.title).toBeGreaterThanOrEqual(1)
        expect(doc.getSubject(), d.title).toBe(DEMO_DISCLAIMER)
        expect(bytes.byteLength, d.title).toBeGreaterThan(1500)
      }
    }
  })

  it('los documentos se llaman y se describen como de demostración, sin hacerse pasar por oficiales', () => {
    for (const c of REFERENCE_CONTENT) {
      const titles = c.documents.map((d) => d.title)
      expect(new Set(titles).size, c.key).toBe(titles.length)
      // Sin escrituras, notas simples ni certificados: sólo fichas, memorias, resúmenes, informes descriptivos y el modelo de encargo.
      for (const d of c.documents) expect(['other', 'mandate'], `${c.key}: ${d.title}`).toContain(d.docType)
      // El título lo dice también en los listados, donde no se ve el PDF.
      for (const d of c.documents) expect(d.title, c.key).toMatch(/demostración/i)
      // El informe de estado de 2ª mano dice que no es una inspección.
      for (const d of c.documents.filter((x) => /Informe descriptivo/.test(x.title))) expect(JSON.stringify(d.sections), d.title).toMatch(/No se ha realizado ninguna inspección técnica/)
    }
  })

  it('hay 5 documentos por propiedad y al menos una ficha comercial, una memoria o resumen, el encargo y el plano', () => {
    for (const c of REFERENCE_CONTENT) {
      expect(c.documents.length, c.key).toBeGreaterThanOrEqual(5)
      expect(c.documents.some((d) => /Ficha comercial/.test(d.title)), c.key).toBe(true)
      expect(c.documents.some((d) => /Resumen|Memoria/.test(d.title)), c.key).toBe(true)
      expect(c.documents.some((d) => d.docType === 'mandate'), c.key).toBe(true)
    }
  })
})

describe('prioridad en el listado: sólo la empresa demo', () => {
  async function setup() {
    const { db } = createTestDb()
    const org = async (name: string, source: string) => {
      const [o] = await db.insert(schema.organizations).values({ name, slug: name.toLowerCase().replace(/\W+/g, '-'), registrationSource: source }).returning({ id: schema.organizations.id })
      return o.id as number
    }
    const demo = await org('Demo X', 'demo')
    const real = await org('Real Y', 'admin')
    return { db, demo, real }
  }

  it('la empresa demo recibe sus referencias; las demás, nada', async () => {
    const { db, demo, real } = await setup()
    expect(await demoReferenceFor(db, demo, 'developer')).toEqual({ refs: ['NA-P10', 'NA-P02'] })
    expect(await demoReferenceFor(db, demo, 'agent')).toEqual({ refs: ['NA-P11', 'NA-P19'] })
    expect(await demoReferenceFor(db, real, 'developer')).toBeNull()
    expect(await demoReferenceFor(db, null, 'developer')).toBeNull()
  })

  it('las de referencia van primero, en su orden, y el resto conserva el suyo; sin referencias no cambia nada', async () => {
    const { db, demo } = await setup()
    const [dev] = await db.insert(schema.developers).values({ organizationId: demo, name: 'Promotora' }).returning({ id: schema.developers.id })
    const P = schema.developerProperties
    const refs = ['NA-P01', 'NA-P02', 'NA-P03', 'NA-P10', 'NA-P04']
    for (const [i, ref] of refs.entries()) await db.insert(P).values({ organizationId: demo, developerId: dev.id, name: ref, slug: ref, agencyReference: ref, createdAt: `2026-01-0${i + 1}` })
    const names = async (rank: boolean, ref: string[]) =>
      (await db.select({ name: P.name }).from(P).where(eq(P.organizationId, demo)).orderBy(...(rank ? [referenceRankSql(P.agencyReference, ref), desc(P.createdAt)] : [desc(P.createdAt)]))).map((r: any) => r.name)
    // Sin prioridad: el orden normal («Más recientes»).
    expect(await names(false, [])).toEqual(['NA-P04', 'NA-P10', 'NA-P03', 'NA-P02', 'NA-P01'])
    // Con prioridad: p10, p02 primero; los demás, como estaban.
    expect(await names(true, ['NA-P10', 'NA-P02'])).toEqual(['NA-P10', 'NA-P02', 'NA-P04', 'NA-P03', 'NA-P01'])
    // Una referencia que ya no existe (borrada o despublicada) no rompe nada.
    expect(await names(true, ['NA-P99', 'NA-P02'])).toEqual(['NA-P02', 'NA-P04', 'NA-P10', 'NA-P03', 'NA-P01'])
    // La columna que marca las filas.
    const flags = await db.select({ name: P.name, flag: referenceFlagSql(P.agencyReference, ['NA-P10', 'NA-P02']) }).from(P).orderBy(asc(P.name))
    expect(Object.fromEntries(flags.map((f: any) => [f.name, Number(f.flag)]))).toEqual({ 'NA-P01': 0, 'NA-P02': 1, 'NA-P03': 0, 'NA-P04': 0, 'NA-P10': 1 })
  })
})
