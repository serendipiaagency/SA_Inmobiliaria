import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { advanceDemoProvisioning, requestDemoProvisioning, type DemoProgress } from '../../server/demo/runner'
import { demoScopedTables, DEMO_ORG_SLUG } from '../../server/demo/purge'
import { DEMO_ADMIN, DEMO_ADMIN_PASSWORD_HASH_DEFAULT } from '../../server/demo/dataset/company'
import { verifyPassword } from '../../server/utils/auth'
import { createD1Shim, createR2Shim } from './helpers/d1Shim'
import { seedTenant } from './helpers/tenantFixtures'

/**
 * La cuenta demo «Norte Astur Inmobiliaria» de punta a punta, sobre SQLite con
 * todas las migraciones y el mismo driver de D1 que el Worker: se pide, se
 * genera por tramos (como el cron), se comprueba que el resultado es coherente
 * y aislado, y se restablece sin tocar a otra empresa.
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
    if (progress.status !== 'provisioning' && progress.status !== 'resetting') break
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
    expect(await countFor(db, schema.cmsArticles, orgId)).toBe(4)
    expect(await countFor(db, schema.knowledgeDocuments, orgId)).toBe(5)
    expect(await countFor(db, schema.referrals, orgId)).toBe(6)
    expect(await countFor(db, schema.assetExportProjects, orgId)).toBe(5)
    expect(await countFor(db, schema.assetExportCatalogs, orgId)).toBe(3)
    expect(await countFor(db, schema.automations, orgId)).toBe(4)
    const [home] = await db.select().from(schema.sitePages).where(and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, 'home')))
    expect(JSON.parse(home.publishedJson!).blocks.length).toBe(11)

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

    // Restablecer: el primer tramo borra todo lo de la demo (y sólo lo de la demo).
    const mediaKeys = (await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))).map((r: any) => r.k)
    expect(mediaKeys.length).toBeGreaterThan(100)
    await requestDemoProvisioning(db, { reset: true, trigger: 'admin' })
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
    expect(await countFor(db, schema.contacts, other.orgId)).toBe(otherBefore)
    // La empresa se conserva (mismo id) para volver a sembrarla.
    const [kept] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, orgId))
    expect(kept.id).toBe(orgId)

    // Y se vuelve a sembrar igual sobre la misma empresa (idempotente).
    const again = await runToEnd(env)
    expect(again.error).toBeNull()
    expect(again.status).toBe('ready')
    expect(again.orgId).toBe(orgId)
    expect(await countFor(db, schema.leads, orgId)).toBe(40)
    expect(await countFor(db, schema.invoices, orgId)).toBe(16)
    expect((await db.select().from(schema.users).where(eq(schema.users.email, DEMO_ADMIN.email))).length).toBe(1)
  })
})
