import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { resolveBrandIdentity } from '../../server/utils/brandKit/identity'
import { saveBrandKit } from '../../server/utils/brandKit/save'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Brand Kit unificado (Cola 22): el resolver `resolveBrandIdentity` es la
 * fuente única de color y tipografía (web, emails, carteles). Comprueba el
 * saneado de colores (sólo HEX), el fallback del color principal a
 * organizations.brand_color, el filtrado de tipografías al catálogo cerrado, y
 * que el guardado del Brand Kit sólo acepta fuentes conocidas.
 */
let db: any
let A: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
})

async function putKit(values: Record<string, unknown>) {
  await db.insert(schema.brandKits).values({ organizationId: A.orgId, createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00', ...values })
}
async function setOrgColor(color: string | null) {
  await db.update(schema.organizations).set({ brandColor: color }).where(eq(schema.organizations.id, A.orgId))
}

describe('resolveBrandIdentity', () => {
  it('sin Brand Kit ni color de organización: todo nulo y sin acentos', async () => {
    const id = await resolveBrandIdentity(db, A.orgId)
    expect(id.colors).toEqual({ primary: null, secondary: null, background: null, text: null, accents: [] })
    expect(id.fonts).toEqual({ heading: null, body: null, alt: null })
  })

  it('usa los colores del Brand Kit y descarta los HEX no válidos', async () => {
    await putKit({ colorPrimary: '#1F4A3F', colorSecondary: 'rojo', colorBackground: '#FFFFFF', colorText: '#111', colorAccentsJson: JSON.stringify(['#B08D57', 'nope', '#000000']) })
    const id = await resolveBrandIdentity(db, A.orgId)
    expect(id.colors.primary).toBe('#1F4A3F')
    expect(id.colors.secondary).toBeNull() // 'rojo' no es HEX
    expect(id.colors.background).toBe('#FFFFFF')
    expect(id.colors.text).toBe('#111')
    expect(id.colors.accents).toEqual(['#B08D57', '#000000']) // 'nope' fuera
  })

  it('el color principal cae a organizations.brand_color si el Brand Kit no lo tiene', async () => {
    await setOrgColor('#087CFA')
    await putKit({ colorPrimary: null, colorSecondary: '#222222' })
    const id = await resolveBrandIdentity(db, A.orgId)
    expect(id.colors.primary).toBe('#087CFA') // fallback
    expect(id.colors.secondary).toBe('#222222')
    // Sin fila de Brand Kit, también cae al color de la organización.
    const B = await seedTenant(db, 'Beta')
    await db.update(schema.organizations).set({ brandColor: '#654321' }).where(eq(schema.organizations.id, B.orgId))
    expect((await resolveBrandIdentity(db, B.orgId)).colors.primary).toBe('#654321')
  })

  it('las tipografías sólo valen si están en el catálogo del Constructor (SITE_FONTS)', async () => {
    await putKit({ fontHeading: 'Playfair Display', fontBody: 'Inter', fontAlt: 'Comic Sans MS' })
    const id = await resolveBrandIdentity(db, A.orgId)
    expect(id.fonts.heading).toBe('Playfair Display')
    expect(id.fonts.body).toBe('Inter')
    expect(id.fonts.alt).toBeNull() // Comic Sans no está en el catálogo
  })
})

describe('saveBrandKit · validación de tipografías', () => {
  it('guarda sólo fuentes del catálogo; una desconocida o vacía queda en null', async () => {
    const { brandKit } = await saveBrandKit(db, A.orgId, A.userId, { fontHeading: 'Lora', fontBody: 'Wingdings', fontAlt: '' } as any)
    expect(brandKit.fontHeading).toBe('Lora')
    expect(brandKit.fontBody).toBeNull() // no está en SITE_FONTS
    expect(brandKit.fontAlt).toBeNull() // vacío = sin preferencia
  })
})
