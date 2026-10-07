import { createEvent, type H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import type { SessionUser } from '../utils/auth'
import { atClock } from '../utils/clock'
import { utcToWallTime, zonedWallTimeToUtc } from '../utils/appointments/timezone'
import type { DemoState } from './state'

/**
 * Lo que comparte cada paso del seed de la cuenta demo.
 *
 * Los servicios de dominio reciben, según el caso, `db` o un evento H3 (del
 * que sacan la base de datos con `useDb(event)`). El seed no corre dentro de
 * una petición de verdad —lo lanza el cron o un botón del super admin—, así
 * que construye un evento propio con los bindings del Worker: el mismo camino
 * que una petición, sin cabeceras de nadie.
 *
 * Todas las consultas pasan por un contador: D1 limita las consultas por
 * invocación, y el ejecutor (runner.ts) corta entre pasos antes de acercarse.
 */

export const DEMO_TIMEZONE = 'Europe/Madrid'

export interface QueryCounter {
  count: number
}

/** El binding de D1 con cada consulta contada (un batch cuenta tantas como sentencias lleva). */
export function countingD1(d1: any, counter: QueryCounter): any {
  const wrapStatement = (stmt: any): any =>
    new Proxy(stmt, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        if (prop === 'bind') return (...args: any[]) => wrapStatement(value.apply(target, args))
        if (prop === 'run' || prop === 'all' || prop === 'first' || prop === 'raw') {
          return (...args: any[]) => {
            counter.count++
            return value.apply(target, args)
          }
        }
        return value.bind(target)
      },
    })
  return new Proxy(d1, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'prepare') return (q: string) => wrapStatement(value.call(target, q))
      if (prop === 'batch') {
        return (stmts: any[]) => {
          counter.count += Math.max(1, stmts.length)
          return value.call(target, stmts)
        }
      }
      if (prop === 'exec') {
        return (q: string) => {
          counter.count++
          return value.call(target, q)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Un evento H3 «de sistema» con los bindings dados, para los servicios que piden evento. */
export function demoSeedEvent(env: Record<string, any>, db: any): H3Event {
  const req: any = {
    method: 'POST',
    url: '/_demo/seed',
    headers: { host: 'demo-seed.internal', 'user-agent': 'norte-astur-demo-seed' },
    socket: { remoteAddress: '127.0.0.1' },
    connection: {},
  }
  const res: any = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    getHeader() {
      return undefined
    },
    getHeaders() {
      return {}
    },
    removeHeader() {},
    writeHead() {},
    end() {},
  }
  const event = createEvent(req, res)
  ;(event.context as any).cloudflare = { env }
  // Las pruebas unitarias sustituyen useDb() por event.context.db.
  ;(event.context as any).db = db
  ;(event.context as any).requestId = 'demo-seed'
  return event
}

/** De dónde salen los bytes de las imágenes de la demo (public/demo-assets/norte-astur/…). */
export interface DemoAssetSource {
  load(path: string): Promise<Uint8Array>
}

/** En el Worker: los ficheros estáticos publicados con la web (binding ASSETS). */
export function assetsBindingSource(env: Record<string, any>): DemoAssetSource {
  return {
    async load(path: string) {
      if (!env.ASSETS?.fetch) throw new Error('Sin binding ASSETS: no se pueden leer las imágenes de la demo')
      const res = await env.ASSETS.fetch(new Request(`https://assets.local/demo-assets/norte-astur/${path}`))
      if (!res.ok) throw new Error(`Imagen de la demo no encontrada: ${path} (${res.status})`)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

export interface DemoContext {
  db: any
  env: Record<string, any>
  event: H3Event
  counter: QueryCounter
  state: DemoState
  assets: DemoAssetSource
  /** Lo que tarda como mucho una invocación antes de dejar el resto para la siguiente. */
  deadline: number
}

export function buildDemoContext(input: { env: Record<string, any>; db?: any; state: DemoState; assets?: DemoAssetSource; budgetMs: number; counter?: QueryCounter }): DemoContext {
  const counter = input.counter ?? { count: 0 }
  const env = input.env.DB ? { ...input.env, DB: countingD1(input.env.DB, counter) } : { ...input.env }
  const db = input.db ?? drizzle(env.DB, { schema })
  return {
    db,
    env,
    event: demoSeedEvent(env, db),
    counter,
    state: input.state,
    assets: input.assets ?? assetsBindingSource(input.env),
    deadline: Date.now() + input.budgetMs,
  }
}

// ── Fechas del escenario ────────────────────────────────────────────────────
//
// Toda la historia se cuenta en días respecto al día de anclaje (el día en
// que se sembró, en Madrid): `-90` es hace tres meses, `+7` la semana que
// viene. Volver a sembrar re-ancla la historia al día de hoy, así que la demo
// nunca envejece: un restablecimiento la deja «al día».

/** AAAA-MM-DD de hoy en Madrid. */
export function madridToday(now: Date = new Date()): string {
  return utcToWallTime(now, DEMO_TIMEZONE).slice(0, 10)
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Hora de pared en Madrid ('AAAA-MM-DD HH:MM:SS') a `days` del anclaje. */
export function wallAt(anchorDay: string, days: number, hhmm: string): string {
  return `${shiftDay(anchorDay, days)} ${hhmm.length === 5 ? `${hhmm}:00` : hhmm}`
}

/** El instante UTC ('AAAA-MM-DD HH:MM:SS') de esa hora de pared en Madrid. */
export function utcAt(anchorDay: string, days: number, hhmm: string): string {
  return zonedWallTimeToUtc(wallAt(anchorDay, days, hhmm), DEMO_TIMEZONE).toISOString().replace('T', ' ').slice(0, 19)
}

/** Sólo la fecha ('AAAA-MM-DD') a `days` del anclaje. */
export function dayAt(anchorDay: string, days: number): string {
  return shiftDay(anchorDay, days)
}

/**
 * Ejecuta `fn` como si fuera ese momento del escenario: todo lo que los
 * servicios fechen con now() —alta, actividad, historiales— queda en esa hora.
 */
export function asOf<T>(anchorDay: string, days: number, hhmm: string, fn: () => Promise<T>): Promise<T> {
  return atClock(zonedWallTimeToUtc(wallAt(anchorDay, days, hhmm), DEMO_TIMEZONE), fn)
}

export function ctxId(ctx: DemoContext, key: string): number {
  const id = ctx.state.ids[key]
  if (!id) throw new Error(`Demo: falta «${key}» (lo crea un paso anterior)`)
  return id
}

export function ctxSetId(ctx: DemoContext, key: string, id: number): void {
  ctx.state.ids[key] = id
}

/** El usuario del panel con el que se hace una acción del escenario (la demo o un comercial). */
export function demoUser(ctx: DemoContext, key: string, info: { name: string; email: string; permissions?: string | null }): SessionUser {
  return { id: ctxId(ctx, key), name: info.name, email: info.email, role: 'admin', organizationId: ctx.state.orgId, permissions: info.permissions ?? null }
}
