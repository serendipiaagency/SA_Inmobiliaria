import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { advanceDemoProvisioning, requestDemoProvisioning, type DemoProgress } from '../../server/demo/runner'
import { demoScopedTables, DEMO_ORG_SLUG } from '../../server/demo/purge'
import { DEMO_SNAPSHOT_KEY, SNAPSHOT_SKIP_TABLES, orderTablesForInsert, type DemoSnapshot } from '../../server/demo/snapshot'
import { DEMO_ACTIVE_STATUSES } from '../../server/demo/state'
import { demoSeedEvent } from '../../server/demo/context'
import { storeAndRegisterFile } from '../../server/utils/media'
import { DEMO_ADMIN, DEMO_ADMIN_PASSWORD_HASH_DEFAULT } from '../../server/demo/dataset/company'
import { verifyPassword } from '../../server/utils/auth'
import { createD1Shim, createR2Shim } from './helpers/d1Shim'
import { seedTenant } from './helpers/tenantFixtures'

/**
 * La cuenta demo «Norte Astur Inmobiliaria» de punta a punta, sobre SQLite con
 * todas las migraciones y el mismo driver de D1 que el Worker: se pide, se
 * genera por tramos (como el cron), se comprueba que el resultado es coherente
 * y aislado, se restablece desde su instantánea sin destruir lo sembrado (sólo
 * desaparece lo que dejaron los visitantes), aplica los eventos que el código
 * añade después y, si se regenera de cero, no deja rastro.
 */

// La auditoría usa auto-imports de Nitro (getRequestHeader) que no existen en Vitest.
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))

const PUBLIC_ASSETS = join(import.meta.dirname, '../../public/demo-assets/norte-astur')

const assets = {
  async load(path: string) {
    const file = join(PUBLIC_ASSETS, path)
    if (existsSync(file)) return new Uint8Array(readFileSync(file))
    throw new Error(`Falta la imagen de la demo ${path}`)
  },
}

/** Como el cron: tramos con el presupuesto real de consultas. Devuelve también la invocación más cara. */
async function runToEnd(env: Record<string, any>): Promise<DemoProgress & { maxQueries: number; invocations: number }> {
  let progress: DemoProgress | null = null
  let maxQueries = 0
  let invocations = 0
  for (let i = 0; i < 400; i++) {
    progress = await advanceDemoProvisioning(env, { trigger: 'cron', assets, budgetMs: 600_000 })
    invocations++
    maxQueries = Math.max(maxQueries, progress.queries)
    if (!DEMO_ACTIVE_STATUSES.includes(progress.status as any)) break
  }
  return { ...progress!, maxQueries, invocations }
}

async function countFor(db: any, table: any, orgId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.organizationId, orgId))
  return Number(row.n)
}

describe('cuenta demo Norte Astur', () => {
  it('se genera completa, aislada y sin envíos, y se restablece sin dejar rastro', { timeout: 900_000 }, async () => {
    const { DB } = createD1Shim()
    const MEDIA = createR2Shim()
    const env = { DB, MEDIA }
    const db = drizzle(DB as any, { schema })

    // Otra agencia con datos: no puede verse afectada por nada de la demo.
    const other = await seedTenant(db, 'Otra')
    const otherBefore = await countFor(db, schema.contacts, other.orgId)

    await requestDemoProvisioning(db, { reset: false, trigger: 'cron' })
    const done = await runToEnd(env)
    expect(done.error).toBeNull()
    expect(done.status).toBe('ready')
    // Ninguna invocación se acerca al límite de D1 (1000 consultas).
    expect(done.maxQueries).toBeLessThan(800)
    process.stdout.write(`DEMO-STATS invocaciones=${done.invocations} maxQueries=${done.maxQueries} eventos=${done.total}\n`)
    const orgId = done.orgId!
    expect(orgId).not.toBe(other.orgId)

    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId))
    expect(org.slug).toBe(DEMO_ORG_SLUG)
    expect(org.registrationSource).toBe('demo')

    // Administradora de la empresa demo, no super admin, con contraseña real (hash).
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_ADMIN.email))
    expect(admin.organizationId).toBe(orgId)
    expect(admin.role).toBe('admin')
    // La contraseña sólo existe como hash PBKDF2 (el del dataset); ni aquí está en claro.
    expect(admin.password).toBe(DEMO_ADMIN_PASSWORD_HASH_DEFAULT)
    expect(admin.password).toMatch(/^pbkdf2\$\d+\$/)
    expect(await verifyPassword('una-contraseña-cualquiera', admin.password)).toBe(false)

    // Volúmenes del escenario.
    expect(await countFor(db, schema.developerProperties, orgId)).toBe(10)
    expect(await countFor(db, schema.agentProperties, orgId)).toBe(10)
    expect(await countFor(db, schema.leads, orgId)).toBe(40)
    expect(await countFor(db, schema.offers, orgId)).toBe(13)
    expect(await countFor(db, schema.dealOperations, orgId)).toBe(8)
    expect(await countFor(db, schema.reservations, orgId)).toBe(8)
    expect(await countFor(db, schema.contracts, orgId)).toBe(7)
    expect(await countFor(db, schema.depositPayments, orgId)).toBe(6)
    expect(await countFor(db, schema.invoices, orgId)).toBe(16)
    expect(await countFor(db, schema.contacts, orgId)).toBeGreaterThanOrEqual(54)

    // Comunicaciones, contenido y marketing.
    expect(await countFor(db, schema.commsCalls, orgId)).toBe(10)
    expect(await countFor(db, schema.notes, orgId)).toBe(10)
    const chats = await db.select().from(schema.commsWebThreads).where(and(eq(schema.commsWebThreads.organizationId, orgId), eq(schema.commsWebThreads.kind, 'chat')))
    expect(chats.length).toBe(7)
    // 4 artículos del dataset + las 6 guías de compra (server/content/guiasCompra).
    expect(await countFor(db, schema.cmsArticles, orgId)).toBe(10)
    expect(await countFor(db, schema.knowledgeDocuments, orgId)).toBe(5)
    expect(await countFor(db, schema.referrals, orgId)).toBe(6)
    expect(await countFor(db, schema.assetExportProjects, orgId)).toBe(5)
    expect(await countFor(db, schema.assetExportCatalogs, orgId)).toBe(3)
    expect(await countFor(db, schema.automations, orgId)).toBe(4)
    const [home] = await db.select().from(schema.sitePages).where(and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, 'home')))
    // 11 bloques + «Zonas» (docs/zonas.md) + los cuatro corporativos: «Conoce
    // nuestra inmobiliaria», «Nuestras oficinas» y «Nuestra experiencia» son
    // nuevos y el de comerciales pasa al diseño editorial (docs/home-corporativa.md).
    const homeBlocks = JSON.parse(home.publishedJson!).blocks
    expect(homeBlocks.length).toBe(15)
    expect(homeBlocks.map((b: any) => b.type)).toEqual(['hero', 'properties', 'about-agency', 'map-teaser', 'properties', 'communities', 'text', 'zones-grid', 'team', 'offices', 'trust-points', 'mortgage-calculator', 'lead-form', 'blog-list', 'cta'])
    expect(homeBlocks.filter((b: any) => b.type === 'team'), 'el bloque de comerciales no se duplica').toHaveLength(1)
    expect(homeBlocks.find((b: any) => b.type === 'team').content.layout).toBe('editorial')
    const about = homeBlocks.find((b: any) => b.type === 'about-agency').content
    expect(about.stats, 'sólo cifras en vivo: la demo no tiene cifras verificadas propias').toEqual(['team', 'offices', 'properties'])
    expect(Object.keys(about).filter((k) => k.startsWith('customValue'))).toEqual([])
    // Las oficinas publican lo que la web enseña: horario, coordenadas y una sola principal.
    const offices = await db.select().from(schema.offices).where(eq(schema.offices.organizationId, orgId))
    expect(offices).toHaveLength(3)
    for (const o of offices) {
      expect(o.openingHours, o.name).toBeTruthy()
      expect(o.lat, o.name).toBeTypeOf('number')
      expect(o.lng, o.name).toBeTypeOf('number')
      expect(o.showOnWeb, o.name).toBe(1)
    }
    expect(offices.filter((o) => o.isMain === 1).map((o) => o.name)).toEqual(['Oviedo Centro'])
    expect(await countFor(db, schema.zones, orgId)).toBe(37)

    // Las métricas salen de los registros, no se escriben a mano.
    const metrics = await db.select().from(schema.metricsDaily).where(eq(schema.metricsDaily.organizationId, orgId))
    expect(metrics.length).toBeGreaterThan(180)
    const sum = (k: 'leads' | 'visitors' | 'reservations') => metrics.reduce((acc: number, m: any) => acc + Number(m[k]), 0)
    expect(sum('leads')).toBe(40)
    expect(sum('reservations')).toBe(8)
    expect(sum('visitors')).toBeGreaterThan(0)
    const scored = await db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), sql`score_computed_at IS NOT NULL`))
    expect(Number(scored[0].n)).toBe(40)

    // Comisión de la factura de una operación cerrada = la de la ficha (3,5 % de 340.000 €).
    const [f01] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.organizationId, orgId), eq(schema.invoices.concept, 'Honorarios de intermediación · Venta de la casa de Selorio (Villaviciosa)')))
    expect(f01.amount).toBe(11_900)
    expect(f01.tax).toBe(2_499)

    // Las facturas van numeradas por orden de emisión, sin huecos ni repetidos.
    const invoices = await db.select({ number: schema.invoices.number, issuedAt: schema.invoices.issuedAt }).from(schema.invoices).where(eq(schema.invoices.organizationId, orgId)).orderBy(schema.invoices.issuedAt, schema.invoices.number)
    expect(invoices.length).toBe(16)
    const seqs = invoices.map((i: any) => Number(i.number.slice(-4)))
    for (let i = 1; i < seqs.length; i++) expect(seqs[i] === seqs[i - 1] + 1 || seqs[i] === 1).toBe(true)
    expect(invoices.every((i: any) => i.number.startsWith(`NA-${i.issuedAt.slice(0, 4)}-`))).toBe(true)

    // Nada ha salido de la plataforma.
    const sent = await db.select({ n: sql<number>`count(*)` }).from(schema.emailLog).where(and(eq(schema.emailLog.organizationId, orgId), eq(schema.emailLog.status, 'sent')))
    expect(Number(sent[0].n)).toBe(0)

    // La otra agencia sigue igual.
    expect(await countFor(db, schema.contacts, other.orgId)).toBe(otherBefore)

    // ── Instantánea del estado sembrado ──────────────────────────────────────
    const snapshotJson = async () => JSON.parse(new TextDecoder().decode(MEDIA.objects.get(DEMO_SNAPSHOT_KEY)!.bytes)) as DemoSnapshot
    expect(MEDIA.objects.has(DEMO_SNAPSHOT_KEY)).toBe(true)
    expect(done.snapshotAt).toBeTruthy()
    const snapshot = await snapshotJson()
    expect(snapshot.orgId).toBe(orgId)
    expect(Object.keys(snapshot.state.done).length).toBe(done.total)
    expect(snapshot.tables.some((t) => SNAPSHOT_SKIP_TABLES.has(t.name))).toBe(false)
    // Cada tabla va después de todas sus padres según las claves foráneas reales (orden de inserción).
    const order = snapshot.tables.map((t) => t.name)
    const { order: expectedOrder, cycles } = await orderTablesForInsert(db, order)
    expect(cycles).toEqual([])
    expect(order).toEqual(expectedOrder)
    expect(order.indexOf('contacts')).toBeLessThan(order.indexOf('leads'))
    expect(order.indexOf('leads')).toBeLessThan(order.indexOf('visits'))
    const seededRows = Object.fromEntries(snapshot.tables.map((t) => [t.name, t.rows.length]))
    expect(seededRows.contacts).toBeGreaterThan(10)
    expect(seededRows.media_assets).toBeGreaterThan(100)

    // ── Lo que dejan los visitantes: un contacto nuevo, un cambio y un fichero ──
    const mediaKeys = (await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))).map((r: any) => r.k)
    expect(mediaKeys.length).toBeGreaterThan(100)
    const contactsBefore = await countFor(db, schema.contacts, orgId)
    const [firstContact] = await db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.organizationId, orgId)).orderBy(schema.contacts.id).limit(1)
    await db.insert(schema.contacts).values({ organizationId: orgId, name: 'Visitante de la demo' })
    await db.update(schema.contacts).set({ name: 'Tocado por un visitante' }).where(eq(schema.contacts.id, firstContact.id))
    const uploaded = await storeAndRegisterFile(
      demoSeedEvent(env, db),
      db,
      { data: await assets.load('personas/c01.jpg'), type: 'image/jpeg', filename: 'visitante.jpg' },
      { organizationId: orgId, visibility: 'public', category: 'upload' },
    )
    expect(MEDIA.objects.has(uploaded.key)).toBe(true)
    expect(await countFor(db, schema.contacts, orgId)).toBe(contactsBefore + 1)

    // ── Restablecer: NO destructivo ───────────────────────────────────────────
    const requested = await requestDemoProvisioning(db, { mode: 'restore', trigger: 'admin' }, env)
    expect(requested.status).toBe('restoring')
    const restored = await runToEnd(env)
    expect(restored.error).toBeNull()
    expect(restored.status).toBe('ready')
    expect(restored.orgId).toBe(orgId)
    expect(restored.anchorDay).toBe(done.anchorDay) // no se re-ancla
    expect(restored.maxQueries).toBeLessThan(800)
    process.stdout.write(`DEMO-RESTORE invocaciones=${restored.invocations} maxQueries=${restored.maxQueries}\n`)
    // Lo del visitante ha desaparecido; lo sembrado está igual.
    expect(await countFor(db, schema.contacts, orgId)).toBe(contactsBefore)
    expect((await db.select({ name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.id, firstContact.id)))[0].name).toBe(firstContact.name)
    expect(MEDIA.objects.has(uploaded.key)).toBe(false)
    expect(await countFor(db, schema.leads, orgId)).toBe(40)
    expect(await countFor(db, schema.invoices, orgId)).toBe(16)
    // Las imágenes sembradas siguen en R2 con las mismas claves, y la biblioteca las sigue registrando.
    const mediaAfter = (await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))).map((r: any) => r.k)
    expect(mediaAfter.sort()).toEqual([...mediaKeys].sort())
    expect(mediaKeys.every((k: string) => MEDIA.objects.has(k))).toBe(true)
    // Misma cantidad de filas por tabla que en la instantánea.
    for (const t of snapshot.tables) {
      const scoped = demoScopedTables().find((x) => x.name === t.name)!
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(sql`${sql.identifier(t.name)}`).where(scoped.where(orgId))
      expect(Number(row.n), t.name).toBe(t.rows.length)
    }
    // La otra agencia, intacta; la gerente sigue entrando con su contraseña.
    expect(await countFor(db, schema.contacts, other.orgId)).toBe(otherBefore)
    const [adminAfter] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_ADMIN.email))
    expect(adminAfter.password).toBe(DEMO_ADMIN_PASSWORD_HASH_DEFAULT)
    // Se ha vuelto a guardar la instantánea.
    expect(restored.snapshotAt).not.toBe(done.snapshotAt)

    // ── Un paso nuevo del código: sólo se ejecuta ese ─────────────────────────
    // Se simula quitando de la instantánea la clave del último control de SLA (idempotente).
    const tampered = await snapshotJson()
    const pendingKey = Object.keys(tampered.state.done).find((k) => k.endsWith('SLA al día'))!
    expect(pendingKey).toBeTruthy()
    tampered.state.done = Object.fromEntries(Object.entries(tampered.state.done).filter(([k]) => k !== pendingKey)) as Record<string, 1>
    await MEDIA.put(DEMO_SNAPSHOT_KEY, JSON.stringify(tampered))
    expect((await requestDemoProvisioning(db, { mode: 'restore', trigger: 'admin' }, env)).status).toBe('restoring')
    let updated: DemoProgress | null = null
    let ranTotal = 0
    for (let i = 0; i < 50; i++) {
      updated = await advanceDemoProvisioning(env, { trigger: 'admin', assets, budgetMs: 600_000 })
      ranTotal += updated.ran
      if (!DEMO_ACTIVE_STATUSES.includes(updated.status as any)) break
    }
    expect(updated!.status).toBe('ready')
    expect(ranTotal).toBe(1)
    expect(Object.keys((await snapshotJson()).state.done)).toContain(pendingKey)

    // ── Regenerar: el primer tramo borra todo lo de la demo (y sólo lo de la demo), ficheros incluidos ──
    await requestDemoProvisioning(db, { mode: 'regenerate', trigger: 'admin' }, env)
    const purged = await advanceDemoProvisioning(env, { trigger: 'admin', assets, budgetMs: 600_000, maxQueries: 1_000_000 })
    expect(purged.error).toBeNull()
    expect(purged.status).toBe('provisioning')
    expect(purged.stepIndex).toBe(0)
    const leftovers: string[] = []
    for (const t of demoScopedTables()) {
      const where = t.where(orgId)
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(sql`${sql.identifier(t.name)}`).where(where)
      if (Number(row.n) > 0) leftovers.push(`${t.name}: ${row.n}`)
    }
    expect(leftovers).toEqual([])
    expect(mediaKeys.some((k: string) => MEDIA.objects.has(k))).toBe(false)
    expect(MEDIA.objects.has(DEMO_SNAPSHOT_KEY)).toBe(false)
    expect(await countFor(db, schema.contacts, other.orgId)).toBe(otherBefore)
    // La empresa se conserva (mismo id) para volver a sembrarla.
    const [kept] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, orgId))
    expect(kept.id).toBe(orgId)

    // Y se vuelve a sembrar igual sobre la misma empresa (idempotente), con instantánea nueva.
    const again = await runToEnd(env)
    expect(again.error).toBeNull()
    expect(again.status).toBe('ready')
    expect(again.orgId).toBe(orgId)
    expect(await countFor(db, schema.leads, orgId)).toBe(40)
    expect(await countFor(db, schema.invoices, orgId)).toBe(16)
    expect((await db.select().from(schema.users).where(eq(schema.users.email, DEMO_ADMIN.email))).length).toBe(1)
    expect(MEDIA.objects.has(DEMO_SNAPSHOT_KEY)).toBe(true)
  })
})
