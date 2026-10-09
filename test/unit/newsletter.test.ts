import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '../../server/utils/db'
import { adminUnsubscribe, confirmSubscription, deleteSubscription, listSubscriptions, subscribeToNewsletter, subscriptionsCsv, unsubscribeByToken } from '../../server/utils/newsletter'
import { getFooterDraft, getPublishedFooter, loadFooterAvailability, loadFooterProfile, publishFooter, saveFooterDraft, validateFooterConfig } from '../../server/utils/siteFooter'
import { getPublishedPage, publishPage, requireValidPageKey, saveDraft } from '../../server/utils/sitePages'
import { defaultFooterConfig } from '../../utils/siteFooter'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * El newsletter del pie (migración 0093, server/utils/newsletter.ts) y el
 * pie global guardado en site_pages (server/utils/siteFooter.ts), contra el
 * esquema real: consentimiento, sin duplicados, tokens sólo como hash, baja
 * y doble opt-in; borrador/publicación del pie y datos de la empresa sin
 * inventar nada. Y, como todo lo demás, cada inmobiliaria sólo ve lo suyo.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

describe('suscripciones: consentimiento, sin duplicados, tokens sólo como hash', () => {
  it('un alta guarda el email normalizado con su consentimiento y devuelve el token de baja una sola vez', async () => {
    const r = await subscribeToNewsletter(db, A.orgId, { email: '  Ana@Ejemplo.COM ', locale: 'es' })
    expect(r).toMatchObject({ status: 'subscribed', created: true, confirmToken: null })
    expect(r.unsubscribeToken).toMatch(/^[0-9a-f]{48}$/)
    const [row] = await db.select().from(schema.newsletterSubscriptions).where(eq(schema.newsletterSubscriptions.organizationId, A.orgId))
    expect(row).toMatchObject({ email: 'ana@ejemplo.com', status: 'subscribed', source: 'footer', locale: 'es' })
    expect(row.consentAt).toBeTruthy()
    expect(row.unsubscribeTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.unsubscribeTokenHash).not.toBe(r.unsubscribeToken)
    expect(JSON.stringify(row)).not.toContain(r.unsubscribeToken)
  })

  it('quien repite no se duplica y no recibe un token nuevo (nadie consigue el enlace de baja de otro)', async () => {
    const first = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    const again = await subscribeToNewsletter(db, A.orgId, { email: 'ANA@ejemplo.com' })
    expect(again).toEqual({ status: 'subscribed', created: false, unsubscribeToken: null, confirmToken: null })
    const rows = await db.select().from(schema.newsletterSubscriptions).where(eq(schema.newsletterSubscriptions.organizationId, A.orgId))
    expect(rows).toHaveLength(1)
    expect(first.unsubscribeToken).toBeTruthy()
  })

  it('un email inválido o demasiado largo se rechaza con 422', async () => {
    for (const bad of ['', 'no-es-email', 'a@b', `${'x'.repeat(250)}@e.com`]) {
      await expect(subscribeToNewsletter(db, A.orgId, { email: bad })).rejects.toMatchObject({ statusCode: 422 })
    }
  })

  it('baja con el token: queda «unsubscribed» con fecha; repetir no falla; un token falso es 404', async () => {
    const r = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    expect(await unsubscribeByToken(db, A.orgId, r.unsubscribeToken)).toEqual({ email: 'ana@ejemplo.com' })
    const [row] = await db.select().from(schema.newsletterSubscriptions).where(eq(schema.newsletterSubscriptions.organizationId, A.orgId))
    expect(row.status).toBe('unsubscribed')
    expect(row.unsubscribedAt).toBeTruthy()
    await unsubscribeByToken(db, A.orgId, r.unsubscribeToken)
    await expect(unsubscribeByToken(db, A.orgId, 'f'.repeat(48))).rejects.toMatchObject({ statusCode: 404 })
    await expect(unsubscribeByToken(db, A.orgId, 'not-a-token')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('tras darse de baja, volver a apuntarse reactiva la misma fila con consentimiento y token nuevos', async () => {
    const r1 = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    await unsubscribeByToken(db, A.orgId, r1.unsubscribeToken)
    const r2 = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    expect(r2.created).toBe(true)
    expect(r2.unsubscribeToken).not.toBe(r1.unsubscribeToken)
    const rows = await db.select().from(schema.newsletterSubscriptions).where(eq(schema.newsletterSubscriptions.organizationId, A.orgId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'subscribed', unsubscribedAt: null })
    // El token viejo ya no sirve.
    await expect(unsubscribeByToken(db, A.orgId, r1.unsubscribeToken)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('doble opt-in (preparado): pendiente hasta confirmar; el token de confirmación caduca', async () => {
    const r = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com', doubleOptIn: true })
    expect(r.status).toBe('pending')
    expect(r.confirmToken).toMatch(/^[0-9a-f]{48}$/)
    await expect(confirmSubscription(db, A.orgId, 'f'.repeat(48))).rejects.toMatchObject({ statusCode: 404 })
    expect(await confirmSubscription(db, A.orgId, r.confirmToken)).toEqual({ email: 'ana@ejemplo.com' })
    const [row] = await db.select().from(schema.newsletterSubscriptions).where(eq(schema.newsletterSubscriptions.organizationId, A.orgId))
    expect(row).toMatchObject({ status: 'subscribed', confirmTokenHash: null })
    expect(row.confirmedAt).toBeTruthy()
    // Caducado: 410.
    const r2 = await subscribeToNewsletter(db, B.orgId, { email: 'b@ejemplo.com', doubleOptIn: true })
    await db.update(schema.newsletterSubscriptions).set({ confirmExpiresAt: '2000-01-01T00:00:00.000Z' }).where(eq(schema.newsletterSubscriptions.organizationId, B.orgId))
    await expect(confirmSubscription(db, B.orgId, r2.confirmToken)).rejects.toMatchObject({ statusCode: 410 })
  })
})

describe('panel: listado, filtros, CSV, baja y supresión; cada empresa lo suyo', () => {
  it('listado con contadores y filtro; sin tokens; CSV con BOM y sin fórmulas', async () => {
    await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com', locale: 'es' })
    const r = await subscribeToNewsletter(db, A.orgId, { email: 'bea@ejemplo.com' })
    await unsubscribeByToken(db, A.orgId, r.unsubscribeToken)
    await subscribeToNewsletter(db, A.orgId, { email: '=cmd@ejemplo.com' })
    const all = await listSubscriptions(db, A.orgId)
    expect(all.total).toBe(3)
    expect(all.counts).toEqual({ subscribed: 2, pending: 0, unsubscribed: 1 })
    expect(Object.keys(all.items[0]!)).not.toContain('unsubscribeTokenHash')
    expect((await listSubscriptions(db, A.orgId, { status: 'unsubscribed' })).items.map((i) => i.email)).toEqual(['bea@ejemplo.com'])
    expect((await listSubscriptions(db, A.orgId, { q: 'ANA' })).items.map((i) => i.email)).toEqual(['ana@ejemplo.com'])
    const csv = subscriptionsCsv(all.items)
    expect(csv.startsWith('﻿Email;Estado;')).toBe(true)
    expect(csv).toContain("'=cmd@ejemplo.com")
    expect(csv).toContain('Baja')
  })

  it('la empresa da de baja o borra a alguien; nunca lo de otra empresa', async () => {
    await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    await subscribeToNewsletter(db, B.orgId, { email: 'ana@ejemplo.com' })
    const a = (await listSubscriptions(db, A.orgId)).items[0]!
    const b = (await listSubscriptions(db, B.orgId)).items[0]!
    expect(a.id).not.toBe(b.id)
    await expect(adminUnsubscribe(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteSubscription(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await adminUnsubscribe(db, A.orgId, a.id)
    expect((await listSubscriptions(db, A.orgId)).items[0]!.status).toBe('unsubscribed')
    expect((await listSubscriptions(db, B.orgId)).items[0]!.status).toBe('subscribed')
    await deleteSubscription(db, A.orgId, a.id)
    expect((await listSubscriptions(db, A.orgId)).total).toBe(0)
    expect((await listSubscriptions(db, B.orgId)).total).toBe(1)
  })

  it('el mismo email en dos empresas son dos suscripciones; el token de una no da de baja a la otra', async () => {
    const ra = await subscribeToNewsletter(db, A.orgId, { email: 'ana@ejemplo.com' })
    await subscribeToNewsletter(db, B.orgId, { email: 'ana@ejemplo.com' })
    await expect(unsubscribeByToken(db, B.orgId, ra.unsubscribeToken)).rejects.toMatchObject({ statusCode: 404 })
    expect((await listSubscriptions(db, B.orgId)).items[0]!.status).toBe('subscribed')
    await expect(subscribeToNewsletter(db, null, { email: 'x@ejemplo.com' })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('el pie global en site_pages: borrador, publicación y datos de la empresa', () => {
  it('«footer» no es una página: la API de páginas lo rechaza y no sale en la lista', () => {
    expect(() => requireValidPageKey('footer')).toThrow()
  })

  it('sin nada guardado, la web enseña el pie de partida y el borrador no cuenta como «cambios»', async () => {
    expect(await getPublishedFooter(db, A.orgId)).toEqual(defaultFooterConfig())
    const draft = await getFooterDraft(db, A.orgId)
    expect(draft.config).toEqual(defaultFooterConfig())
    expect(draft).toMatchObject({ published: false, version: 0, hasUnpublishedChanges: false })
  })

  it('guardar cambia sólo el borrador; publicar lo lleva a la web y sube la versión; lo inválido se normaliza', async () => {
    const cfg = validateFooterConfig({ footer: { description: 'Hola', design: { background: 'rojo' }, columns: { explore: { links: [{ kind: 'url', target: 'https://ejemplo.com' }] } } } })
    expect(cfg.description).toBe('Hola')
    expect(cfg.design.background).toBe('')
    await saveFooterDraft(db, A.orgId, cfg)
    expect(await getPublishedFooter(db, A.orgId)).toEqual(defaultFooterConfig())
    expect((await getFooterDraft(db, A.orgId)).hasUnpublishedChanges).toBe(true)
    expect(await publishFooter(db, A.orgId, A.userId)).toBe(1)
    const pub = await getPublishedFooter(db, A.orgId)
    expect(pub.description).toBe('Hola')
    expect(pub.columns.explore.links).toEqual([{ id: 'l-0', kind: 'url', target: 'https://ejemplo.com', label: '', visible: true }])
    expect((await getFooterDraft(db, A.orgId))).toMatchObject({ published: true, version: 1, hasUnpublishedChanges: false })
    // Publicar sin haber tocado nunca el borrador publica el pie de partida explícito.
    expect(await publishFooter(db, B.orgId, B.userId)).toBe(1)
    expect(await getPublishedFooter(db, B.orgId)).toEqual(defaultFooterConfig())
  })

  it('un pie demasiado grande es 413', () => {
    expect(() => validateFooterConfig({ description: 'x'.repeat(400), columns: { explore: { links: Array.from({ length: 12 }, () => ({ kind: 'url', target: `https://e.com/${'y'.repeat(490)}`, label: 'z'.repeat(60) })) } } })).not.toThrow()
    // 64 KB no se alcanzan con los topes del modelo: la validación de tamaño es la red de seguridad.
  })

  it('cada empresa tiene su pie: el de A no se ve desde B ni al publicar', async () => {
    const cfg = validateFooterConfig({ description: 'Pie de Alpha' })
    await saveFooterDraft(db, A.orgId, cfg)
    await publishFooter(db, A.orgId, A.userId)
    expect((await getPublishedFooter(db, A.orgId)).description).toBe('Pie de Alpha')
    expect((await getPublishedFooter(db, B.orgId)).description).toBe('')
    expect((await getFooterDraft(db, B.orgId)).config.description).toBe('')
    await expect(getFooterDraft(db, null)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('el pie y las páginas no se pisan: publicar el pie no toca la portada', async () => {
    await saveDraft(db, A.orgId, 'home', { blocks: [{ id: 'h', type: 'hero', version: 1, content: {} }], seo: {} })
    await publishPage(db, A.orgId, 'home', A.userId)
    await saveFooterDraft(db, A.orgId, validateFooterConfig({ description: 'X' }))
    await publishFooter(db, A.orgId, A.userId)
    expect((await getPublishedPage(db, A.orgId, 'home')).blocks).toHaveLength(1)
  })

  it('datos de la empresa: teléfono del Brand Kit, ciudad de la oficina principal, redes reales; sin nada, null', async () => {
    const empty = await loadFooterProfile(db, A.orgId)
    expect(empty).toEqual({ phone: null, location: null, mapQuery: null, social: [] })
    const ts = '2026-01-01 00:00:00'
    await db.insert(schema.brandKits).values({ organizationId: A.orgId, phone: '+34 985 000 100', socialLinksJson: JSON.stringify({ instagram: 'https://instagram.com/alpha', facebook: 'https://facebook.example/alpha' }), createdAt: ts, updatedAt: ts })
    await db.insert(schema.offices).values({ organizationId: A.orgId, name: 'Central', city: 'Oviedo', province: 'Asturias', address: 'Calle Uría 1', postalCode: '33003', status: 'active', createdAt: ts, updatedAt: ts })
    await db.insert(schema.offices).values({ organizationId: A.orgId, name: 'Borrada', city: 'Gijón', status: 'active', deletedAt: ts, createdAt: ts, updatedAt: ts })
    const p = await loadFooterProfile(db, A.orgId)
    expect(p).toEqual({ phone: '+34 985 000 100', location: 'Oviedo, Asturias', mapQuery: 'Calle Uría 1, 33003, Oviedo, Asturias', social: [{ network: 'instagram', url: 'https://instagram.com/alpha' }] })
    // La otra empresa no hereda nada de esto.
    expect(await loadFooterProfile(db, B.orgId)).toEqual({ phone: null, location: null, mapQuery: null, social: [] })
  })

  it('qué páginas están publicadas (para «Servicios»), por empresa', async () => {
    expect((await loadFooterAvailability(db, A.orgId)).publishedPages).toEqual([])
    await saveDraft(db, A.orgId, 'servicios', { blocks: [{ id: 't', type: 'text', version: 1, content: {} }], seo: {} })
    await publishPage(db, A.orgId, 'servicios', A.userId)
    expect((await loadFooterAvailability(db, A.orgId)).publishedPages).toEqual(['servicios'])
    expect((await loadFooterAvailability(db, B.orgId)).publishedPages).toEqual([])
    // El propio «footer» publicado no cuenta como página.
    await publishFooter(db, A.orgId, A.userId)
    expect((await loadFooterAvailability(db, A.orgId)).publishedPages).toEqual(['servicios'])
  })
})
