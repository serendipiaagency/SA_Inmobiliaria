import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEvent } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { demoReferenceRefs } from '../../server/demo/reference'
import { forgetDemoOrgCache } from '../../server/utils/demo/tenant'
import { createD1Shim } from './helpers/d1Shim'

/**
 * La demo en la WEB PÚBLICA (la que construye el Constructor Web): sus
 * propiedades de referencia salen primero en el catálogo y en la portada, con
 * la marca `demoReference` que pinta el marco dorado de la tarjeta. Sólo en la
 * empresa demo; las demás no cambian. Complementa test/unit/demoReferencia.test.ts
 * (los listados del panel).
 */
const ts = '2026-01-01 00:00:00'
afterEach(() => {
  vi.unstubAllGlobals()
  forgetDemoOrgCache()
})

async function setup() {
  const { DB } = createD1Shim()
  const { drizzle } = await import('drizzle-orm/d1')
  const db = drizzle(DB as any, { schema })
  const h3 = await import('h3')
  vi.stubGlobal('defineEventHandler', (f: any) => f)
  for (const k of ['createError', 'getQuery', 'readBody', 'getRequestHeader', 'getCookie', 'setResponseHeader', 'getRequestIP'] as const) vi.stubGlobal(k, (h3 as any)[k])

  async function tenant(name: string, source: string, refs: (string | null)[]) {
    const [org] = await db.insert(schema.organizations).values({ name, slug: name.toLowerCase().replace(/\W+/g, '-'), status: 'active', registrationSource: source, createdAt: ts, updatedAt: ts }).returning({ id: schema.organizations.id })
    const [dev] = await db.insert(schema.developers).values({ organizationId: org.id, name: `${name} Promotora`, status: 'active', createdAt: ts, updatedAt: ts }).returning({ id: schema.developers.id })
    const ids: number[] = []
    let n = 0
    for (const ref of refs) {
      n += 1
      const [p] = await db
        .insert(schema.developerProperties)
        .values({ organizationId: org.id, developerId: dev.id, name: `${name} ${n}`, slug: `${name.toLowerCase()}-${n}`, status: 'new', price: 100_000 + n * 1000, area: 80, agencyReference: ref, publishedAt: `2026-01-${String(n).padStart(2, '0')} 00:00:00`, createdAt: ts, updatedAt: ts } as any)
        .returning({ id: schema.developerProperties.id })
      ids.push(p.id)
    }
    return { orgId: org.id as number, ids }
  }

  // Siembra propiedades de 2ª mano (agent_properties) en una empresa ya creada, para la web pública que
  // mezcla los dos catálogos (server/api/public/properties.get.ts). Mismo contrato que `tenant`: una por
  // `ref` (su referencia de agencia), nombre y precio crecientes.
  async function seedAgent(orgId: number, refs: (string | null)[]) {
    const ids: number[] = []
    let n = 0
    for (const ref of refs) {
      n += 1
      const [p] = await db
        .insert(schema.agentProperties)
        .values({ organizationId: orgId, name: `Agent ${n}`, slug: `agent-${orgId}-${n}`, status: 'available', price: 200_000 + n * 1000, area: 90, agencyReference: ref, publishedAt: `2026-02-${String(n).padStart(2, '0')} 00:00:00`, createdAt: ts, updatedAt: ts } as any)
        .returning({ id: schema.agentProperties.id })
      ids.push(p.id)
    }
    return ids
  }

  const catalog = (await import('../../server/api/public/properties.get')).default as (e: any) => Promise<any>
  const home = (await import('../../server/api/public/home.get')).default as (e: any) => Promise<any>
  const call = (fn: any, orgId: number, query = '') => {
    const req: any = { method: 'GET', url: `/api/public/x${query}`, headers: { host: 'agencia.test' } }
    const res: any = { statusCode: 200, setHeader: () => {}, getHeader: () => undefined, removeHeader: () => {} }
    const event = createEvent(req, res)
    ;(event.context as any).cloudflare = { env: { DB, MEDIA: {} } }
    ;(event.context as any).org = { id: orgId }
    return fn(event)
  }
  return { db, tenant, seedAgent, catalog: (orgId: number, q = '') => call(catalog, orgId, q), home: (orgId: number) => call(home, orgId) }
}

// Más recientes primero por defecto (publishedAt crece con el número); las de referencia, las más antiguas.
// Mismo origen que la app: las referencias de obra nueva y de 2ª mano de server/demo/reference.ts.
const REFS = demoReferenceRefs('developer') // ['NA-P10', 'NA-P02']
const AGENT_REFS = demoReferenceRefs('agent') // ['NA-P11', 'NA-P19']
const demoRefs = [REFS[0], REFS[1], null, null, null, null]

describe('catálogo público de la demo', () => {
  it('con el orden por defecto las de referencia salen primero, en su orden, y marcadas', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const res = await catalog(demo.orgId)
    expect(res.rows.slice(0, 2).map((r: any) => r.id)).toEqual([demo.ids[0], demo.ids[1]])
    expect(res.rows.slice(0, 2).every((r: any) => r.demoReference === true)).toBe(true)
    expect(res.rows.slice(2).every((r: any) => r.demoReference === false)).toBe(true)
  })

  it('mezcla los dos catálogos: las de referencia de la web Y las de 2ª mano salen primero y marcadas', async () => {
    // La web pública saca juntos los dos catálogos de Property Core (obra nueva + 2ª mano), y la demo tiene
    // referencias en LOS DOS (server/demo/reference.ts). Con «Relevancia» cada catálogo pone las suyas primero
    // por su puesto (demoRank), así que las cuatro encabezan la mezcla; una de 2ª mano puede ir por delante de
    // una de la web, por eso se comprueba el CONJUNTO de las cuatro primeras, no el orden entre ellas.
    const { tenant, seedAgent, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', [REFS[0], REFS[1], null, null])
    await seedAgent(demo.orgId, [AGENT_REFS[0], AGENT_REFS[1], null, null])
    const res = await catalog(demo.orgId)
    expect(res.total).toBe(8) // 4 de obra nueva + 4 de 2ª mano
    expect(res.rows.slice(0, 4).every((r: any) => r.demoReference === true)).toBe(true)
    expect(res.rows.slice(4).every((r: any) => r.demoReference === false)).toBe(true)
    // Entre las cuatro primeras están las dos de la web (Demo 1/2) Y las dos de 2ª mano (Agent 1/2).
    expect(new Set(res.rows.slice(0, 4).map((r: any) => r.name))).toEqual(new Set(['Demo 1', 'Demo 2', 'Agent 1', 'Agent 2']))
  })

  it('el resto conserva el orden de siempre (relevancia: las más recientes primero)', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const rest = (await catalog(demo.orgId)).rows.slice(2).map((r: any) => r.id)
    expect(rest).toEqual([...demo.ids.slice(2)].reverse())
  })

  it('un orden elegido por la persona se respeta', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const cheap = await catalog(demo.orgId, '?sort=price_asc')
    expect(cheap.rows.map((r: any) => r.id)).toEqual(demo.ids)
    const dear = await catalog(demo.orgId, '?sort=price_desc')
    expect(dear.rows.map((r: any) => r.id)).toEqual([...demo.ids].reverse())
    // La marca sigue en su sitio aunque no estén primeras.
    expect(dear.rows.filter((r: any) => r.demoReference).map((r: any) => r.id).sort()).toEqual([demo.ids[0], demo.ids[1]].sort())
  })

  it('la prioridad vale en cada página: las de referencia están en la primera, nunca repetidas después', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const p1 = await catalog(demo.orgId, '?perPage=3&page=1')
    const p2 = await catalog(demo.orgId, '?perPage=3&page=2')
    expect(p1.rows.slice(0, 2).map((r: any) => r.id)).toEqual([demo.ids[0], demo.ids[1]])
    expect(p2.rows.some((r: any) => r.demoReference)).toBe(false)
    expect(new Set([...p1.rows, ...p2.rows].map((r: any) => r.id)).size).toBe(6)
    expect(p1.total).toBe(6)
  })

  it('los filtros se respetan: una de referencia que no encaja no aparece', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const res = await catalog(demo.orgId, '?minPrice=103000')
    expect(res.rows.every((r: any) => r.price >= 103_000)).toBe(true)
    expect(res.rows.some((r: any) => r.demoReference)).toBe(false)
  })

  it('con ids (favoritos) y recuento no cambia nada', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const count = await catalog(demo.orgId, '?countOnly=1')
    expect(count).toMatchObject({ rows: [], total: 6 })
  })

  it('no expone la referencia de agencia', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const res = await catalog(demo.orgId)
    for (const r of res.rows) expect(r).not.toHaveProperty('agencyReference')
  })
})

describe('otras empresas', () => {
  it('una inmobiliaria real con las mismas referencias no cambia de orden ni lleva marca', async () => {
    const { tenant, catalog } = await setup()
    const real = await tenant('Real', 'admin', demoRefs)
    const res = await catalog(real.orgId)
    expect(res.rows.map((r: any) => r.id)).toEqual([...real.ids].reverse())
    for (const r of res.rows) expect(r).not.toHaveProperty('demoReference')
  })

  it('la marca de una demo no se filtra a otra empresa', async () => {
    const { tenant, catalog } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const real = await tenant('Real', 'admin', [null, null])
    const res = await catalog(real.orgId)
    expect(res.rows.map((r: any) => r.id).sort()).toEqual([...real.ids].sort())
    expect(res.rows.some((r: any) => 'demoReference' in r)).toBe(false)
    expect(demo.orgId).not.toBe(real.orgId)
  })
})

describe('portada de la demo', () => {
  it('las de referencia van primero y marcadas; las demás, como siempre', async () => {
    const { tenant, home } = await setup()
    const demo = await tenant('Demo', 'demo', demoRefs)
    const { projects } = await home(demo.orgId)
    expect(projects.slice(0, 2).map((p: any) => p.id)).toEqual([demo.ids[0], demo.ids[1]])
    expect(projects.slice(0, 2).every((p: any) => p.demoReference)).toBe(true)
    expect(projects.slice(2).map((p: any) => p.id)).toEqual([...demo.ids.slice(2)].reverse())
    expect(projects.slice(2).every((p: any) => p.demoReference === false)).toBe(true)
  })

  it('una empresa real, sin cambios', async () => {
    const { tenant, home } = await setup()
    const real = await tenant('Real', 'admin', demoRefs)
    const { projects } = await home(real.orgId)
    expect(projects.map((p: any) => p.id)).toEqual([...real.ids].reverse())
    expect(projects.some((p: any) => 'demoReference' in p)).toBe(false)
  })
})

describe('la tarjeta pública', () => {
  const card = readFileSync(join(import.meta.dirname, '../../components/ProjectCard.vue'), 'utf8')
  it('pinta el marco dorado y la etiqueta sólo con la marca', () => {
    expect(card).toContain("'demo-reference-frame': project.demoReference")
    expect(card).toContain('v-if="project.demoReference"')
    expect(card).toContain('Propiedad de referencia')
  })
  it('es la misma tarjeta del catálogo, la portada y el bloque Propiedades', () => {
    for (const f of ['pages/propiedades/index.vue', 'components/site-builder/blocks/PropertiesBlock.vue', 'components/site-builder/blocks/PageCoreBlock.vue']) {
      expect(readFileSync(join(import.meta.dirname, '../..', f), 'utf8'), f).toContain('<ProjectCard')
    }
  })
  it('el marco es el mismo del panel: #C6A667, 2 px, sin animación', () => {
    const css = readFileSync(join(import.meta.dirname, '../../assets/css/main.css'), 'utf8')
    const rule = /\.demo-reference-frame::after\s*\{[^}]*\}/.exec(css)?.[0] || ''
    expect(rule).toContain('2px solid #c6a667')
    expect(rule).not.toMatch(/animation|transition/)
  })
})
