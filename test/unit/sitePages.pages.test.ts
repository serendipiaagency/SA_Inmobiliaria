import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getOrCreateSitePage,
  getPublishedPage,
  listPageVersions,
  listSitePageStatuses,
  publishPage,
  requireValidPageKey,
  resetSitePage,
  saveDraft,
  seedPageDocument,
  validatePageDocument,
} from '../../server/utils/sitePages'
import { CATALOG_FILTER_GROUPS, PAGE_CORE_TYPE, SITE_PAGES, SITE_PAGE_KEYS, sitePageDef } from '../../utils/siteBuilder/pages'
import { messages } from '../../i18n/messages'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Las páginas del Constructor Web (utils/siteBuilder/pages.ts): cada página
 * de la lista «Páginas» se abre, se edita, se publica y se restablece por su
 * clave, con su propia fila en `site_pages`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

function statusCode(fn: () => unknown): number | null {
  try {
    fn()
    return null
  } catch (e: any) {
    return e?.statusCode ?? -1
  }
}

describe('catálogo de páginas', () => {
  it('las siete páginas de la lista del editor, con la portada primero y claves únicas', () => {
    expect(SITE_PAGES.map((p) => p.label)).toEqual(['Inicio', 'Propiedades', 'Ficha de propiedad', 'Vender Propiedad', 'Nosotros', 'Servicios', 'Contacto', 'Blog'])
    expect(new Set(SITE_PAGE_KEYS).size).toBe(SITE_PAGE_KEYS.length)
    expect(SITE_PAGES[0].key).toBe('home')
  })

  it('cada página funcional declara su zona dinámica y las demás ninguna', () => {
    for (const p of SITE_PAGES) {
      if (p.kind === 'functional') expect(p.core, p.key).toBeTruthy()
      else expect(p.core, p.key).toBeUndefined()
    }
  })

  it('requireValidPageKey admite las claves del catálogo y nada más', () => {
    for (const key of SITE_PAGE_KEYS) expect(requireValidPageKey(key)).toBe(key)
    for (const bad of ['', 'admin', 'home2', '../home', 'Nosotros', null, undefined]) expect(statusCode(() => requireValidPageKey(bad as any)), String(bad)).toBe(404)
  })

  it('cada página (salvo la portada) la sirve una página pública que pide su documento', () => {
    // Si la página pública no pide su documento, publicar en el editor no
    // cambiaría nada en la web: el fallo silencioso que esto evita.
    const files: Record<string, string> = {
      propiedades: 'pages/propiedades/index.vue',
      'ficha-propiedad': 'pages/propiedades/[slug].vue',
      vender: 'pages/vender.vue',
      nosotros: 'pages/nosotros.vue',
      servicios: 'pages/servicios.vue',
      contacto: 'pages/contacto.vue',
      blog: 'pages/blog/index.vue',
    }
    for (const p of SITE_PAGES.filter((x) => x.kind !== 'home')) {
      const file = join(ROOT, files[p.key])
      expect(existsSync(file), `${p.key}: falta ${files[p.key]}`).toBe(true)
      const src = readFileSync(file, 'utf8')
      expect(src, `${files[p.key]} no pide la página «${p.key}»`).toContain(`useSitePage('${p.key}')`)
      expect(src, `${files[p.key]} no usa SitePageLayout`).toContain('<SitePageLayout')
    }
  })
})

describe('siembra: el primer borrador es lo que la web ya enseña', () => {
  it('la portada arranca vacía, como siempre', async () => {
    const page = await getOrCreateSitePage(db, A.orgId, 'home')
    expect(JSON.parse(page.draftJson).blocks).toEqual([])
  })

  it('Nosotros: los textos de la página actual, editables', async () => {
    const page = await getOrCreateSitePage(db, A.orgId, 'nosotros')
    const blocks = JSON.parse(page.draftJson).blocks
    expect(blocks.map((b: any) => b.type)).toEqual(['text', 'cta'])
    expect(blocks[0].content.title).toBe(messages.es['aboutUs.hero.title'])
    expect(blocks[0].content.body).toContain(messages.es['aboutUs.body.paragraph1'])
    expect(blocks[0].content.body).toContain(messages.es['aboutUs.body.paragraph2'])
    expect(blocks[1].content.ctaPrimaryTo).toBe('/propiedades')
    expect(blocks[1].content.ctaSecondaryTo).toBe('/contacto')
  })

  it('Contacto: el formulario, que crea un lead real', async () => {
    const blocks = JSON.parse((await getOrCreateSitePage(db, A.orgId, 'contacto')).draftJson).blocks
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('lead-form')
    expect(blocks[0].content.title).toBe(messages.es['contact.title'])
    expect(blocks[0].content.submitLabel).toBe(messages.es['contact.form.submit'])
  })

  it.each(SITE_PAGES.filter((p) => p.kind === 'functional').map((p) => [p.key, p.core]))('%s: sólo su zona dinámica (%s)', async (key, core) => {
    const blocks = JSON.parse((await getOrCreateSitePage(db, A.orgId, key as string)).draftJson).blocks
    expect(blocks).toEqual([{ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core } }])
  })

  it.each(SITE_PAGE_KEYS)('la siembra de «%s» es un documento válido para su página', (key) => {
    expect(() => validatePageDocument(seedPageDocument(key), key)).not.toThrow()
  })
})

describe('zona dinámica: ni se quita, ni se repite, ni se lleva a otra página', () => {
  const core = (c: string, extra: Record<string, any> = {}) => ({ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core: c }, ...extra })
  const cta = { id: 'cta-1', type: 'cta', version: 1, content: { title: 'Hola' } }

  it('una página funcional sin su zona, con dos o con la de otra página: 422', () => {
    expect(statusCode(() => validatePageDocument({ blocks: [cta] }, 'propiedades'))).toBe(422)
    expect(statusCode(() => validatePageDocument({ blocks: [core('properties-listing'), { ...core('properties-listing'), id: 'otra' }] }, 'propiedades'))).toBe(422)
    expect(statusCode(() => validatePageDocument({ blocks: [core('blog-index')] }, 'propiedades'))).toBe(422)
  })

  it('secciones encima y debajo de la zona, sí; y la zona pierde cualquier opción que le llegue', () => {
    const doc = validatePageDocument(
      { blocks: [cta, core('properties-listing', { style: { background: 'ink' }, visibility: { mobile: false }, nodeStyles: { title: { color: '#ff0000' } } }), { ...cta, id: 'cta-2' }] },
      'propiedades',
    )
    expect(doc.blocks.map((b) => b.id)).toEqual(['cta-1', PAGE_CORE_TYPE, 'cta-2'])
    const z = doc.blocks[1]
    expect(z.content).toEqual({ core: 'properties-listing' })
    expect(z.style).toBeUndefined()
    expect(z.visibility).toBeUndefined()
    expect(z.nodeStyles).toBeUndefined()
  })

  it('la ficha guarda sólo sus opciones (destacadas: mostrar y título); lo demás se descarta', () => {
    const doc = validatePageDocument(
      { blocks: [{ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core: 'property-detail', showFeatured: false, featuredTitle: '  Nuestra selección  ', price: 1, html: '<b>x</b>' } }] },
      'ficha-propiedad',
    )
    expect(doc.blocks[0].content).toEqual({ core: 'property-detail', showFeatured: false, featuredTitle: 'Nuestra selección' })
    // Tipos equivocados o textos vacíos, fuera; y en otra página funcional esas opciones no existen.
    const bad = validatePageDocument({ blocks: [{ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core: 'property-detail', showFeatured: 'no', featuredTitle: '   ' } }] }, 'ficha-propiedad')
    expect(bad.blocks[0].content).toEqual({ core: 'property-detail' })
    const listing = validatePageDocument({ blocks: [core('properties-listing', { content: { core: 'properties-listing', showFeatured: false } })] }, 'propiedades')
    expect(listing.blocks[0].content).toEqual({ core: 'properties-listing' })
  })

  it('el catálogo guarda sólo el orden y la visibilidad de sus filtros, completos', () => {
    const doc = validatePageDocument(
      { blocks: [core('properties-listing', { content: { core: 'properties-listing', filters: [{ key: 'price' }, { key: 'area', visible: false }, { key: 'nope' }], sections: [{ key: 'datos' }], html: '<b>x</b>' } })] },
      'propiedades',
    )
    const content = doc.blocks[0].content as any
    expect(Object.keys(content).sort()).toEqual(['core', 'filters'])
    expect(content.filters.slice(0, 2)).toEqual([{ key: 'price', visible: true }, { key: 'area', visible: false }])
    expect(content.filters).toHaveLength(CATALOG_FILTER_GROUPS.length)
    // En la ficha, los filtros no existen.
    const ficha = validatePageDocument({ blocks: [{ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core: 'property-detail', filters: [{ key: 'price' }] } }] }, 'ficha-propiedad')
    expect(ficha.blocks[0].content).toEqual({ core: 'property-detail' })
  })

  it('en la portada y en las páginas de contenido no puede haber zona dinámica', () => {
    for (const key of ['home', 'nosotros', 'servicios', 'contacto']) {
      expect(statusCode(() => validatePageDocument({ blocks: [core('properties-listing')] }, key)), key).toBe(422)
    }
  })
})

describe('publicar, leer y volver a la original, página a página', () => {
  it('sin publicar, la web sabe que tiene que enseñar lo de siempre', async () => {
    await getOrCreateSitePage(db, A.orgId, 'nosotros')
    const pub = await getPublishedPage(db, A.orgId, 'nosotros')
    expect(pub.published).toBe(false)
    expect(pub.blocks).toEqual([])
  })

  it('publicar una página no toca las demás ni la portada', async () => {
    const draft = seedPageDocument('nosotros')
    draft.blocks[0].content.title = 'Somos de Gijón'
    await saveDraft(db, A.orgId, 'nosotros', draft)
    await publishPage(db, A.orgId, 'nosotros', A.userId)

    const nosotros = await getPublishedPage(db, A.orgId, 'nosotros')
    expect(nosotros.published).toBe(true)
    expect(nosotros.blocks[0].content.title).toBe('Somos de Gijón')
    expect((await getPublishedPage(db, A.orgId, 'home')).published).toBe(false)
    expect((await getPublishedPage(db, A.orgId, 'contacto')).published).toBe(false)
    // Ni a otra empresa.
    expect((await getPublishedPage(db, B.orgId, 'nosotros')).published).toBe(false)
  })

  it('volver a la original: la web deja de servir lo publicado, el borrador vuelve a la siembra y el historial se queda', async () => {
    const draft = seedPageDocument('contacto')
    draft.blocks[0].content.title = 'Escríbenos'
    await saveDraft(db, A.orgId, 'contacto', draft)
    await publishPage(db, A.orgId, 'contacto', A.userId)

    const doc = await resetSitePage(db, A.orgId, 'contacto')
    expect(doc).toEqual(seedPageDocument('contacto'))
    expect((await getPublishedPage(db, A.orgId, 'contacto')).published).toBe(false)
    expect(JSON.parse((await getOrCreateSitePage(db, A.orgId, 'contacto')).draftJson)).toEqual(seedPageDocument('contacto'))

    const versions = await listPageVersions(db, A.orgId, 'contacto')
    expect(versions).toHaveLength(1)
    expect(versions[0].isCurrent, 'ninguna versión se sirve tras restablecer').toBe(false)
  })

  it('la portada no se restablece: no tiene una versión de siempre a la que volver', async () => {
    await expect(resetSitePage(db, A.orgId, 'home')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('restablecer en una empresa no toca la misma página de otra', async () => {
    for (const org of [A, B]) {
      await saveDraft(db, org.orgId, 'nosotros', seedPageDocument('nosotros'))
      await publishPage(db, org.orgId, 'nosotros', org.userId)
    }
    await resetSitePage(db, A.orgId, 'nosotros')
    expect((await getPublishedPage(db, A.orgId, 'nosotros')).published).toBe(false)
    expect((await getPublishedPage(db, B.orgId, 'nosotros')).published).toBe(true)
  })
})

describe('estado de las páginas para el panel «Páginas»', () => {
  it('sin abrir, abiertas, publicadas y con cambios — sin crear filas al listar', async () => {
    const first = await listSitePageStatuses(db, A.orgId)
    expect(first.map((s) => s.pageKey)).toEqual(SITE_PAGE_KEYS)
    expect(first.every((s) => s.untouched && !s.published)).toBe(true)

    await getOrCreateSitePage(db, A.orgId, 'nosotros')
    let st = (await listSitePageStatuses(db, A.orgId)).find((s) => s.pageKey === 'nosotros')!
    expect(st).toMatchObject({ untouched: false, published: false })

    await publishPage(db, A.orgId, 'nosotros', A.userId)
    st = (await listSitePageStatuses(db, A.orgId)).find((s) => s.pageKey === 'nosotros')!
    expect(st).toMatchObject({ published: true, hasUnpublishedChanges: false, version: 1 })

    const draft = seedPageDocument('nosotros')
    draft.blocks[0].content.title = 'Otro título'
    await saveDraft(db, A.orgId, 'nosotros', draft)
    st = (await listSitePageStatuses(db, A.orgId)).find((s) => s.pageKey === 'nosotros')!
    expect(st.hasUnpublishedChanges).toBe(true)

    // Otra empresa: todo sin abrir.
    expect((await listSitePageStatuses(db, B.orgId)).every((s) => s.untouched)).toBe(true)
    expect(sitePageDef('nosotros')?.path).toBe('/nosotros')
  })
})
