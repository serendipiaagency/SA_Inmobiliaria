import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Galería multimedia (Cola 5), servidor: la clasificación por foto (estancia,
 * descripción, miniatura) que persiste la migración 0097, lo que sale a lo
 * público, la validación y el aislamiento entre agencias. Sobre una base real
 * (sqlite + migraciones reales).
 */
vi.stubGlobal('createError', createError)

const ts = '2026-01-01 00:00:00'

async function registerAsset(db: any, orgId: number, key: string, mimeType = 'image/png', metadata: Record<string, unknown> | null = null) {
  const { registerMediaAsset } = await import('../../server/utils/mediaAssets')
  return registerMediaAsset(db, { organizationId: orgId, r2Key: key, mimeType, extension: mimeType.split('/')[1], sizeBytes: 1000, visibility: 'public', category: 'property-photo', metadata })
}

describe('galería · metadatos de clasificación', () => {
  it('estancia del catálogo, descripción con límite y miniatura como clave de R2 (nunca un enlace externo)', async () => {
    const { normalizeMediaMetadata } = await import('../../server/utils/properties/media')
    expect(normalizeMediaMetadata({ room: 'kitchen', description: '  Cocina abierta al salón  ', thumbKey: '/api/media/public/1/properties/a.thumb.webp' })).toEqual({
      room: 'kitchen',
      description: 'Cocina abierta al salón',
      thumbKey: 'public/1/properties/a.thumb.webp',
    })
    expect(normalizeMediaMetadata({ room: '', description: '', thumbKey: null })).toEqual({ room: null, description: null, thumbKey: null })
    expect(() => normalizeMediaMetadata({ room: 'sotano-raro' })).toThrow(/Estancia/)
    expect(() => normalizeMediaMetadata({ description: 'x'.repeat(2001) })).toThrow(/máximo/)
    expect(() => normalizeMediaMetadata({ thumbKey: 'https://evil.test/a.webp' })).toThrow(/Miniatura/)
    expect(() => normalizeMediaMetadata({ thumbKey: '../secreto' })).toThrow(/Miniatura/)
  })

  it('la miniatura tiene que ser una imagen de ESTA agencia: ajena o inexistente es un 404; un PDF, un 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'GalA')
    const b = await seedTenant(db, 'GalB')
    const { assertOwnedThumbKey } = await import('../../server/utils/properties/media')
    const own = `public/${a.orgId}/properties/own.thumb.webp`
    await registerAsset(db, a.orgId, own, 'image/webp')
    await registerAsset(db, b.orgId, `public/${b.orgId}/properties/ajena.thumb.webp`, 'image/webp')
    await registerAsset(db, a.orgId, `public/${a.orgId}/properties/doc.pdf`, 'application/pdf')
    await expect(assertOwnedThumbKey(db, a.orgId, { thumbKey: own })).resolves.toBeUndefined()
    await expect(assertOwnedThumbKey(db, a.orgId, {})).resolves.toBeUndefined()
    await expect(assertOwnedThumbKey(db, a.orgId, { thumbKey: null })).resolves.toBeUndefined()
    await expect(assertOwnedThumbKey(db, a.orgId, { thumbKey: `public/${b.orgId}/properties/ajena.thumb.webp` })).rejects.toMatchObject({ statusCode: 404 })
    await expect(assertOwnedThumbKey(db, a.orgId, { thumbKey: 'public/1/properties/no-existe.webp' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(assertOwnedThumbKey(db, a.orgId, { thumbKey: `public/${a.orgId}/properties/doc.pdf` })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('los recursos admin de las fotos y de la multimedia declaran sus campos nuevos; la descripción larga es sólo de las fotos', async () => {
    const { adminResources } = await import('../../server/utils/adminResources')
    for (const key of ['project-images', 'gallery-images']) {
      expect(Object.keys(adminResources[key]!.fields), key).toEqual(expect.arrayContaining(['room', 'description', 'thumbKey']))
    }
    expect(Object.keys(adminResources['property-media']!.fields)).toEqual(expect.arrayContaining(['room', 'thumbKey']))
    expect(Object.keys(adminResources['property-media']!.fields)).not.toContain('description')
  })
})

describe('galería · lo que sale a lo público', () => {
  it('la galería pública trae estancia, descripción, miniatura y dimensiones; lo oculto, privado o no publicable no sale; lo sin clasificar sigue', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'GalPub')
    const { listPublicGallery } = await import('../../server/utils/properties/media')
    await registerAsset(db, a.orgId, 'k/salon.jpg', 'image/jpeg', { width: 1600, height: 1067 })
    await db.insert(schema.images).values([
      { developerPropertyId: a.projectId, image: 'k/salon.jpg', sortOrder: 1, room: 'living', description: 'Salón con vistas', thumbKey: 'k/salon.thumb.webp', createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/sin-clasificar.jpg', sortOrder: 2, createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/rara.jpg', sortOrder: 3, room: 'sotano-raro', createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/oculta.jpg', sortOrder: 4, room: 'kitchen', isHidden: 1, createdAt: ts },
      { developerPropertyId: a.projectId, image: 'k/privada.jpg', sortOrder: 5, room: 'bedroom', isPrivate: 1, createdAt: ts },
    ])
    const rows = (await listPublicGallery(db, 'developer', [a.projectId])).get(a.projectId)!
    // La foto de la semilla (orden 0) sigue pública y sin clasificar.
    expect(rows.map((r) => r.image)).toEqual(['uploads/GalPub-1.jpg', 'k/salon.jpg', 'k/sin-clasificar.jpg', 'k/rara.jpg'])
    const salon = rows.find((r) => r.image === 'k/salon.jpg')!
    expect(salon).toMatchObject({ room: 'living', description: 'Salón con vistas', thumb: 'k/salon.thumb.webp', width: 1600, height: 1067 })
    const sinClasificar = rows.find((r) => r.image === 'k/sin-clasificar.jpg')!
    expect(sinClasificar).toMatchObject({ room: null, description: null, thumb: null, width: null, height: null })
    // Una estancia fuera del catálogo se publica como «sin clasificar».
    expect(rows.find((r) => r.image === 'k/rara.jpg')!.room).toBeNull()
  })

  it('la multimedia pública trae miniatura y estancia; la papelera, lo privado y lo oculto siguen fuera', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'GalMedia')
    const { listPublicPropertyMedia } = await import('../../server/utils/properties/media')
    const media = (over: Record<string, any>) => ({ organizationId: a.orgId, propertyKind: 'developer', propertyId: a.projectId, createdAt: ts, updatedAt: ts, ...over })
    await db.insert(schema.propertyMedia).values([
      media({ mediaType: 'pano360', r2Key: 'k/pano.jpg', room: 'living', thumbKey: 'k/pano.thumb.webp', sortOrder: 1 }),
      media({ mediaType: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', sortOrder: 2 }),
      media({ mediaType: 'render', r2Key: 'k/privado.jpg', isPrivate: 1 }),
      media({ mediaType: 'drone', r2Key: 'k/borrado.jpg', deletedAt: ts }),
    ])
    const pub = await listPublicPropertyMedia(db, a.orgId, 'developer', a.projectId)
    expect(pub.map((m) => m.mediaType)).toEqual(['pano360', 'video'])
    expect(pub[0]).toMatchObject({ room: 'living', thumb: '/api/media/k/pano.thumb.webp' })
    expect(pub[1]).toMatchObject({ room: null, thumb: null })
  })

  it('segunda mano: sus fotos llevan los mismos campos de clasificación', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'GalSecond')
    const { listPublicGallery } = await import('../../server/utils/properties/media')
    await db.insert(schema.propertyGalleryImages).values({ propertyId: a.propertyId, image: 'k/c.jpg', sortOrder: 1, room: 'terrace', description: 'Terraza al sur', createdAt: ts })
    const rows = (await listPublicGallery(db, 'agent', [a.propertyId])).get(a.propertyId)!
    expect(rows.find((r) => r.image === 'k/c.jpg')).toMatchObject({ room: 'terrace', description: 'Terraza al sur' })
  })

  it('aislamiento: las fotos y las dimensiones de una agencia no aparecen en la otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'GalIsoA')
    const b = await seedTenant(db, 'GalIsoB')
    const { listPublicGallery, mediaDimensionsFor } = await import('../../server/utils/properties/media')
    await registerAsset(db, a.orgId, 'k/solo-a.jpg', 'image/jpeg', { width: 800, height: 600 })
    await db.insert(schema.images).values({ developerPropertyId: a.projectId, image: 'k/solo-a.jpg', sortOrder: 9, room: 'garden', createdAt: ts })
    const ofB = (await listPublicGallery(db, 'developer', [b.projectId])).get(b.projectId)!
    expect(ofB.some((r) => r.image === 'k/solo-a.jpg')).toBe(false)
    // Un enlace externo y una clave sin ficha no tienen dimensiones.
    const dims = await mediaDimensionsFor(db, ['k/solo-a.jpg', 'https://x.test/a.jpg', 'k/no-existe.jpg'])
    expect([...dims.keys()]).toEqual(['k/solo-a.jpg'])
    expect(dims.get('k/solo-a.jpg')).toEqual({ width: 800, height: 600 })
  })
})

describe('galería · migración 0097 y compatibilidad', () => {
  it('las columnas nuevas existen, son opcionales y no tocan lo existente (todo NULL)', async () => {
    const { db, sqlite } = createTestDb()
    const a = await seedTenant(db, 'GalMig')
    const cols = (table: string) => (sqlite.prepare(`pragma table_info(${table})`).all() as { name: string; notnull: number }[]).filter((c) => ['room', 'description', 'thumb_key'].includes(c.name))
    for (const t of ['images', 'property_gallery_images']) expect(cols(t).map((c) => c.name).sort(), t).toEqual(['description', 'room', 'thumb_key'])
    expect(cols('property_media').map((c) => c.name).sort()).toEqual(['room', 'thumb_key'])
    for (const t of ['images', 'property_gallery_images', 'property_media']) for (const c of cols(t)) expect(c.notnull, `${t}.${c.name}`).toBe(0)
    const [seed] = await db.select().from(schema.images).where(eq(schema.images.developerPropertyId, a.projectId))
    expect(seed).toMatchObject({ room: null, description: null, thumbKey: null })
  })

  it('la CSP deja incrustar los tours (Matterport, Kuula, Floorfy, sólo tras el consentimiento) y mantiene el resto', async () => {
    const { readFileSync } = await import('node:fs')
    const { TOUR_FRAME_ORIGINS } = await import('../../utils/videoEmbed')
    const src = readFileSync(new URL('../../server/middleware/security-headers.ts', import.meta.url), 'utf8')
    const frameSrc = src.split('\n').find((l) => l.includes('frame-src '))!
    // El frame-src toma los orígenes de los tours de TOUR_FRAME_ORIGINS (única fuente, utils/videoEmbed.ts).
    expect(frameSrc).toContain('TOUR_FRAME_ORIGINS.join')
    expect(TOUR_FRAME_ORIGINS).toEqual(expect.arrayContaining(['https://my.matterport.com', 'https://kuula.co', 'https://floorfy.com']))
    for (const origin of ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.instagram.com', 'https://www.tiktok.com']) expect(frameSrc).toContain(origin)
  })
})
