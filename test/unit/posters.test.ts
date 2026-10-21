import { beforeEach, describe, expect, it } from 'vitest'
import { schema } from '../../server/utils/db'
import {
  POSTER_FORMAT_KEYS,
  createPosterProject,
  createPosterTemplate,
  deletePosterProject,
  deletePosterTemplate,
  duplicatePosterTemplate,
  getPosterProject,
  getPosterTemplate,
  isPosterFormat,
  listPosterProjects,
  listPosterTemplates,
  normalizeStructureJson,
  updatePosterProject,
  updatePosterTemplate,
} from '../../server/utils/posters/service'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * «Carteles de escaparate» (Cola 20): plantillas y piezas por empresa, con las
 * plantillas de sistema (organization_id NULL) de sólo lectura y duplicables,
 * la estructura del editor de bloques saneada, y aislamiento multi-tenant.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

const sampleStructure = { pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'text', x: 10, y: 10, w: 100, h: 20, binding: '{{asset.title}}' }] }] }

describe('formatos de cartel', () => {
  it('sólo admite los formatos de cartel conocidos', () => {
    expect(POSTER_FORMAT_KEYS).toContain('print_a3_portrait')
    expect(POSTER_FORMAT_KEYS).toContain('print_a3_landscape')
    expect(isPosterFormat('print_a3_landscape')).toBe(true)
    expect(isPosterFormat('pdf_a4_landscape')).toBe(true)
    expect(isPosterFormat('social_story')).toBe(false) // no es de cartel
    expect(isPosterFormat('nope')).toBe(false)
  })
})

describe('estructura del editor', () => {
  it('acepta una estructura válida y rechaza una inválida con 422', () => {
    expect(JSON.parse(normalizeStructureJson(sampleStructure)).pages).toHaveLength(1)
    expect(JSON.parse(normalizeStructureJson(undefined)).pages).toEqual([])
    expect(() => normalizeStructureJson({ pages: [{ id: 'p', elements: [{ id: 'x', type: 'bogus', x: 0, y: 0, w: 1, h: 1 }] }] })).toThrow()
  })
})

describe('plantillas: CRUD, sistema vs propia, aislamiento', () => {
  it('crear exige nombre y formato válido; se guarda la estructura saneada', async () => {
    await expect(createPosterTemplate(db, A.orgId, { name: '  ', formatKey: 'print_a3_portrait' }, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    await expect(createPosterTemplate(db, A.orgId, { name: 'X', formatKey: 'social_story' }, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    const t = await createPosterTemplate(db, A.orgId, { name: 'Cartel venta', formatKey: 'print_a3_portrait', structure: sampleStructure }, A.userId)
    expect(t).toMatchObject({ name: 'Cartel venta', formatKey: 'print_a3_portrait', isSystem: false, status: 'draft' })
    expect(t.structure.pages).toHaveLength(1)
    expect((await listPosterTemplates(db, A.orgId)).map((x) => x.id)).toContain(t.id)
  })

  it('una plantilla de sistema (org NULL, publicada) se ve pero no se edita ni se borra; se duplica a una propia', async () => {
    const ts = '2026-01-01 00:00:00'
    const [sys] = await db
      .insert(schema.posterTemplates)
      .values({ organizationId: null, name: 'Sistema A3', category: 'escaparate', formatKey: 'print_a3_portrait', isSystem: 1, status: 'published', structureJson: JSON.stringify(sampleStructure), createdAt: ts, updatedAt: ts })
      .returning()
    // Visible para cualquier empresa.
    expect((await listPosterTemplates(db, A.orgId)).some((x) => x.id === sys.id && x.isSystem)).toBe(true)
    expect((await getPosterTemplate(db, A.orgId, sys.id)).isSystem).toBe(true)
    // No editable ni borrable como propia (no pertenece a la empresa) → 404.
    await expect(updatePosterTemplate(db, A.orgId, sys.id, { name: 'otro' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deletePosterTemplate(db, A.orgId, sys.id)).rejects.toMatchObject({ statusCode: 404 })
    // Duplicar crea una propia editable.
    const copy = await duplicatePosterTemplate(db, A.orgId, sys.id, A.userId)
    expect(copy).toMatchObject({ isSystem: false, status: 'draft' })
    expect(copy.name).toContain('copia')
    const edited = await updatePosterTemplate(db, A.orgId, copy.id, { name: 'Mi cartel', status: 'published' })
    expect(edited).toMatchObject({ name: 'Mi cartel', status: 'published' })
  })

  it('una plantilla de sistema en borrador no es visible para las empresas', async () => {
    const ts = '2026-01-01 00:00:00'
    const [draftSys] = await db
      .insert(schema.posterTemplates)
      .values({ organizationId: null, name: 'Borrador sistema', category: 'escaparate', formatKey: 'print_a3_portrait', isSystem: 1, status: 'draft', structureJson: '{"pages":[]}', createdAt: ts, updatedAt: ts })
      .returning()
    expect((await listPosterTemplates(db, A.orgId)).some((x) => x.id === draftSys.id)).toBe(false)
    await expect(getPosterTemplate(db, A.orgId, draftSys.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('cada empresa sólo ve y gestiona sus plantillas', async () => {
    const a = await createPosterTemplate(db, A.orgId, { name: 'A', formatKey: 'print_a3_portrait' }, A.userId)
    const b = await createPosterTemplate(db, B.orgId, { name: 'B', formatKey: 'print_a3_portrait' }, B.userId)
    await expect(getPosterTemplate(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(deletePosterTemplate(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await deletePosterTemplate(db, A.orgId, a.id)
    expect((await listPosterTemplates(db, A.orgId)).some((x) => x.id === a.id)).toBe(false)
    expect((await listPosterTemplates(db, B.orgId)).some((x) => x.id === b.id)).toBe(true)
  })
})

describe('piezas: crear desde plantilla + propiedad, editar, aislamiento', () => {
  it('crear copia la estructura y el formato de la plantilla; exige tipo y propiedad válidos', async () => {
    const t = await createPosterTemplate(db, A.orgId, { name: 'Base', formatKey: 'print_a3_portrait', structure: sampleStructure }, A.userId)
    await expect(createPosterProject(db, A.orgId, { templateId: t.id, assetKind: 'nope', assetId: 1 }, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    await expect(createPosterProject(db, A.orgId, { templateId: t.id, assetKind: 'developer_property', assetId: 0 }, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    const p = await createPosterProject(db, A.orgId, { templateId: t.id, assetKind: 'developer_property', assetId: 42, name: 'Cartel piso' }, A.userId)
    expect(p).toMatchObject({ assetKind: 'developer_property', assetId: 42, formatKey: 'print_a3_portrait', status: 'draft', name: 'Cartel piso', templateId: t.id })
    expect(p.structure.pages).toHaveLength(1)
    const u = await updatePosterProject(db, A.orgId, p.id, { status: 'ready', structure: { pages: [] } })
    expect(u).toMatchObject({ status: 'ready' })
    expect(u.structure.pages).toEqual([])
  })

  it('no se puede crear una pieza desde una plantilla de otra empresa', async () => {
    const tb = await createPosterTemplate(db, B.orgId, { name: 'B', formatKey: 'print_a3_portrait' }, B.userId)
    await expect(createPosterProject(db, A.orgId, { templateId: tb.id, assetKind: 'developer_property', assetId: 1 }, A.userId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('las piezas están aisladas por empresa', async () => {
    const t = await createPosterTemplate(db, A.orgId, { name: 'T', formatKey: 'print_a3_portrait' }, A.userId)
    const p = await createPosterProject(db, A.orgId, { templateId: t.id, assetKind: 'agent_property', assetId: 7 }, A.userId)
    expect((await listPosterProjects(db, A.orgId)).map((x) => x.id)).toContain(p.id)
    expect(await listPosterProjects(db, B.orgId)).toHaveLength(0)
    await expect(getPosterProject(db, B.orgId, p.id)).rejects.toMatchObject({ statusCode: 404 })
    await deletePosterProject(db, A.orgId, p.id)
    expect(await listPosterProjects(db, A.orgId)).toHaveLength(0)
  })

  it('sin empresa activa, todo es 403', async () => {
    await expect(listPosterTemplates(db, null)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createPosterProject(db, null, {}, null)).rejects.toMatchObject({ statusCode: 403 })
  })
})
