import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cierre de la auditoría del megaprompt «Núcleo inmobiliario»: las zonas que
 * sugiere el editor de necesidades (FASE 10) salen de las fichas vivas de la
 * agencia, de los dos catálogos, con los mismos campos que compara el motor.
 */
const ts = '2026-01-01 00:00:00'
let seq = 0

async function flat(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  await db.insert(schema.agentProperties).values({ organizationId: orgId, slug: `cierre-piso-${seq}`, price: 300_000, status: 'available', createdAt: ts, updatedAt: ts, ...over })
}

async function project(db: any, orgId: number, developerId: number, over: Record<string, any> = {}) {
  seq += 1
  await db.insert(schema.developerProperties).values({ organizationId: orgId, developerId, name: `Promoción ${seq}`, slug: `cierre-promo-${seq}`, status: 'new', price: 500_000, createdAt: ts, updatedAt: ts, ...over })
}

describe('FASE 10 — zonas sugeridas para una necesidad', () => {
  it('distritos, localidades, códigos postales y urbanizaciones de los dos catálogos, sin repetidos ni vacíos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Zonas')
    await flat(db, a.orgId, { city: 'Madrid', district: 'Chamberí', postalCode: '28010', community: 'Almagro' })
    // Mismo distrito con otra grafía: una sola sugerencia (el motor los compara igual).
    await flat(db, a.orgId, { city: 'madrid', district: 'chamberi', postalCode: '28010' })
    await flat(db, a.orgId, { city: 'Alcobendas', district: '', postalCode: null })
    await project(db, a.orgId, a.developerId, { city: 'Pozuelo de Alarcón', district: 'Somosaguas', postalCode: '28223', community: 'La Finca' })

    const { listZoneSuggestions } = await import('../../server/utils/buyerRequirements/zoneSuggestions')
    const s = await listZoneSuggestions(db, a.orgId)
    expect(s.district).toEqual(['Chamberí', 'Somosaguas'])
    expect(s.city).toEqual(expect.arrayContaining(['Alcobendas', 'Madrid', 'Pozuelo de Alarcón']))
    expect(s.city.filter((c) => c.toLowerCase() === 'madrid')).toHaveLength(1)
    expect(s.postalCode).toEqual(['28010', '28223'])
    expect(s.label).toEqual(expect.arrayContaining(['Almagro', 'La Finca']))
    expect([...s.district, ...s.city, ...s.postalCode, ...s.label].every((v) => v.trim() !== '')).toBe(true)
  })

  it('nunca enseña zonas de otra agencia ni de fichas en la papelera', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Propia')
    const b = await seedTenant(db, 'Ajena')
    await flat(db, a.orgId, { district: 'Retiro' })
    await flat(db, a.orgId, { district: 'Papelera', deletedAt: ts })
    await flat(db, b.orgId, { district: 'Ajeno' })
    await project(db, b.orgId, b.developerId, { city: 'Ciudad Ajena', community: 'Comunidad Ajena' })

    const { listZoneSuggestions } = await import('../../server/utils/buyerRequirements/zoneSuggestions')
    const s = await listZoneSuggestions(db, a.orgId)
    expect(s.district).toEqual(['Retiro'])
    const all = [...s.district, ...s.city, ...s.postalCode, ...s.label]
    expect(all).not.toContain('Ajeno')
    expect(all).not.toContain('Ciudad Ajena')
    expect(all).not.toContain('Comunidad Ajena')
    expect(all).not.toContain('Papelera')
    // La fixture de la agencia ajena tiene su urbanización, y no aparece.
    const [foreign] = await db.select({ community: schema.developerProperties.community }).from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, b.orgId)).limit(1)
    expect(all).not.toContain(foreign.community)
  })

  it('una zona sugerida, elegida en el editor, coincide con su inmueble en el motor', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Motor')
    await flat(db, a.orgId, { city: 'Madrid', district: 'Chamberí', postalCode: '28010', community: 'Almagro' })
    const { listZoneSuggestions } = await import('../../server/utils/buyerRequirements/zoneSuggestions')
    const { zoneFromInput } = await import('../../utils/buyerRequirementCatalog')
    const { evaluateMatch } = await import('../../server/utils/matching/engine')
    const s = await listZoneSuggestions(db, a.orgId)
    const property = { id: 1, transactionType: 'sale', city: 'Madrid', district: 'Chamberí', postalCode: '28010', community: 'Almagro' }
    for (const kind of ['district', 'city', 'postalCode', 'label'] as const) {
      const zone = zoneFromInput(kind, s[kind][0]!)!
      const result = evaluateMatch(property, { id: 1, operation: 'sale', desiredZones: [zone] })
      expect(result.criteria.find((c) => c.key === 'zone')?.outcome, kind).toBe('matched')
    }
  })
})

describe('FASE 7 — vídeos de YouTube y Vimeo incrustados', () => {
  it('reconoce los enlaces habituales y usa siempre el reproductor sin cookies', async () => {
    const { videoEmbed } = await import('../../utils/videoEmbed')
    const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')?.src).toBe(yt)
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')?.src).toBe(yt)
    expect(videoEmbed('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.src).toBe(yt)
    expect(videoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ')?.src).toBe(yt)
    expect(videoEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?dnt=1')
    expect(videoEmbed('https://vimeo.com/channels/staffpicks/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?dnt=1')
    expect(videoEmbed('https://player.vimeo.com/video/76979871')?.provider).toBe('vimeo')
  })

  it('cualquier otra cosa no se incrusta: se abre aparte', async () => {
    const { videoEmbed } = await import('../../utils/videoEmbed')
    for (const url of [
      null,
      '',
      'no es una url',
      'javascript:alert(1)',
      'https://evil.example.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=corto',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
      'https://vimeo.com/about',
      'https://www.dailymotion.com/video/x7tgad0',
    ]) {
      expect(videoEmbed(url), String(url)).toBeNull()
    }
  })

  it('la CSP deja incrustar sólo esos dos reproductores', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('../../server/middleware/security-headers.ts', import.meta.url), 'utf8')
    const frameSrc = src.split('\n').find((l) => l.includes('"frame-src'))!
    expect(frameSrc).toContain('https://www.youtube-nocookie.com')
    expect(frameSrc).toContain('https://player.vimeo.com')
    expect(frameSrc).not.toMatch(/https:\/\/www\.youtube\.com|\*/)
  })
})

describe('FASE 7 — visor 360 esférico', () => {
  it('el centro de la vista inicial es el centro de la foto', async () => {
    const { viewDirection, equirectUV, PANO_DEFAULT_FOV } = await import('../../utils/pano360')
    const [u, v] = equirectUV(viewDirection(0, 0, 0, 0, PANO_DEFAULT_FOV, 16 / 9))
    expect(u).toBeCloseTo(0.5, 6)
    expect(v).toBeCloseTo(0.5, 6)
  })

  it('girar 90° a la izquierda mira un cuarto de foto antes; mirar arriba sube en la foto', async () => {
    const { viewDirection, equirectUV, PANO_DEFAULT_FOV } = await import('../../utils/pano360')
    const left = equirectUV(viewDirection(0, 0, Math.PI / 2, 0, PANO_DEFAULT_FOV, 1))
    expect(left[0]).toBeCloseTo(0.25, 6)
    const right = equirectUV(viewDirection(0, 0, -Math.PI / 2, 0, PANO_DEFAULT_FOV, 1))
    expect(right[0]).toBeCloseTo(0.75, 6)
    const up = equirectUV(viewDirection(0, 0, 0, Math.PI / 4, PANO_DEFAULT_FOV, 1))
    expect(up[1]).toBeCloseTo(0.25, 6)
    // A la derecha de la pantalla está lo que hay a la derecha en la foto.
    const screenRight = equirectUV(viewDirection(0.5, 0, 0, 0, PANO_DEFAULT_FOV, 1))
    expect(screenRight[0]).toBeGreaterThan(0.5)
  })

  it('la vuelta completa no se rompe en la costura, y los límites se respetan', async () => {
    const { viewDirection, equirectUV, wrapYaw, clampPitch, clampFov, dragDelta, PANO_MAX_PITCH, PANO_MIN_FOV, PANO_MAX_FOV, PANO_DEFAULT_FOV } = await import('../../utils/pano360')
    const back = equirectUV(viewDirection(0, 0, Math.PI, 0, PANO_DEFAULT_FOV, 1))
    expect(back[0] >= 0 && back[0] < 1).toBe(true)
    expect(Math.min(back[0], 1 - back[0])).toBeLessThan(1e-6)
    expect(wrapYaw(3 * Math.PI)).toBeCloseTo(Math.PI, 6)
    expect(wrapYaw(-3 * Math.PI)).toBeCloseTo(Math.PI, 6)
    expect(wrapYaw(10)).toBeGreaterThan(-Math.PI)
    expect(clampPitch(10)).toBe(PANO_MAX_PITCH)
    expect(clampPitch(-10)).toBe(-PANO_MAX_PITCH)
    expect(clampFov(0.01)).toBe(PANO_MIN_FOV)
    expect(clampFov(10)).toBe(PANO_MAX_FOV)
    // La foto sigue al dedo: arrastrar a la derecha gira hacia la izquierda.
    const d = dragDelta(100, -50, 500, PANO_DEFAULT_FOV)
    expect(d.yaw).toBeGreaterThan(0)
    expect(d.pitch).toBeLessThan(0)
  })
})
