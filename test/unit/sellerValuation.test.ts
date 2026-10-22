import { and, eq, like } from 'drizzle-orm'
import { createEvent } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { AGENT_PROPERTY_TYPE_TO_SCHEMA, PROPERTY_SCHEMAS } from '../../server/utils/propertySchema/registry'
import { PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_TYPE_GROUPS, PROPERTY_TYPE_LABELS } from '../../utils/propertySheet'
import {
  SELLER_EXTRA_QUESTIONS,
  SELLER_MAX_PHOTOS,
  SELLER_SCHEMA_OF_TYPE,
  SELLER_STEP_KEYS,
  allSellerQuestions,
  compactSellerOptions,
  normalizeSellerOptions,
  sellerQuestionCatalog,
  sellerQuestions,
  sellerQuestionsShown,
  sellerSubtypes,
  sellerTypeGroups,
  sellerValuationSummary,
  sellerVisibleSteps,
  validateSellerValuation,
} from '../../utils/sellerValuation'
import { validatePageDocument } from '../../server/utils/sitePages'
import { seedPageBlocks } from '../../utils/siteBuilder/pages'
import { BLOCK_INSPECTORS, BLOCK_PRESETS, blockLabel, blockSubtitle, presetsForPage } from '../../composables/useSiteBuilderRegistry'
import { createD1Shim, createR2Shim } from './helpers/d1Shim'
import { seedTenant } from './helpers/tenantFixtures'
import { buildJpeg, buildMaliciousSvg, buildPng, buildWebp } from './helpers/mediaFixtures'

/**
 * Cola 9 — «Vender propiedad»: formulario de valoración multipaso.
 *
 * Parte 1: el catálogo y las reglas (utils/sellerValuation.ts) frente a
 * Property Core. Parte 2: el bloque en el Constructor. Parte 3: el endpoint
 * público con una D1 y un R2 de verdad (lead real, características, rol,
 * fotos, aislamiento). Ningún envío real: no hay RESEND_API_KEY.
 */

const flat = { type: 'Apartment', location: { id: 'm:33044', kind: 'municipality', label: 'Oviedo, Asturias' }, answers: { area: 95, bedrooms: 3, bathrooms: 2 } }
const input = (over: Record<string, any> = {}) => ({ propertyType: flat.type, location: flat.location, answers: { ...flat.answers }, ...over })

describe('catálogo: Property Core, no un segundo catálogo', () => {
  it('ofrece exactamente los tipos de Property Core, cada uno en un solo grupo', () => {
    const offered = sellerTypeGroups().flatMap((g) => g.types)
    expect([...offered].sort()).toEqual([...PROPERTY_TYPES].sort())
    expect(new Set(offered).size).toBe(offered.length)
  })

  it('los grupos y las etiquetas son los de la plataforma', () => {
    expect(sellerTypeGroups().map((g) => g.key)).toEqual(PROPERTY_TYPE_GROUPS.map((g) => g.key))
    for (const t of PROPERTY_TYPES) expect(PROPERTY_TYPE_LABELS[t], t).toBeTruthy()
  })

  it('los subtipos de cada tipo son los de Property Core', () => {
    for (const t of PROPERTY_TYPES) expect(sellerSubtypes(t).map((s) => s.value), t).toEqual(Object.keys(PROPERTY_SUBTYPES[t] || {}))
    expect(sellerSubtypes('Inventado')).toEqual([])
    expect(sellerSubtypes(null)).toEqual([])
  })

  it('cada tipo de Property Core tiene su familia de preguntas, la misma que el registro de esquemas', () => {
    for (const t of PROPERTY_TYPES) expect(SELLER_SCHEMA_OF_TYPE[t], t).toBe(AGENT_PROPERTY_TYPE_TO_SCHEMA[t])
  })

  it('cada pregunta es un campo real que el esquema de su tipo declara', () => {
    for (const t of PROPERTY_TYPES) {
      const declared = new Set(PROPERTY_SCHEMAS[AGENT_PROPERTY_TYPE_TO_SCHEMA[t]!].sections.flatMap((s) => s.fields))
      for (const q of [...sellerQuestions(t, 'surface'), ...sellerQuestions(t, 'features')]) expect(declared.has(q.key), `${t}.${q.key}`).toBe(true)
    }
  })

  it('todos los tipos preguntan al menos la superficie, que es obligatoria', () => {
    for (const t of PROPERTY_TYPES) {
      const surface = sellerQuestions(t, 'surface').find((q) => q.required)
      expect(surface?.key, t).toBe(t === 'Land' ? 'plotArea' : 'area')
    }
  })

  it('las preguntas dependen del tipo: un terreno no tiene habitaciones; un chalet sí tiene parcela y un piso no', () => {
    expect(sellerQuestions('Land', 'surface').map((q) => q.key)).toEqual(['plotArea'])
    expect(sellerQuestions('Villa', 'surface').map((q) => q.key)).toContain('plotArea')
    expect(sellerQuestions('Apartment', 'surface').map((q) => q.key)).not.toContain('plotArea')
    expect(sellerQuestions('Studio', 'surface').map((q) => q.key)).not.toContain('bedrooms')
    expect(sellerQuestions('Garage', 'surface').map((q) => q.key)).toContain('garageSpaces')
    expect(sellerQuestions('Warehouse', 'surface').map((q) => q.key)).toContain('ceilingHeight')
  })

  it('«ascensor» y «planta» sólo se preguntan en pisos', () => {
    expect(sellerQuestions('Apartment', 'features').map((q) => q.key)).toEqual(expect.arrayContaining(['hasElevator', 'floor']))
    expect(sellerQuestions('Villa', 'features').map((q) => q.key)).not.toContain('hasElevator')
    expect(sellerQuestions('Villa', 'features').map((q) => q.key)).not.toContain('floor')
  })

  it('los estados son los de Property Core', () => {
    const condition = sellerQuestions('Apartment', 'features').find((q) => q.key === 'condition')!
    expect(condition.options!.map((o) => o.value)).toEqual(['new', 'excellent', 'good', 'renovated', 'to_renovate', 'to_reform'])
  })

  it('un tipo desconocido no tiene preguntas', () => {
    expect(sellerQuestions('Castillo', 'surface')).toEqual([])
    expect(allSellerQuestions('Castillo').map((q) => q.step)).not.toContain('surface')
  })
})

describe('pasos y progreso', () => {
  it('seis pasos, en orden', () => {
    expect(SELLER_STEP_KEYS).toEqual(['type', 'location', 'surface', 'features', 'extra', 'contact'])
  })
  it('una vivienda enseña los seis; un terreno no tiene «Características y estado»', () => {
    expect(sellerVisibleSteps('Apartment')).toEqual([...SELLER_STEP_KEYS])
    expect(sellerVisibleSteps('Land')).toEqual(['type', 'location', 'surface', 'extra', 'contact'])
  })
  it('sin tipo todavía, el progreso cuenta como una vivienda: no salta al elegir', () => {
    expect(sellerVisibleSteps('')).toEqual([...SELLER_STEP_KEYS])
    expect(sellerVisibleSteps(null)).toEqual(sellerVisibleSteps('Apartment'))
  })
  it('ocultar las preguntas opcionales de un paso lo quita; las obligatorias no se pueden ocultar', () => {
    const all = SELLER_EXTRA_QUESTIONS.map((q) => q.key)
    expect(sellerVisibleSteps('Apartment', all)).not.toContain('extra')
    expect(sellerQuestionsShown('Apartment', 'surface', ['area', 'bedrooms']).map((q) => q.key)).toContain('area')
    expect(sellerQuestionsShown('Apartment', 'surface', ['area', 'bedrooms']).map((q) => q.key)).not.toContain('bedrooms')
  })
})

describe('validación', () => {
  it('un piso completo es válido y se limpia', () => {
    const r = validateSellerValuation(input())
    expect(r.ok).toBe(true)
    expect(r.clean).toMatchObject({ propertyType: 'Apartment', subtype: null, location: { id: 'm:33044', label: 'Oviedo, Asturias' }, answers: { area: 95, bedrooms: 3, bathrooms: 2 } })
  })
  it('sin tipo o con un tipo que no es de Property Core, no', () => {
    expect(validateSellerValuation(input({ propertyType: '' })).errors.type).toBeTruthy()
    expect(validateSellerValuation(input({ propertyType: 'Castillo' })).ok).toBe(false)
  })
  it('un subtipo sólo vale para su tipo', () => {
    expect(validateSellerValuation(input({ subtype: 'loft' })).ok).toBe(true)
    expect(validateSellerValuation(input({ subtype: 'detached_villa' })).errors.type).toBeTruthy()
  })
  it('la ubicación es obligatoria; un id de catálogo con caracteres raros se descarta', () => {
    expect(validateSellerValuation(input({ location: null })).errors.location).toBeTruthy()
    expect(validateSellerValuation(input({ location: { id: '<script>', kind: 'x', label: 'Gijón' } })).clean?.location.id).toBe('')
  })
  it('la superficie es obligatoria y positiva', () => {
    expect(validateSellerValuation(input({ answers: {} })).errors.surface).toBeTruthy()
    expect(validateSellerValuation(input({ answers: { area: 0 } })).errors.surface).toBeTruthy()
    expect(validateSellerValuation(input({ answers: { area: -5 } })).ok).toBe(false)
    expect(validateSellerValuation(input({ answers: { area: 'mucho' } })).ok).toBe(false)
  })
  it('acepta la coma decimal y números como texto del formulario', () => {
    expect(validateSellerValuation(input({ answers: { area: '95,5' } })).clean?.answers.area).toBe(95.5)
  })
  it('un entero no admite decimales ni sale del rango', () => {
    expect(validateSellerValuation(input({ answers: { area: 90, bedrooms: 2.5 } })).errors.surface).toBeTruthy()
    expect(validateSellerValuation(input({ answers: { area: 90, bedrooms: 99 } })).ok).toBe(false)
  })
  it('una opción que no existe es un error, no se recorta en silencio', () => {
    expect(validateSellerValuation(input({ answers: { ...flat.answers, condition: 'ruinosa' } })).errors.features).toBeTruthy()
    expect(validateSellerValuation(input({ answers: { ...flat.answers, condition: 'good' } })).ok).toBe(true)
  })
  it('lo que no es pregunta de ese tipo se descarta', () => {
    const r = validateSellerValuation(input({ answers: { ...flat.answers, plotArea: 500, isAdmin: true, price: 1 } }))
    expect(r.clean?.answers).not.toHaveProperty('plotArea')
    expect(r.clean?.answers).not.toHaveProperty('isAdmin')
    expect(r.clean?.answers).not.toHaveProperty('price')
  })
  it('los booleanos aceptan true/false y texto; otra cosa es un error', () => {
    expect(validateSellerValuation(input({ answers: { ...flat.answers, hasElevator: true, hasGarage: 'false' } })).clean?.answers).toMatchObject({ hasElevator: true, hasGarage: false })
    expect(validateSellerValuation(input({ answers: { ...flat.answers, hasElevator: 'quizá' } })).ok).toBe(false)
  })
  it('un terreno sólo necesita su superficie', () => {
    expect(validateSellerValuation({ propertyType: 'Land', location: flat.location, answers: { plotArea: 12000 } }).ok).toBe(true)
  })
  it('un chalet admite parcela y un piso la ignora', () => {
    expect(validateSellerValuation({ propertyType: 'Villa', location: flat.location, answers: { area: 220, plotArea: 800 } }).clean?.answers.plotArea).toBe(800)
  })
  it('las fotos se acotan a su tope y a texto', () => {
    const keys = Array.from({ length: 12 }, (_, i) => `seller-uploads/1/x/${i}.jpg`)
    expect(validateSellerValuation(input({ photoKeys: [...keys, 7 as any] })).clean?.photoKeys).toHaveLength(SELLER_MAX_PHOTOS)
  })
  it('el texto se limpia de caracteres de control', () => {
    expect(validateSellerValuation(input({ address: 'Calle\u0000 Mayor\n 3' })).clean?.address).toBe('Calle Mayor 3')
  })
})

describe('resumen del lead', () => {
  it('cuenta lo que respondió la persona, con las etiquetas de Property Core, y nada más', () => {
    const clean = validateSellerValuation(input({ subtype: 'loft', address: 'Calle Uría 5', answers: { ...flat.answers, condition: 'good', hasElevator: true, expectedPrice: 250000 } })).clean!
    const text = sellerValuationSummary(clean, 'Tiene vistas al parque')
    expect(text).toContain('Quiere vender: Piso (Loft)')
    expect(text).toContain('Ubicación: Oviedo, Asturias — Calle Uría 5')
    expect(text).toContain('Superficie construida: 95 m²')
    expect(text).toContain('Estado de conservación: Buen estado')
    expect(text).toContain('Ascensor: Sí')
    expect(text).toContain('Comentarios: Tiene vistas al parque')
  })
  it('no contiene ninguna cifra de valoración', () => {
    const text = sellerValuationSummary(validateSellerValuation(input()).clean!)
    expect(text).not.toMatch(/valoración estimada|precio estimado|tasación de|€/i)
  })
})

describe('opciones del bloque', () => {
  it('por defecto: todos los tipos, todas las preguntas, con fotos', () => {
    expect(normalizeSellerOptions({})).toEqual({ hiddenTypes: [], hiddenQuestions: [], questionLabels: {}, allowPhotos: true })
  })
  it('un tipo o una pregunta inventados se descartan; una obligatoria no se puede ocultar', () => {
    const o = normalizeSellerOptions({ hiddenTypes: ['Garage', 'Castillo'], hiddenQuestions: ['area', 'bedrooms', 'nope'], questionLabels: { bedrooms: ' Dormitorios ', nope: 'x', area: '' } })
    expect(o.hiddenTypes).toEqual(['Garage'])
    expect(o.hiddenQuestions).toEqual(['bedrooms'])
    expect(o.questionLabels).toEqual({ bedrooms: 'Dormitorios' })
  })
  it('siempre queda algún tipo que ofrecer', () => {
    expect(normalizeSellerOptions({ hiddenTypes: [...PROPERTY_TYPES] }).hiddenTypes).toEqual([])
  })
  it('compactSellerOptions sólo guarda textos y lo que difiere de lo de partida', () => {
    expect(compactSellerOptions({ title: 'Hola', foo: 'bar', hiddenTypes: [] })).toEqual({ title: 'Hola' })
    expect(compactSellerOptions({ allowPhotos: false, hiddenQuestions: ['terraceArea'] })).toEqual({ allowPhotos: false, hiddenQuestions: ['terraceArea'] })
  })
  it('el catálogo de preguntas no repite claves', () => {
    const keys = sellerQuestionCatalog().map((q) => q.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('Constructor Web: el bloque', () => {
  it('está en la biblioteca, sólo en «Vender propiedad», con su inspector', () => {
    const preset = BLOCK_PRESETS.find((p) => p.presetId === 'seller-valuation')!
    expect(preset).toMatchObject({ type: 'seller-valuation', category: 'Captación', pages: ['vender'] })
    expect(presetsForPage('vender').some((p) => p.presetId === 'seller-valuation')).toBe(true)
    expect(presetsForPage('inicio').some((p) => p.presetId === 'seller-valuation')).toBe(false)
    expect(BLOCK_INSPECTORS['seller-valuation']).toBeTruthy()
    expect(blockLabel('seller-valuation')).toBe('Valoración de propiedad')
    expect(blockSubtitle({ type: 'seller-valuation' })).toContain('captación')
  })
  it('la página «Vender propiedad» arranca directamente con el formulario de valoración, sin bloque introductorio (Cola 29)', () => {
    const blocks = seedPageBlocks('vender') as any[]
    // El primer bloque es el formulario de valoración (con su propio titular),
    // ya no un bloque de texto introductorio que dejaba un hueco encima.
    expect(blocks.map((b) => b.type)).toEqual(['seller-valuation'])
    expect(blocks[0].content.title).toBeTruthy()
    expect(blocks.filter((b) => b.type === 'lead-form')).toHaveLength(0)
  })
  it('el servidor guarda sus textos y opciones válidas y descarta el resto', () => {
    const doc = { blocks: [{ id: 's1', type: 'seller-valuation', version: 1, content: { title: 'Vende con nosotros', hiddenTypes: ['Garage', 'Castillo'], hiddenQuestions: ['area', 'terraceArea'], evil: '<script>' } }], seo: {} }
    const saved = validatePageDocument(doc, 'vender')
    expect(saved.blocks[0]!.content).toEqual({ title: 'Vende con nosotros', hiddenTypes: ['Garage'], hiddenQuestions: ['terraceArea'] })
  })
  it('un documento antiguo con el formulario de captación sigue siendo válido', () => {
    const doc = { blocks: [{ id: 'lead-form-vender', type: 'lead-form', version: 1, content: { purpose: 'seller', title: 'Antiguo' } }], seo: {} }
    expect(validatePageDocument(doc, 'vender').blocks[0]!.type).toBe('lead-form')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// El endpoint público, con D1 y R2 de verdad
// ---------------------------------------------------------------------------
let ipSeq = 0
function publicEvent(env: any, orgId: number, opts: { url?: string; body?: any; raw?: Uint8Array; contentType?: string; ip?: string }) {
  const raw = opts.raw
  const req: any = {
    method: 'POST',
    url: opts.url || '/api/public/contact',
    headers: {
      'content-type': opts.contentType || 'application/json',
      'cf-connecting-ip': opts.ip || `203.0.113.${(ipSeq += 1) % 250}`,
      host: 'agencia.test',
      referer: 'https://agencia.test/vender',
      ...(raw ? { 'content-length': String(raw.length) } : {}),
    },
    body: raw ? Buffer.from(raw) : JSON.stringify(opts.body ?? {}),
  }
  const res: any = { statusCode: 200, setHeader: vi.fn(), getHeader: vi.fn(), removeHeader: vi.fn() }
  const event = createEvent(req, res)
  ;(event.context as any).cloudflare = { env }
  ;(event.context as any).org = { id: orgId }
  return event
}

async function setup() {
  // Los globales que Nitro auto-importa en las rutas.
  const h3 = await import('h3')
  vi.stubGlobal('defineEventHandler', (f: any) => f)
  for (const k of ['createError', 'getQuery', 'readBody', 'getRequestHeader', 'getCookie', 'setResponseHeader', 'getRequestIP'] as const) vi.stubGlobal(k, (h3 as any)[k])
  const { DB, sqlite } = createD1Shim()
  const MEDIA = createR2Shim()
  const env = { DB, MEDIA }
  const { drizzle } = await import('drizzle-orm/d1')
  const db = drizzle(DB as any, { schema })
  const a = await seedTenant(db, 'VenderA')
  const b = await seedTenant(db, 'VenderB')
  const handler = (await import('../../server/api/public/contact.post')).default as (e: any) => Promise<any>
  const upload = async (orgId: number, bytes: Uint8Array, submissionId: string, contentType = 'image/jpeg') =>
    handler(publicEvent(env, orgId, { url: `/api/public/contact?channel=seller-photo&submissionId=${submissionId}`, raw: bytes, contentType }))
  return { db, env, MEDIA, a, b, sqlite, handler, upload }
}

const MARTA = 'marta.vende@example.com'
async function martaLeads(db: any, orgId: number) {
  return db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.email, MARTA)))
}

const submission = (over: Record<string, any> = {}) => ({
  type: 'contact',
  form: 'seller',
  name: 'Marta Propietaria',
  email: MARTA,
  phone: '+34 633 444 555',
  privacyAccepted: true,
  submissionId: `sv-test-${Math.random().toString(36).slice(2, 10)}`,
  valuation: input({ subtype: 'loft', answers: { ...flat.answers, condition: 'good', hasElevator: true } }),
  ...over,
})

describe('/api/public/contact — valoración de propiedad', () => {
  it('crea un lead real de captación con lo que contó la persona, el rol Vendedor y el hilo de la bandeja', async () => {
    const { db, env, a, handler } = await setup()
    const res = await handler(publicEvent(env, a.orgId, { body: submission() }))
    expect(res).toMatchObject({ ok: true })
    const [lead] = await martaLeads(db, a.orgId)
    expect(lead).toMatchObject({ source: 'web', sourceDetail: 'Vender propiedad', status: 'new' })
    expect(lead.originalMessage).toContain('Quiere vender: Piso (Loft)')
    expect(lead.originalMessage).toContain('Ubicación: Oviedo, Asturias')
    expect(lead.originalMessage).toContain('Superficie construida: 95 m²')
    expect(lead.propertyId).toBeNull()
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, lead.contactId!))
    expect(contact.name).toBe('Marta Propietaria')
    const roles = await db.select().from(schema.contactRoles).where(eq(schema.contactRoles.contactId, lead.contactId!))
    expect(roles.map((r: any) => r.role)).toContain('seller')
  })

  it('no crea ninguna propiedad', async () => {
    const { db, env, a, handler } = await setup()
    const before = [(await db.select().from(schema.agentProperties)).length, (await db.select().from(schema.developerProperties)).length]
    await handler(publicEvent(env, a.orgId, { body: submission() }))
    expect([(await db.select().from(schema.agentProperties)).length, (await db.select().from(schema.developerProperties)).length]).toEqual(before)
  })

  it('las características quedan guardadas, campo a campo, en el hilo y el consentimiento con su fecha', async () => {
    const { db, env, a, handler } = await setup()
    await handler(publicEvent(env, a.orgId, { body: submission() }))
    const msgs = await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.organizationId, a.orgId))
    const msg = msgs.find((m: any) => String(m.fieldsJson).includes('seller'))!
    const fields = JSON.parse(msg.fieldsJson || '{}')
    expect(fields).toMatchObject({ formType: 'seller', propertyType: 'Apartment', subtype: 'loft', location: 'Oviedo, Asturias', 'answer.area': '95', 'answer.bedrooms': '3', 'answer.condition': 'good', 'answer.hasElevator': 'true' })
    expect(fields.privacyAcceptedAt).toBeTruthy()
    expect(msg.body).toContain('Quiere vender')
  })

  it('exige aceptar la política de privacidad', async () => {
    const { db, env, a, handler } = await setup()
    await expect(handler(publicEvent(env, a.orgId, { body: submission({ privacyAccepted: false }) }))).rejects.toMatchObject({ statusCode: 422 })
    expect(await martaLeads(db, a.orgId)).toHaveLength(0)
  })

  it('valida en el servidor: un tipo inventado, sin superficie o con un subtipo ajeno no crea nada', async () => {
    const { db, env, a, handler } = await setup()
    for (const valuation of [input({ propertyType: 'Castillo' }), input({ answers: {} }), input({ subtype: 'detached_villa' }), input({ location: null })]) {
      await expect(handler(publicEvent(env, a.orgId, { body: submission({ valuation }) }))).rejects.toMatchObject({ statusCode: 422 })
    }
    expect(await martaLeads(db, a.orgId)).toHaveLength(0)
  })

  it('un teléfono que no lo parece se rechaza; sin teléfono se acepta', async () => {
    const { env, a, handler } = await setup()
    await expect(handler(publicEvent(env, a.orgId, { body: submission({ phone: 'abc' }) }))).rejects.toMatchObject({ statusCode: 422 })
    await expect(handler(publicEvent(env, a.orgId, { body: submission({ phone: '', email: 'sinfono@example.com' }) }))).resolves.toMatchObject({ ok: true })
  })

  it('el campo trampa no guarda nada', async () => {
    const { db, env, a, handler } = await setup()
    await handler(publicEvent(env, a.orgId, { body: submission({ website: 'http://spam' }) }))
    expect(await martaLeads(db, a.orgId)).toHaveLength(0)
  })

  it('un doble envío con el mismo identificador crea un solo lead', async () => {
    const { db, env, a, handler } = await setup()
    const body = submission()
    await handler(publicEvent(env, a.orgId, { body }))
    expect(await handler(publicEvent(env, a.orgId, { body }))).toMatchObject({ duplicate: true })
    expect(await martaLeads(db, a.orgId)).toHaveLength(1)
  })

  it('el lead es de la agencia que recibe la petición, nunca de otra', async () => {
    const { db, env, a, b, handler } = await setup()
    await handler(publicEvent(env, b.orgId, { body: submission({ email: 'soloB@example.com' }) }))
    expect(await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, a.orgId), eq(schema.leads.email, 'soloB@example.com')))).toHaveLength(0)
    expect(await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, b.orgId), eq(schema.leads.email, 'soloB@example.com')))).toHaveLength(1)
  })

  it('el formulario de captación antiguo (sin valoración) sigue funcionando igual', async () => {
    const { db, env, a, handler } = await setup()
    await handler(publicEvent(env, a.orgId, { body: { type: 'contact', form: 'seller', name: 'Luis', email: 'luis@example.com', message: 'Piso de 3 habitaciones' } }))
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.email, 'luis@example.com'))
    expect(lead).toMatchObject({ sourceDetail: 'Vender propiedad', originalMessage: 'Piso de 3 habitaciones' })
  })
})

describe('/api/public/contact?channel=seller-photo', () => {
  it('guarda la foto privada, registrada en la agencia, y la enlaza al lead al enviar', async () => {
    const { db, env, MEDIA, a, handler, upload } = await setup()
    const sid = 'sv-photo-test-1'
    const up = await upload(a.orgId, buildJpeg(40, 30), sid)
    expect(up.key).toMatch(new RegExp(`^seller-uploads/${a.orgId}/${sid}/[0-9a-f]{24}\\.jpg$`))
    expect(MEDIA.objects.has(up.key)).toBe(true)
    const [asset] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.r2Key, up.key))
    expect(asset).toMatchObject({ organizationId: a.orgId, visibility: 'private', mimeType: 'image/jpeg', entityType: 'seller_submission' })

    await handler(publicEvent(env, a.orgId, { body: submission({ submissionId: sid, valuation: input({ photoKeys: [up.key] }) }) }))
    const [lead] = await martaLeads(db, a.orgId)
    const [linked] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.r2Key, up.key))
    expect(linked).toMatchObject({ entityType: 'lead', entityId: lead.id })
    expect(lead.originalMessage).toContain(`Foto 1: /api/media/${up.key}`)
  })

  it('admite PNG y WebP', async () => {
    const { a, upload } = await setup()
    expect((await upload(a.orgId, buildPng(10, 10), 'sv-photo-png-1', 'image/png')).key).toMatch(/\.png$/)
    expect((await upload(a.orgId, buildWebp(10, 10), 'sv-photo-webp-1', 'image/webp')).key).toMatch(/\.webp$/)
  })

  it('el tipo se decide por los bytes, no por la cabecera: un SVG o un texto con cabecera de imagen se rechazan', async () => {
    const { a, upload } = await setup()
    await expect(upload(a.orgId, buildMaliciousSvg(), 'sv-photo-svg-1', 'image/jpeg')).rejects.toMatchObject({ statusCode: 415 })
    await expect(upload(a.orgId, new TextEncoder().encode('<html>hola</html>'), 'sv-photo-txt-1', 'image/png')).rejects.toMatchObject({ statusCode: 415 })
  })

  it('rechaza una foto de más de 5 MB y una vacía', async () => {
    const { a, upload } = await setup()
    const big = new Uint8Array(5 * 1024 * 1024 + 10)
    big.set([0xff, 0xd8, 0xff])
    await expect(upload(a.orgId, big, 'sv-photo-big-1')).rejects.toMatchObject({ statusCode: 413 })
    await expect(upload(a.orgId, new Uint8Array(0), 'sv-photo-empty-1')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('un identificador de envío mal formado se rechaza', async () => {
    const { a, upload } = await setup()
    await expect(upload(a.orgId, buildJpeg(10, 10), '../x')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('como máximo seis fotos por envío', async () => {
    const { a, upload } = await setup()
    for (let i = 0; i < SELLER_MAX_PHOTOS; i++) await upload(a.orgId, buildJpeg(10 + i, 10), 'sv-photo-max-1')
    await expect(upload(a.orgId, buildJpeg(99, 10), 'sv-photo-max-1')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('una clave de foto de otra agencia o de otro envío no se enlaza al lead', async () => {
    const { db, env, a, b, handler, upload } = await setup()
    const foreign = await upload(b.orgId, buildJpeg(11, 11), 'sv-photo-foreign-1')
    const other = await upload(a.orgId, buildJpeg(12, 12), 'sv-photo-other-1')
    await handler(publicEvent(env, a.orgId, { body: submission({ submissionId: 'sv-photo-mine-1', valuation: input({ photoKeys: [foreign.key, other.key, 'seller-uploads/../etc/passwd'] }) }) }))
    const [lead] = await martaLeads(db, a.orgId)
    expect(lead.originalMessage).not.toContain('Foto 1')
    const rows = await db.select().from(schema.mediaAssets).where(like(schema.mediaAssets.r2Key, 'seller-uploads/%'))
    expect(rows.every((r: any) => r.entityType === 'seller_submission')).toBe(true)
  })
})
