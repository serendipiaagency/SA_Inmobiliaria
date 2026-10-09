import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import { buildFakePdfHtml, buildPng, buildValidPdf } from './helpers/mediaFixtures'

/**
 * Bloque N7a del núcleo inmobiliario (FASES 6, 7, 25 y 26), sobre una base
 * real (sqlite + migraciones reales) y un R2 simulado en memoria:
 *
 *  - documentos de propiedad: subida validada, permisos de descarga por
 *    visibilidad (interno, propietario, comprador autorizado, público), ajeno
 *    y papelera → denegado, conceder y revocar;
 *  - multimedia: metadatos por recurso y su efecto en lo público (web,
 *    tarjetas y lo que se entrega a un portal), borrar una foto sin dejar
 *    huérfanos el fichero ni su registro;
 *  - PropertySchemaRegistry: `publicFields` en la proyección pública,
 *    `portalFields` en el listado de portales y el registro en los dos
 *    catálogos (variantes de obra nueva);
 *  - resumen de la ficha y validación inmediata por campo.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
// server/utils/media.ts usa el `createError` global de Nitro.
vi.stubGlobal('createError', createError)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ts = '2026-01-01 00:00:00'
let seq = 0

function fakeBucket() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    async put(key: string, bytes: Uint8Array) {
      objects.set(key, bytes)
    },
    async delete(key: string) {
      objects.delete(key)
    },
  }
}

function makeEvent(db: any, bucket = fakeBucket()) {
  return { event: { context: { db, cloudflare: { env: { DB: {}, MEDIA: bucket } } } } as any, bucket }
}

const staffUser = (f: TenantFixture) => ({ id: f.userId, role: 'admin', email: 'admin@example.com', name: 'Admin', organizationId: f.orgId, permissions: null }) as any

async function contact(db: any, orgId: number, email: string | null = null) {
  seq++
  const [row] = await db
    .insert(schema.contacts)
    .values({ organizationId: orgId, name: `Contacto ${seq}`, email, normalizedEmail: email ? email.toLowerCase() : null, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

async function linkOwner(db: any, orgId: number, kind: 'agent' | 'developer', propertyId: number, contactId: number, role = 'owner') {
  await db.insert(schema.propertyContacts).values({ organizationId: orgId, propertyKind: kind, propertyId, contactId, role, createdAt: ts, updatedAt: ts })
}

async function uploadDoc(f: TenantFixture, db: any, fields: Record<string, string>, bytes?: Uint8Array, bucket = fakeBucket()) {
  const { createPropertyDocumentFromUpload } = await import('../../server/utils/properties/documents')
  const { event } = makeEvent(db, bucket)
  const data = bytes ?? (await buildValidPdf())
  const parts = [
    { name: 'file', filename: 'escritura firmada.pdf', type: 'application/pdf', data },
    ...Object.entries({ propertyKind: 'developer', propertyId: String(f.projectId), docType: 'deed', title: 'Escritura', ...fields }).map(([name, v]) => ({ name, data: new TextEncoder().encode(v) })),
  ]
  return createPropertyDocumentFromUpload(event, db, f.orgId, staffUser(f), parts as any)
}

async function assetFor(db: any, key: string) {
  return (await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.r2Key, key)))[0]
}

// ---------------------------------------------------------------------------
// FASE 6 — documentos
// ---------------------------------------------------------------------------

describe('N7a · documentos: subida', () => {
  it('sube un PDF válido a R2 bajo la organización, registrado como confidencial y ligado al documento', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DocUpA')
    const bucket = fakeBucket()
    const res = await uploadDoc(a, db, { visibility: 'owner', issuedAt: '2025-01-10', expiresAt: '2035-01-10' }, undefined, bucket)
    const [doc] = await db.select().from(schema.propertyDocuments).where(eq(schema.propertyDocuments.id, res.id))
    expect(doc).toMatchObject({ organizationId: a.orgId, propertyKind: 'developer', propertyId: a.projectId, docType: 'deed', visibility: 'owner', mimeType: 'application/pdf', createdBy: a.userId })
    expect(doc.r2Key).toMatch(new RegExp(`^tenants/${a.orgId}/property-documents/`))
    expect(doc.fileName).toBe('escritura firmada.pdf')
    expect(bucket.objects.has(doc.r2Key)).toBe(true)
    const asset = await assetFor(db, doc.r2Key)
    expect(asset).toMatchObject({ organizationId: a.orgId, visibility: 'confidential', category: 'property-document', entityType: 'property_documents', entityId: doc.id })
    expect(res.document.downloadUrl).toBe(`/api/media/${doc.r2Key}`)
  })

  it('valida antes de escribir: propiedad ajena 404, en la papelera 422, metadatos 422 y contenido falso 415 — sin tocar R2', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DocValA')
    const b = await seedTenant(db, 'DocValB')
    const bucket = fakeBucket()
    await expect(uploadDoc(a, db, { propertyId: String(b.projectId) }, undefined, bucket)).rejects.toMatchObject({ statusCode: 404 })
    await expect(uploadDoc(a, db, { docType: 'pasaporte' }, undefined, bucket)).rejects.toMatchObject({ statusCode: 422 })
    await expect(uploadDoc(a, db, { issuedAt: '2026-05-01', expiresAt: '2026-01-01' }, undefined, bucket)).rejects.toMatchObject({ statusCode: 422 })
    await expect(uploadDoc(a, db, { title: '   ' }, undefined, bucket)).rejects.toMatchObject({ statusCode: 422 })
    await expect(uploadDoc(a, db, {}, buildFakePdfHtml(), bucket)).rejects.toMatchObject({ statusCode: 415 })
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, a.projectId))
    await expect(uploadDoc(a, db, {}, undefined, bucket)).rejects.toMatchObject({ statusCode: 422 })
    expect(bucket.objects.size).toBe(0)
    expect(await db.select().from(schema.propertyDocuments)).toHaveLength(0)
  })

  it('documentInputFromBody normaliza fechas y rechaza lo que no casa', async () => {
    const { documentInputFromBody } = await import('../../server/utils/properties/documents')
    expect(documentInputFromBody({ title: ' Nota simple ', docType: 'land_registry_note', issuedAt: '2026-02-03T10:00:00', expiresAt: '' }, { isCreate: true })).toEqual({
      title: 'Nota simple',
      docType: 'land_registry_note',
      issuedAt: '2026-02-03',
      expiresAt: null,
    })
    expect(() => documentInputFromBody({ visibility: 'todos' })).toThrow(/Visibilidad/)
    expect(() => documentInputFromBody({ expiresAt: '31/12/2026' })).toThrow(/AAAA-MM-DD/)
    expect(() => documentInputFromBody({ expiresAt: '2026-01-01' }, { isCreate: false, existing: { issuedAt: '2026-06-01' } })).toThrow(/anterior/)
  })
})

describe('N7a · documentos: quién puede descargar', () => {
  let db: any
  let a: TenantFixture
  let b: TenantFixture

  beforeEach(async () => {
    ;({ db } = createTestDb())
    a = await seedTenant(db, `DocAccA${++seq}`)
    b = await seedTenant(db, `DocAccB${++seq}`)
  })

  async function docWith(visibility: string) {
    const res = await uploadDoc(a, db, { visibility, title: `Doc ${visibility}` })
    const [doc] = await db.select().from(schema.propertyDocuments).where(eq(schema.propertyDocuments.id, res.id))
    const asset = await assetFor(db, doc.r2Key)
    return { doc, asset }
  }

  it('equipo: su agencia con lectura de propiedades sí; otra agencia o sin permiso, no', async () => {
    const { decideDocumentAccess } = await import('../../server/utils/properties/documents')
    const { asset } = await docWith('internal')
    expect(await decideDocumentAccess(db, asset, { kind: 'staff', orgId: a.orgId, userId: a.userId, email: null, canReadProperties: true })).toMatchObject({ allowed: true, via: 'internal' })
    expect((await decideDocumentAccess(db, asset, { kind: 'staff', orgId: b.orgId, userId: b.userId, email: null, canReadProperties: true })).allowed).toBe(false)
    expect((await decideDocumentAccess(db, asset, { kind: 'staff', orgId: a.orgId, userId: a.userId, email: null, canReadProperties: false })).allowed).toBe(false)
    expect((await decideDocumentAccess(db, asset, { kind: 'anonymous' })).allowed).toBe(false)
  })

  it('propietario (desde «Mi cuenta», por su email): ve «propietario» y «comprador autorizado», nunca «interno»', async () => {
    const { decideDocumentAccess } = await import('../../server/utils/properties/documents')
    const owner = await contact(db, a.orgId, 'Dueña@Example.com')
    await linkOwner(db, a.orgId, 'developer', a.projectId, owner.id, 'co_owner')
    const viewer = { kind: 'client' as const, orgId: a.orgId, userId: 999, email: 'DUEÑA@example.com' }
    expect((await decideDocumentAccess(db, (await docWith('internal')).asset, viewer)).allowed).toBe(false)
    expect(await decideDocumentAccess(db, (await docWith('owner')).asset, viewer)).toMatchObject({ allowed: true, via: 'owner' })
    expect(await decideDocumentAccess(db, (await docWith('authorized_buyer')).asset, viewer)).toMatchObject({ allowed: true, via: 'owner' })
    // Un inquilino o un contacto de la propiedad no es propietario.
    const tenant = await contact(db, a.orgId, 'inquilino@example.com')
    await linkOwner(db, a.orgId, 'developer', a.projectId, tenant.id, 'tenant')
    expect((await decideDocumentAccess(db, (await docWith('owner')).asset, { ...viewer, email: 'inquilino@example.com' })).allowed).toBe(false)
    // El mismo email en otra agencia no abre nada aquí.
    expect((await decideDocumentAccess(db, (await docWith('owner')).asset, { ...viewer, orgId: b.orgId })).allowed).toBe(false)
  })

  it('comprador autorizado: sólo con acceso concedido y sólo si el documento es «comprador autorizado» o superior; revocar lo quita', async () => {
    const { decideDocumentAccess, grantDocumentAccess, revokeDocumentAccess } = await import('../../server/utils/properties/documents')
    const buyer = await contact(db, a.orgId, 'comprador@example.com')
    const viewer = { kind: 'client' as const, orgId: a.orgId, userId: 998, email: 'comprador@example.com' }
    const { doc, asset } = await docWith('authorized_buyer')
    expect((await decideDocumentAccess(db, asset, viewer)).allowed).toBe(false)
    await grantDocumentAccess(db, a.orgId, a.userId, doc, buyer.id)
    expect((await grantDocumentAccess(db, a.orgId, a.userId, doc, buyer.id)).alreadyGranted).toBe(true)
    expect(await db.select().from(schema.propertyDocumentAccess)).toHaveLength(1)
    expect(await decideDocumentAccess(db, asset, viewer)).toMatchObject({ allowed: true, via: 'granted' })
    // Con «propietario» el acceso concedido no cuenta (se conserva, sin efecto).
    await db.update(schema.propertyDocuments).set({ visibility: 'owner' }).where(eq(schema.propertyDocuments.id, doc.id))
    expect((await decideDocumentAccess(db, asset, viewer)).allowed).toBe(false)
    await db.update(schema.propertyDocuments).set({ visibility: 'authorized_buyer' }).where(eq(schema.propertyDocuments.id, doc.id))
    await revokeDocumentAccess(db, a.orgId, doc, buyer.id)
    expect((await decideDocumentAccess(db, asset, viewer)).allowed).toBe(false)
  })

  it('conceder: contacto de otra agencia 404; documento o propiedad en la papelera 422', async () => {
    const { grantDocumentAccess } = await import('../../server/utils/properties/documents')
    const foreign = await contact(db, b.orgId, 'ajeno@example.com')
    const mine = await contact(db, a.orgId, 'mio@example.com')
    const { doc } = await docWith('authorized_buyer')
    await expect(grantDocumentAccess(db, a.orgId, a.userId, doc, foreign.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(grantDocumentAccess(db, a.orgId, a.userId, { ...doc, deletedAt: ts }, mine.id)).rejects.toMatchObject({ statusCode: 422 })
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, a.projectId))
    await expect(grantDocumentAccess(db, a.orgId, a.userId, doc, mine.id)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('público: sólo con la propiedad publicada y viva; con la propiedad en la papelera, sólo el equipo', async () => {
    const { decideDocumentAccess, listPublicPropertyDocuments } = await import('../../server/utils/properties/documents')
    const owner = await contact(db, a.orgId, 'dueno@example.com')
    await linkOwner(db, a.orgId, 'developer', a.projectId, owner.id)
    const { asset } = await docWith('public')
    expect((await decideDocumentAccess(db, asset, { kind: 'anonymous' })).allowed).toBe(false)
    expect(await listPublicPropertyDocuments(db, a.orgId, 'developer', a.projectId)).toEqual([])
    await db.update(schema.developerProperties).set({ publishedAt: ts }).where(eq(schema.developerProperties.id, a.projectId))
    expect(await decideDocumentAccess(db, asset, { kind: 'anonymous' })).toMatchObject({ allowed: true, via: 'public' })
    const listed = await listPublicPropertyDocuments(db, a.orgId, 'developer', a.projectId)
    expect(listed).toHaveLength(1)
    expect(listed[0]).not.toHaveProperty('r2Key')
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, a.projectId))
    expect((await decideDocumentAccess(db, asset, { kind: 'anonymous' })).allowed).toBe(false)
    expect((await decideDocumentAccess(db, asset, { kind: 'client', orgId: a.orgId, userId: 1, email: 'dueno@example.com' })).allowed).toBe(false)
    expect((await decideDocumentAccess(db, asset, { kind: 'staff', orgId: a.orgId, userId: a.userId, email: null, canReadProperties: true })).allowed).toBe(true)
  })

  it('papelera: el documento deja de servirse a todos (también al equipo) y su fichero deja de contar; restaurar lo devuelve, salvo purgado (409)', async () => {
    const { decideDocumentAccess, trashDocumentFile, restoreDocumentFile } = await import('../../server/utils/properties/documents')
    const { doc } = await docWith('internal')
    const staff = { kind: 'staff' as const, orgId: a.orgId, userId: a.userId, email: null, canReadProperties: true }
    await db.update(schema.propertyDocuments).set({ deletedAt: ts }).where(eq(schema.propertyDocuments.id, doc.id))
    await trashDocumentFile(db, a.orgId, doc)
    const trashedAsset = await assetFor(db, doc.r2Key)
    expect(trashedAsset.deletedAt).toBeTruthy()
    expect((await decideDocumentAccess(db, trashedAsset, staff)).allowed).toBe(false)
    expect((await decideDocumentAccess(db, { ...trashedAsset, deletedAt: null }, staff)).allowed).toBe(false)
    await restoreDocumentFile(db, a.orgId, doc)
    await db.update(schema.propertyDocuments).set({ deletedAt: null }).where(eq(schema.propertyDocuments.id, doc.id))
    const restored = await assetFor(db, doc.r2Key)
    expect(restored.deletedAt).toBeNull()
    expect((await decideDocumentAccess(db, restored, staff)).allowed).toBe(true)
    await db.update(schema.mediaAssets).set({ deletedAt: ts, purgedAt: ts }).where(eq(schema.mediaAssets.id, restored.id))
    await expect(restoreDocumentFile(db, a.orgId, doc)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('un fichero de otra agencia nunca se sirve con la sesión de ésta, aunque se conozca la clave', async () => {
    const { decideDocumentAccess } = await import('../../server/utils/properties/documents')
    const resB = await uploadDoc(b, db, { visibility: 'owner' })
    const [docB] = await db.select().from(schema.propertyDocuments).where(eq(schema.propertyDocuments.id, resB.id))
    const assetB = await assetFor(db, docB.r2Key)
    expect((await decideDocumentAccess(db, assetB, { kind: 'staff', orgId: a.orgId, userId: a.userId, email: null, canReadProperties: true })).allowed).toBe(false)
    // Un registro de media que dijera ser de A pero apuntara a un documento de B tampoco casa.
    expect((await decideDocumentAccess(db, { ...assetB, organizationId: a.orgId }, { kind: 'staff', orgId: a.orgId, userId: a.userId, email: null, canReadProperties: true })).allowed).toBe(false)
  })

  it('pestaña «Documentos» del contacto: lo que ve y por qué, con los concedidos sin efecto marcados', async () => {
    const { grantDocumentAccess, listContactDocuments } = await import('../../server/utils/properties/documents')
    const person = await contact(db, a.orgId, 'persona@example.com')
    await linkOwner(db, a.orgId, 'agent', a.propertyId, person.id)
    const ownerDoc = await uploadDoc(a, db, { propertyKind: 'agent', propertyId: String(a.propertyId), visibility: 'owner', title: 'Escritura 2ª mano' })
    await uploadDoc(a, db, { propertyKind: 'agent', propertyId: String(a.propertyId), visibility: 'internal', title: 'Interno' })
    const granted = await docWith('authorized_buyer')
    const grantedInternal = await docWith('internal')
    await grantDocumentAccess(db, a.orgId, a.userId, granted.doc, person.id)
    await grantDocumentAccess(db, a.orgId, a.userId, grantedInternal.doc, person.id)
    const list = await listContactDocuments(db, a.orgId, [person.id], { includeInactiveGrants: true })
    const byId = new Map(list.map((d: any) => [d.id, d]))
    expect(byId.get(ownerDoc.id)).toMatchObject({ accessVia: 'owner', accessLabel: 'Como propietario' })
    expect(byId.get(granted.doc.id)).toMatchObject({ accessVia: 'granted' })
    expect(byId.get(grantedInternal.doc.id)).toMatchObject({ accessVia: null, downloadUrl: null })
    expect(list.some((d: any) => d.title === 'Interno')).toBe(false)
    // Para «Mi cuenta» (sin includeInactiveGrants) sólo lo que da acceso.
    expect((await listContactDocuments(db, a.orgId, [person.id])).map((d: any) => d.id).sort()).toEqual([ownerDoc.id, granted.doc.id].sort())
  })

  it('caducidad: caducados y a punto de caducar en el resumen documental', async () => {
    const { propertyDocumentSummary } = await import('../../server/utils/properties/documents')
    const { documentExpiryState, todayIsoDate } = await import('../../utils/propertyMediaCatalog')
    expect(documentExpiryState('2026-01-01', '2026-02-01')).toBe('expired')
    expect(documentExpiryState('2026-02-01', '2026-02-01')).toBe('expiring')
    expect(documentExpiryState('2026-02-20', '2026-02-01')).toBe('expiring')
    expect(documentExpiryState('2026-06-01', '2026-02-01')).toBe('valid')
    expect(documentExpiryState(null)).toBe('none')
    const today = todayIsoDate()
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    await uploadDoc(a, db, { title: 'IBI 2020', docType: 'ibi', expiresAt: '2020-12-31' })
    await uploadDoc(a, db, { title: 'Certificado energético', docType: 'energy_certificate', issuedAt: today, expiresAt: soon })
    await uploadDoc(a, db, { title: 'Sin fecha' })
    const sum = await propertyDocumentSummary(db, a.orgId, 'developer', a.projectId)
    expect(sum.total).toBe(3)
    expect(sum.expired.map((d: any) => d.title)).toEqual(['IBI 2020'])
    expect(sum.expiring.map((d: any) => d.title)).toEqual(['Certificado energético'])
  })
})

// ---------------------------------------------------------------------------
// FASE 7 — multimedia
// ---------------------------------------------------------------------------

async function registerPublicAsset(db: any, orgId: number, key: string, mimeType = 'image/png') {
  const { registerMediaAsset } = await import('../../server/utils/mediaAssets')
  return registerMediaAsset(db, { organizationId: orgId, r2Key: key, mimeType, extension: mimeType.split('/')[1], sizeBytes: 1000, visibility: 'public', category: 'property-photo' })
}

describe('N7a · multimedia: validación de property-media', () => {
  it('fuente según el tipo, enlace https, fichero propio del formato correcto y propiedad viva', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MediaValA')
    const b = await seedTenant(db, 'MediaValB')
    const { validatePropertyMedia } = await import('../../server/utils/properties/media')
    const base = { propertyKind: 'developer', propertyId: a.projectId }
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'video', url: 'https://youtu.be/abc123' }, null)).resolves.toBeUndefined()
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'video', url: 'http://inseguro.test/v.mp4' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'virtual_tour', url: 'javascript:alert(1)' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'pano360', url: 'https://example.com/360.jpg' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'nada', url: 'https://example.com' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'render' }, null)).rejects.toMatchObject({ statusCode: 422 })

    await registerPublicAsset(db, a.orgId, `public/${a.orgId}/properties/render.png`)
    await registerPublicAsset(db, a.orgId, `public/${a.orgId}/properties/folleto.pdf`, 'application/pdf')
    await registerPublicAsset(db, b.orgId, `public/${b.orgId}/properties/ajeno.png`)
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'render', r2Key: `public/${a.orgId}/properties/render.png` }, null)).resolves.toBeUndefined()
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'render', r2Key: `public/${a.orgId}/properties/folleto.pdf` }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'pdf', r2Key: `/api/media/public/${a.orgId}/properties/folleto.pdf` }, null)).resolves.toBeUndefined()
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'render', r2Key: `public/${b.orgId}/properties/ajeno.png` }, null)).rejects.toMatchObject({ statusCode: 404 })
    await expect(validatePropertyMedia(db, a.orgId, { propertyKind: 'developer', propertyId: b.projectId, mediaType: 'video', url: 'https://youtu.be/x' }, null)).rejects.toMatchObject({ statusCode: 404 })
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, a.projectId))
    await expect(validatePropertyMedia(db, a.orgId, { ...base, mediaType: 'video', url: 'https://youtu.be/abc123' }, null)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('metadatos: textos con límite, idioma del catálogo y los tres interruptores a 0/1', async () => {
    const { normalizeMediaMetadata } = await import('../../server/utils/properties/media')
    expect(normalizeMediaMetadata({ title: '  Salón  ', alt: '', language: 'en', isPublishable: false, isPrivate: true, isHidden: 'true' })).toEqual({ title: 'Salón', alt: null, language: 'en', isPublishable: 0, isPrivate: 1, isHidden: 1 })
    expect(() => normalizeMediaMetadata({ language: 'klingon' })).toThrow(/Idioma/)
    expect(() => normalizeMediaMetadata({ alt: 'x'.repeat(301) })).toThrow(/máximo/)
  })
})

describe('N7a · multimedia: lo público respeta publicable / privado / oculto', () => {
  it('ficha pública, tarjetas y multimedia: sólo lo publicable, no privado y no oculto, en su orden', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PubMedia')
    const { listPublicGallery, listPublicPropertyMedia } = await import('../../server/utils/properties/media')
    const { attachPhotos } = await import('../../server/utils/photos')
    // La foto de la semilla (uploads/PubMedia-1.jpg, orden 0) sigue pública.
    await db.insert(schema.images).values([
      { developerPropertyId: a.projectId, image: 'k/visible-2.jpg', sortOrder: 2, alt: 'Cocina', createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/visible-1.jpg', sortOrder: 1, alt: 'Salón', createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/oculta.jpg', sortOrder: 3, isHidden: 1, createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/privada.jpg', sortOrder: 4, isPrivate: 1, createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/no-publicable.jpg', sortOrder: 5, isPublishable: 0, createdAt: ts },
    ])
    const gallery = (await listPublicGallery(db, 'developer', [a.projectId])).get(a.projectId)!
    expect(gallery.map((g) => g.image)).toEqual(['uploads/PubMedia-1.jpg', 'k/visible-1.jpg', 'k/visible-2.jpg'])
    expect(gallery[1]).toMatchObject({ alt: 'Salón' })
    const [card] = await attachPhotos(db, [{ id: a.projectId, coverImage: 'k/portada.jpg' }], 10)
    expect(card.photos).toEqual(['k/portada.jpg', 'uploads/PubMedia-1.jpg', 'k/visible-1.jpg', 'k/visible-2.jpg'])

    const media = (over: Record<string, any>) => ({ organizationId: a.orgId, propertyKind: 'developer', propertyId: a.projectId, createdAt: ts, updatedAt: ts, ...over })
    await db.insert(schema.propertyMedia).values([
      media({ mediaType: 'video', url: 'https://youtu.be/uno', title: 'Recorrido', sortOrder: 1 }),
      media({ mediaType: 'video', url: 'https://youtu.be/dos', sortOrder: 2 }),
      media({ mediaType: 'virtual_tour', url: 'https://my.matterport.com/show/?m=x', isPrivate: 1 }),
      media({ mediaType: 'pano360', r2Key: 'k/pano.jpg', isHidden: 1 }),
      media({ mediaType: 'render', r2Key: 'k/render.jpg', isPublishable: 0 }),
      media({ mediaType: 'drone', r2Key: 'k/drone.jpg', deletedAt: ts }),
      media({ mediaType: 'pdf', r2Key: 'k/folleto.pdf' }),
    ])
    const pub = await listPublicPropertyMedia(db, a.orgId, 'developer', a.projectId)
    expect(pub.map((m) => m.mediaType)).toEqual(['pdf', 'video', 'video'])
    expect(pub.find((m) => m.mediaType === 'pdf')!.url).toBe('/api/media/k/folleto.pdf')
  })

  it('«privado» de verdad: el fichero deja de servirse sin sesión mientras todas sus referencias sean privadas', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PrivMedia')
    const { syncMediaKeyVisibility } = await import('../../server/utils/properties/media')
    const key = `public/${a.orgId}/properties/privada.png`
    await registerPublicAsset(db, a.orgId, key)
    const [img] = await db.insert(schema.images).values({ developerPropertyId: a.projectId, image: key, isPrivate: 1, createdAt: ts }).returning()
    expect(await syncMediaKeyVisibility(db, a.orgId, key)).toBe('private')
    expect((await assetFor(db, key)).visibility).toBe('private')
    // Si además es la portada (pública), vuelve a ser pública.
    await db.update(schema.developerProperties).set({ coverImage: key }).where(eq(schema.developerProperties.id, a.projectId))
    expect(await syncMediaKeyVisibility(db, a.orgId, key)).toBe('public')
    await db.update(schema.developerProperties).set({ coverImage: null }).where(eq(schema.developerProperties.id, a.projectId))
    await db.update(schema.images).set({ isPrivate: 0 }).where(eq(schema.images.id, img.id))
    expect(await syncMediaKeyVisibility(db, a.orgId, key)).toBe('public')
  })
})

describe('N7a · borrar una foto no deja huérfanos', () => {
  it('libera el fichero (media_assets borrado → el cron lo quita de R2) sólo cuando ya nadie de la agencia lo usa', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Orphans')
    const { releaseMediaKeyIfUnreferenced } = await import('../../server/utils/properties/media')
    const key = `public/${a.orgId}/properties/foto.png`
    await registerPublicAsset(db, a.orgId, key)
    const [org0] = await db.select({ used: schema.organizations.storageBytesUsed }).from(schema.organizations).where(eq(schema.organizations.id, a.orgId))
    // La misma clave en la galería de una copia duplicada y como portada.
    const [orig] = await db.insert(schema.images).values({ developerPropertyId: a.projectId, image: key, createdAt: ts }).returning()
    const [copy] = await db
      .insert(schema.developerProperties)
      .values({ organizationId: a.orgId, developerId: a.developerId, name: 'Copia', slug: `copia-${++seq}`, status: 'new', coverImage: key, createdAt: ts, updatedAt: ts })
      .returning()
    const [copyImg] = await db.insert(schema.images).values({ developerPropertyId: copy.id, image: `/api/media/${key}`, createdAt: ts }).returning()

    await db.delete(schema.images).where(eq(schema.images.id, orig.id))
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, key)).toBe(false)
    await db.delete(schema.images).where(eq(schema.images.id, copyImg.id))
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, key)).toBe(false) // sigue siendo la portada de la copia
    await db.update(schema.developerProperties).set({ coverImage: null }).where(eq(schema.developerProperties.id, copy.id))
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, key)).toBe(true)
    const asset = await assetFor(db, key)
    expect(asset.deletedAt).toBeTruthy() // el cron media-lifecycle borra el objeto de R2 al acabar la gracia
    const [org1] = await db.select({ used: schema.organizations.storageBytesUsed }).from(schema.organizations).where(eq(schema.organizations.id, a.orgId))
    expect(org1.used).toBe(org0.used - 1000)
    // Idempotente.
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, key)).toBe(false)
  })

  it('nunca toca el fichero de otra agencia, un enlace externo ni una clave sin registro', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'OrphA')
    const b = await seedTenant(db, 'OrphB')
    const { releaseMediaKeyIfUnreferenced } = await import('../../server/utils/properties/media')
    const keyB = `public/${b.orgId}/properties/de-b.png`
    await registerPublicAsset(db, b.orgId, keyB)
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, keyB)).toBe(false)
    expect((await assetFor(db, keyB)).deletedAt).toBeNull()
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, 'https://cdn.example.com/x.jpg')).toBe(false)
    expect(await releaseMediaKeyIfUnreferenced(db, a.orgId, 'uploads/legado.jpg')).toBe(false)
  })

  it('borrar definitivamente una propiedad libera sus fotos, planos y multimedia, y se lleva sus documentos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'HardDel')
    const { collectPropertyFileKeys, releasePropertyFiles } = await import('../../server/utils/properties/media')
    const { purgePropertyDocuments } = await import('../../server/utils/properties/documents')
    const photo = `public/${a.orgId}/properties/p.png`
    const render = `public/${a.orgId}/properties/r.png`
    await registerPublicAsset(db, a.orgId, photo)
    await registerPublicAsset(db, a.orgId, render)
    await db.insert(schema.propertyGalleryImages).values({ propertyId: a.propertyId, image: photo, createdAt: ts })
    await db.insert(schema.propertyMedia).values({ organizationId: a.orgId, propertyKind: 'agent', propertyId: a.propertyId, mediaType: 'render', r2Key: render, createdAt: ts, updatedAt: ts })
    const bucket = fakeBucket()
    const doc = await uploadDoc(a, db, { propertyKind: 'agent', propertyId: String(a.propertyId) }, undefined, bucket)
    const keys = await collectPropertyFileKeys(db, a.orgId, 'agent', a.propertyId)
    expect(keys).toEqual(expect.arrayContaining([photo, render]))
    await db.delete(schema.agentProperties).where(eq(schema.agentProperties.id, a.propertyId)) // la cascada se lleva la galería
    await releasePropertyFiles(db, a.orgId, 'agent', a.propertyId, keys)
    await purgePropertyDocuments(db, bucket, a.orgId, 'agent', a.propertyId)
    expect((await assetFor(db, photo)).deletedAt).toBeTruthy()
    expect((await assetFor(db, render)).deletedAt).toBeTruthy()
    expect(await db.select().from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, a.propertyId))).toHaveLength(0)
    expect(await db.select().from(schema.propertyDocuments).where(eq(schema.propertyDocuments.id, doc.id))).toHaveLength(0)
    expect(bucket.objects.size).toBe(0)
  })

  it('el borrado genérico libera el fichero de fotos, planos, multimedia y documentos (lo comprueba el propio handler)', () => {
    const source = readFileSync(join(ROOT, 'server/api/admin/[resource]/[id].delete.ts'), 'utf8')
    expect(source).toMatch(/IMAGE_CHILD_RESOURCES = new Set\(\['project-images', 'gallery-images', 'floor-plans', 'agent-property-floor-plans'\]\)/)
    expect(source).toMatch(/releaseMediaKeyIfUnreferenced\(db, orgId!, deleted\.image\)/)
    expect(source).toMatch(/purgeDocumentFile\(/)
    expect(source).toMatch(/releasePropertyFiles\(/)
  })
})

// ---------------------------------------------------------------------------
// FASE 26 — publicFields / portalFields
// ---------------------------------------------------------------------------

describe('N7a · PropertySchemaRegistry: publicFields y portalFields', () => {
  it('publicFields y portalFields nunca incluyen lo interno; portalFields excluye además lo que no es de portal', async () => {
    const { getPropertySchemaFor, publicFields, portalFields } = await import('../../server/utils/propertySchema/registry')
    for (const [catalog, type] of [['agent', 'Apartment'], ['agent', 'Land'], ['developer', null], ['developer', 'Garage']] as const) {
      const sch = getPropertySchemaFor(catalog, type)
      for (const set of [publicFields(sch), portalFields(sch)]) {
        for (const internal of ['reference', 'mandateType', 'commissionValue', 'priceMinAuthorized', 'cadastralReference', 'officeId', 'teamId', 'locationPrivacy', 'staircase']) expect(set.has(internal)).toBe(false)
      }
    }
    const residential = getPropertySchemaFor('agent', 'Apartment')
    expect(publicFields(residential).has('energyCertificateExpiry')).toBe(true)
    expect(portalFields(residential).has('energyCertificateExpiry')).toBe(false)
    expect(portalFields(residential).has('price')).toBe(true)
  })

  it('obra nueva también resuelve por tipo: un garaje o un suelo en obra nueva no tienen dormitorios, y conservan los campos del proyecto', async () => {
    const { getPropertySchemaFor, isFieldApplicable, validateAgainstSchema } = await import('../../server/utils/propertySchema/registry')
    const garage = getPropertySchemaFor('developer', 'Garage')
    expect(garage.key).toBe('newDevelopment')
    expect(garage.label).toContain('Garaje')
    expect(isFieldApplicable(garage, 'bedrooms')).toBe(false)
    for (const k of ['name', 'developerId', 'coverImage', 'handoverDate', 'garageSpaces']) expect(isFieldApplicable(garage, k)).toBe(true)
    const land = getPropertySchemaFor('developer', 'Land')
    expect(validateAgainstSchema(land, { name: 'X', developerId: 1 }, 'publish').missingForPublish).toContain('plotArea')
    expect(getPropertySchemaFor('developer', 'Apartment').label).toBe('Obra nueva')
    expect(getPropertySchemaFor('developer', 'Development').label).toBe('Obra nueva')
  })

  it('la proyección pública usa publicFields: fuera lo interno del registro y lo que no aplica al tipo; la estructura de la fila sigue', async () => {
    const { toPublicProperty, toPublicSheet } = await import('../../server/utils/propertyPrivacy')
    const row = { id: 7, slug: 'garajes-centro', name: 'Garajes Centro', propertyType: 'Garage', developerId: 3, locationPrivacy: 'exact', bedrooms: 2, garageSpaces: 40, price: 25000, coverImage: 'k/c.jpg', reference: 'W-1', createdBy: 1 }
    const out = toPublicProperty(row, { catalog: 'developer' }) as any
    expect(out).toMatchObject({ id: 7, slug: 'garajes-centro', name: 'Garajes Centro', garageSpaces: 40, price: 25000, coverImage: 'k/c.jpg', propertyType: 'Garage' })
    for (const k of ['developerId', 'locationPrivacy', 'bedrooms', 'reference', 'createdBy']) expect(out).not.toHaveProperty(k)
    const sheet = toPublicSheet({ heating: 'central', views: 'sea', cadastralReference: '123', commissionValue: 3, priceMinAuthorized: 1, officeId: 4, virtualTourUrl: 'https://tour.example/x', ibiAnnual: null }, 'developer', 'Apartment')
    expect(sheet).toEqual({ heating: 'central', views: 'sea', virtualTourUrl: 'https://tour.example/x' })
  })

  it('lo que se entrega a un portal: sólo portalFields, ubicación con privacidad y multimedia publicable; nada de otra agencia ni de la papelera', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Portal')
    const b = await seedTenant(db, 'PortalB')
    const { buildPortalListing } = await import('../../server/utils/publication/listing')
    await db
      .update(schema.agentProperties)
      .set({ propertyType: 'Apartment', transactionType: 'sale', city: 'Madrid', lat: 40.416775, lng: -3.70379, streetNumber: '12', locationPrivacy: 'approximate', reference: 'S-INT', mandateType: 'exclusive', mainImage: 'k/main.jpg', bedrooms: 3 })
      .where(eq(schema.agentProperties.id, a.propertyId))
    await db.insert(schema.propertyLegalEconomics).values({ organizationId: a.orgId, propertyKind: 'agent', propertyId: a.propertyId, commissionValue: 3, cadastralReference: 'CAT-1', ibiAnnual: 400, energyCertificateExpiry: '2030-01-01', createdAt: ts, updatedAt: ts })
    await db.insert(schema.propertyGalleryImages).values([
      { propertyId: a.propertyId, image: 'k/ok.jpg', sortOrder: 1, alt: 'Salón', createdAt: ts },
      { propertyId: a.propertyId, image: 'k/hidden.jpg', sortOrder: 2, isHidden: 1, createdAt: ts },
    ])
    await db.insert(schema.propertyMedia).values([
      { organizationId: a.orgId, propertyKind: 'agent', propertyId: a.propertyId, mediaType: 'video', url: 'https://youtu.be/ok', createdAt: ts, updatedAt: ts },
      { organizationId: a.orgId, propertyKind: 'agent', propertyId: a.propertyId, mediaType: 'video', url: 'https://youtu.be/privado', isPrivate: 1, createdAt: ts, updatedAt: ts },
    ])
    const listing = (await buildPortalListing(db, a.orgId, 'agent', a.propertyId))!
    expect(listing.fields).toMatchObject({ price: 300000, city: 'Madrid', bedrooms: 3, ibiAnnual: 400, lat: 40.417, lng: -3.704, transactionType: 'sale' })
    for (const k of ['reference', 'mandateType', 'commissionValue', 'cadastralReference', 'locationPrivacy', 'streetNumber', 'energyCertificateExpiry', 'slug', 'organizationId']) expect(listing.fields[k]).toBeUndefined()
    // Portada primero; después la galería publicable en su orden (la foto de la semilla va con orden 0).
    expect(listing.images.map((i) => i.url)).toEqual(['/api/media/k/main.jpg', '/api/media/uploads/Portal-2.jpg', '/api/media/k/ok.jpg'])
    expect(listing.images[2].alt).toBe('Salón')
    expect(listing.images.some((i) => i.url.includes('hidden'))).toBe(false)
    expect(listing.media.map((m) => m.url)).toEqual(['https://youtu.be/ok'])
    expect(await buildPortalListing(db, b.orgId, 'agent', a.propertyId)).toBeNull()
    await db.update(schema.agentProperties).set({ deletedAt: ts }).where(eq(schema.agentProperties.id, a.propertyId))
    expect(await buildPortalListing(db, a.orgId, 'agent', a.propertyId)).toBeNull()
  })

  it('los endpoints públicos y el dispatcher usan las proyecciones del registro', () => {
    // La ficha delega en server/utils/properties/publicDetail.ts (la comparte con el Constructor).
    expect(readFileSync(join(ROOT, 'server/api/public/properties/[slug].get.ts'), 'utf8')).toMatch(/loadPublicPropertyDetail\(/)
    const slug = readFileSync(join(ROOT, 'server/utils/properties/publicDetail.ts'), 'utf8')
    expect(slug).toMatch(/listPublicGallery\(/)
    expect(slug).toMatch(/toPublicSheet\(/)
    expect(slug).not.toMatch(/db\.select\(\)\.from\(schema\.images\)/)
    const dispatcher = readFileSync(join(ROOT, 'server/utils/publication/dispatcher.ts'), 'utf8')
    expect(dispatcher).toMatch(/buildPortalListing\(/)
    const privacy = readFileSync(join(ROOT, 'server/utils/propertyPrivacy.ts'), 'utf8')
    expect(privacy).toMatch(/publicFields\(schema\)/)
  })
})

// ---------------------------------------------------------------------------
// FASE 25 — resumen, portales, defaults y validación por campo
// ---------------------------------------------------------------------------

describe('N7a · resumen de la ficha y portales', () => {
  it('estado de un canal a partir de su último trabajo', async () => {
    const { channelStateFromJob } = await import('../../server/utils/properties/summary')
    expect(channelStateFromJob(null)).toBe('none')
    expect(channelStateFromJob({ status: 'success', action: 'publish' })).toBe('published')
    expect(channelStateFromJob({ status: 'success', action: 'unpublish' })).toBe('withdrawn')
    expect(channelStateFromJob({ status: 'queued', action: 'publish' })).toBe('scheduled')
    expect(channelStateFromJob({ status: 'blocked', action: 'publish' })).toBe('blocked')
    expect(channelStateFromJob({ status: 'failed', action: 'publish' })).toBe('failed')
  })

  it('resumen: canales reales (web + último trabajo por canal), propietarios, documentos caducados y qué falta para publicar', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Summary')
    const b = await seedTenant(db, 'SummaryB')
    const { buildPropertySummary } = await import('../../server/utils/properties/summary')
    const owner = await contact(db, a.orgId, 'dueno-resumen@example.com')
    await linkOwner(db, a.orgId, 'developer', a.projectId, owner.id)
    await uploadDoc(a, db, { title: 'IBI viejo', expiresAt: '2020-01-01' })
    const [sched] = await db.insert(schema.publicationSchedules).values({ organizationId: a.orgId, developerPropertyId: a.projectId, baseScheduledAt: ts, createdAt: ts, updatedAt: ts }).returning()
    await db.insert(schema.publicationJobs).values([
      { organizationId: a.orgId, scheduleId: sched.id, channelKey: 'idealista', runAt: '2026-01-01 10:00:00', status: 'blocked', lastError: 'Idealista no tiene una integración real', createdAt: ts, updatedAt: ts },
      { organizationId: a.orgId, scheduleId: sched.id, channelKey: 'idealista', runAt: '2025-12-01 10:00:00', status: 'pending', createdAt: ts, updatedAt: ts },
    ])
    // Un trabajo de otra agencia sobre su propia propiedad no aparece aquí.
    const [schedB] = await db.insert(schema.publicationSchedules).values({ organizationId: b.orgId, developerPropertyId: b.projectId, baseScheduledAt: ts, createdAt: ts, updatedAt: ts }).returning()
    await db.insert(schema.publicationJobs).values({ organizationId: b.orgId, scheduleId: schedB.id, channelKey: 'fotocasa', runAt: ts, status: 'success', createdAt: ts, updatedAt: ts })

    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId))
    const { event } = makeEvent(db)
    const s = await buildPropertySummary(event, db, {}, a.orgId, staffUser(a), 'developer', row, {})
    expect(s.channels.web.state).toBe('visible')
    const idealista = s.channels.portals.find((p: any) => p.key === 'idealista')!
    expect(idealista).toMatchObject({ state: 'blocked', implemented: false, connected: false })
    expect(s.channels.portals.find((p: any) => p.key === 'fotocasa')!.state).toBe('none')
    expect(s.channels.portalsNote).toMatch(/integración real/)
    expect(s.owners).toEqual([expect.objectContaining({ contactId: owner.id, role: 'owner' })])
    expect(s.documents.expired.map((d: any) => d.title)).toEqual(['IBI viejo'])
    expect(s.publishReadiness.ok).toBe(false)
    expect(s.publishReadiness.missing.map((m: any) => m.key)).toEqual(expect.arrayContaining(['city', 'coverImage']))
    expect(s.offers).toEqual({ total: 0, open: 0, accepted: 0 })

    // 2ª mano: sin web pública ni programaciones, y lo dice.
    const [agentRow] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, a.propertyId))
    const sa = await buildPropertySummary(event, db, {}, a.orgId, staffUser(a), 'agent', agentRow, {})
    expect(sa.channels.web.state).toBe('not_applicable')
    expect(sa.channels.portals).toEqual([])
    // Sin acceso al CRM no viajan propietarios, compatibles ni ofertas.
    const restricted = { ...staffUser(a), permissions: JSON.stringify(['web:read', 'web:write']) }
    const sr = await buildPropertySummary(event, db, {}, a.orgId, restricted, 'developer', row, {})
    expect(sr.owners).toBeNull()
    expect(sr.matches).toBeNull()
    expect(sr.offers).toBeNull()
  })

  it('defaults inteligentes: venta, ubicación exacta, la localidad habitual y el comercial vinculado a la cuenta', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Defaults')
    const { propertyDefaults } = await import('../../server/utils/properties/summary')
    for (const city of ['Valencia', 'Valencia', 'Madrid']) {
      await db.insert(schema.agentProperties).values({ organizationId: a.orgId, slug: `d-${++seq}`, city, country: 'España', status: 'available', createdAt: ts, updatedAt: ts })
    }
    const [office] = await db.insert(schema.offices).values({ organizationId: a.orgId, name: 'Centro', createdAt: ts, updatedAt: ts }).returning()
    await db.update(schema.teamMembers).set({ userId: a.userId, officeId: office.id }).where(eq(schema.teamMembers.id, a.teamMemberId))
    expect(await propertyDefaults(db, a.orgId, a.userId, 'agent')).toEqual({
      transactionType: 'sale',
      locationPrivacy: 'exact',
      status: 'available',
      country: 'España',
      city: 'Valencia',
      agentId: a.teamMemberId,
      officeId: office.id,
    })
  })

  it('validación inmediata por campo: obligatorio, rangos de la ficha, enteros, https y fechas', async () => {
    const { validatePropertyField } = await import('../../utils/propertyFieldValidation')
    expect(validatePropertyField({ key: 'price', type: 'number', required: true }, '', true)).toMatch(/obligatorio/)
    expect(validatePropertyField({ key: 'price', type: 'number', required: true }, '', false)).toBe('')
    expect(validatePropertyField({ key: 'price', type: 'number' }, -5)).toMatch(/menor que 0/)
    expect(validatePropertyField({ key: 'bedrooms', type: 'stepper' }, 2.5)).toMatch(/entero/)
    expect(validatePropertyField({ key: 'lat', type: 'number' }, 123)).toMatch(/mayor que 90/)
    expect(validatePropertyField({ key: 'virtualTourUrl', type: 'url' }, 'http://x')).toMatch(/https/)
    expect(validatePropertyField({ key: 'energyCertificateExpiry', type: 'date' }, '2026-13-45')).toMatch(/Fecha/)
    expect(validatePropertyField({ key: 'price', type: 'number' }, 250000)).toBe('')
  })
})

describe('N7a · el panel y la API los registran', () => {
  it('property-documents y property-media son recursos del motor genérico, área web, con papelera y filtros por propiedad', async () => {
    const { adminResources } = await import('../../server/utils/adminResources')
    for (const key of ['property-documents', 'property-media']) {
      const def = adminResources[key]
      expect(def.area).toBe('web')
      expect(def.softDelete).toBe(true)
      expect(def.tenantPolicy.type).toBe('direct')
      expect(def.filterFields).toEqual(expect.arrayContaining(['propertyKind', 'propertyId']))
    }
    // El fichero, su tamaño y su autor nunca son editables por el cliente.
    for (const k of ['r2Key', 'mediaAssetId', 'fileName', 'mimeType', 'sizeBytes', 'createdBy', 'organizationId']) expect(adminResources['property-documents'].fields[k]).toBeUndefined()
    for (const key of ['project-images', 'gallery-images']) {
      for (const k of ['title', 'alt', 'caption', 'language', 'isPublishable', 'isPrivate', 'isHidden']) expect(adminResources[key].fields[k]).toBeDefined()
    }
  })

  it('la ficha del contacto ya no lee documentos de sus propiedades sin mirar el permiso', () => {
    const source = readFileSync(join(ROOT, 'server/api/admin/saas/contacts/[id].get.ts'), 'utf8')
    expect(source).toMatch(/listContactDocuments\(db, orgId, \[id\]/)
    const media = readFileSync(join(ROOT, 'server/api/media/[...key].get.ts'), 'utf8')
    expect(media).toMatch(/PROPERTY_DOCUMENT_ENTITY/)
    expect(media).toMatch(/decideDocumentAccess\(/)
  })

  it('asegura que nada de esto escribió en otra agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Iso')
    const b = await seedTenant(db, 'IsoB')
    await uploadDoc(a, db, {})
    const docsB = await db.select().from(schema.propertyDocuments).where(and(eq(schema.propertyDocuments.organizationId, b.orgId)))
    expect(docsB).toHaveLength(0)
  })
})

// La PNG de prueba se usa para comprobar que una imagen escaneada también vale como documento.
describe('N7a · un documento escaneado como imagen', () => {
  it('acepta un PNG íntegro como documento', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Scan')
    const { createPropertyDocumentFromUpload } = await import('../../server/utils/properties/documents')
    const { event } = makeEvent(db)
    const parts = [
      { name: 'file', filename: 'nota.png', type: 'image/png', data: buildPng(20, 20) },
      { name: 'propertyKind', data: new TextEncoder().encode('developer') },
      { name: 'propertyId', data: new TextEncoder().encode(String(a.projectId)) },
      { name: 'docType', data: new TextEncoder().encode('land_registry_note') },
      { name: 'title', data: new TextEncoder().encode('Nota simple escaneada') },
    ]
    const res = await createPropertyDocumentFromUpload(event, db, a.orgId, staffUser(a), parts as any)
    expect(res.document).toMatchObject({ mimeType: 'image/png', docTypeLabel: 'Nota simple', visibility: 'internal' })
  })
})
