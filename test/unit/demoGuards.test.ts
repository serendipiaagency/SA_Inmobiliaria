import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { attemptSend } from '../../server/utils/email/send'
import { attemptWebhookDelivery } from '../../server/utils/webhooks'
import { assertNotDemoExternal, DEMO_BLOCKED_MESSAGE, forgetDemoOrgCache, isDemoOrg } from '../../server/utils/demo/tenant'
import { assertDemoOrganization, purgeDemoTenant } from '../../server/demo/purge'
import { createD1Shim, createR2Shim } from './helpers/d1Shim'

/**
 * Los frenos de la cuenta demo: lo que saldría de la plataforma (email,
 * webhooks, cobros, canales) no sale si la empresa es la demo, y el borrado
 * de la demo se niega a tocar cualquier otra empresa.
 */

async function setup() {
  const { DB } = createD1Shim()
  const db = drizzle(DB as any, { schema })
  const ts = '2026-01-01 00:00:00'
  const [demo] = await db.insert(schema.organizations).values({ name: 'Norte Astur Inmobiliaria', slug: 'norte-astur-inmobiliaria', registrationSource: 'demo', status: 'active', createdAt: ts, updatedAt: ts }).returning()
  const [real] = await db.insert(schema.organizations).values({ name: 'Agencia real', slug: 'agencia-real', registrationSource: 'admin', status: 'active', createdAt: ts, updatedAt: ts }).returning()
  forgetDemoOrgCache()
  return { db, DB, demo, real, ts }
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetDemoOrgCache()
})

describe('cuenta demo: frenos de salida', () => {
  it('reconoce la empresa demo y rechaza con 409 las acciones externas', async () => {
    const { db, demo, real } = await setup()
    expect(await isDemoOrg(db, demo.id)).toBe(true)
    expect(await isDemoOrg(db, real.id)).toBe(false)
    await expect(assertNotDemoExternal(db, demo.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(assertNotDemoExternal(db, real.id)).resolves.toBeUndefined()
  })

  it('un email de la demo no llega a Resend: queda «fallido» con el motivo y sin reintentos', async () => {
    const { db, demo, ts } = await setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const [log] = await db
      .insert(schema.emailLog)
      .values({ organizationId: demo.id, template: 'contract_sent', recipient: 'laura.martinez@example.com', fromHeader: 'Norte Astur <info@norteastur.example>', subject: 'Prueba', html: '<p>Hola</p>', createdAt: ts })
      .returning()
    const result = await attemptSend(db, { RESEND_API_KEY: 're_test_key' }, log.id)
    expect(result.ok).toBe(false)
    expect(result.message).toBe(DEMO_BLOCKED_MESSAGE)
    expect(fetchSpy).not.toHaveBeenCalled()
    const [after] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, log.id))
    expect(after.status).toBe('failed')
    expect(after.provider).toBe('none')
    expect(after.nextRetryAt).toBeNull()
  })

  it('un webhook de la demo no se entrega', async () => {
    const { db, demo, ts } = await setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const [endpoint] = await db.insert(schema.webhookEndpoints).values({ organizationId: demo.id, url: 'https://hooks.example.com/x', secret: 's', eventsJson: '["lead.created"]', active: 1, createdAt: ts }).returning()
    const [delivery] = await db.insert(schema.webhookDeliveries).values({ endpointId: endpoint.id, event: 'lead.created', payloadJson: '{}', createdAt: ts }).returning()
    const res = await attemptWebhookDelivery(db, delivery.id)
    expect(res.status).toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('cuenta demo: el borrado sólo toca la demo', () => {
  it('se niega a borrar una empresa que no es la demo (ni la 1)', async () => {
    const { db, real } = await setup()
    await expect(assertDemoOrganization(db, real.id)).rejects.toThrow(/no es la cuenta demo/)
    await expect(assertDemoOrganization(db, 1)).rejects.toThrow(/no es la cuenta demo/)
    await expect(purgeDemoTenant(db, { MEDIA: createR2Shim() }, real.id)).rejects.toThrow(/no es la cuenta demo/)
  })

  it('borra los datos de la demo y deja intactos los de otra empresa', async () => {
    const { db, demo, real, ts } = await setup()
    for (const org of [demo, real]) {
      await db.insert(schema.contacts).values({ organizationId: org.id, name: `Contacto ${org.slug}`, status: 'active', createdAt: ts, updatedAt: ts })
    }
    await purgeDemoTenant(db, { MEDIA: createR2Shim() }, demo.id)
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, demo.id))).length).toBe(0)
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, real.id))).length).toBe(1)
    // La empresa se conserva.
    expect((await db.select().from(schema.organizations).where(eq(schema.organizations.id, demo.id))).length).toBe(1)
  })
})
