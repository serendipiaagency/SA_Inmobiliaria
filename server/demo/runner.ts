import { buildDemoContext, madridToday, type DemoAssetSource, type DemoContext } from './context'
import { emptyDemoState, readDemoState, writeDemoState, type DemoState, type DemoStatus } from './state'
import { assertDemoOrganization, purgeDemoTenant, DEMO_ORG_SLUG } from './purge'
import { forgetDemoOrgCache } from '../utils/demo/tenant'
import { runEvent } from './timeline'
import { buildDemoTimeline } from './scenario'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

/**
 * El ejecutor del seed de la cuenta demo, por tramos.
 *
 * La historia completa son unos cientos de eventos y miles de consultas: no
 * cabe en una invocación de un Worker (D1 admite unas mil consultas por
 * invocación y el cron comparte invocación con otras tareas). Así que cada
 * llamada —el cron de cada minuto o el botón del super admin— ejecuta los
 * eventos que caben en su presupuesto de tiempo y de consultas, guarda por
 * dónde va y lo deja para la siguiente.
 *
 * Seguridad:
 *  - Sólo una invocación a la vez (cerrojo con caducidad en el propio estado,
 *    escrito con compare-and-swap).
 *  - Restablecer borra únicamente la empresa demo: `purgeDemoTenant` vuelve a
 *    comprobar slug, origen «demo» y que no es la empresa 1.
 *  - Si un evento falla, se para con el error visible. El cron lo reintenta
 *    desde cero (purga + reproducción) como mucho MAX_AUTO_RETRIES veces;
 *    después espera a que el super admin lo restablezca.
 */

const DEFAULT_BUDGET_MS = 20_000
/** Margen sobre el límite de consultas por invocación (los eventos más pesados rondan las 120). */
const DEFAULT_MAX_QUERIES = 450
const MAX_AUTO_RETRIES = 3
const LEASE_GRACE_MS = 60_000

export interface DemoProgress {
  status: DemoStatus | 'idle'
  orgId: number | null
  stepIndex: number
  total: number | null
  lastStep: string | null
  error: string | null
  attempts: number
  startedAt: string | null
  finishedAt: string | null
  anchorDay: string | null
  /** Eventos ejecutados en esta llamada. */
  ran: number
  /** Otra invocación tiene el cerrojo. */
  busy: boolean
  /** Consultas a D1 de esta llamada (D1 admite unas mil por invocación). */
  queries: number
}

function progressOf(state: DemoState | null, extra: Partial<DemoProgress> = {}): DemoProgress {
  return {
    status: state?.status ?? 'idle',
    orgId: state?.orgId ?? null,
    stepIndex: state?.stepIndex ?? 0,
    total: null,
    lastStep: state?.lastStep ?? null,
    error: state?.error ?? null,
    attempts: state?.attempts ?? 0,
    startedAt: state?.startedAt ?? null,
    finishedAt: state?.finishedAt ?? null,
    anchorDay: state?.anchorDay ?? null,
    ran: 0,
    busy: false,
    queries: 0,
    ...extra,
  }
}

const isoNow = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

/** El mensaje de un fallo, sin nada que no deba verse (sin pila, recortado). */
function errorText(err: unknown, label: string): string {
  const e = err as { statusMessage?: string; message?: string } | null
  const msg = (e?.statusMessage || e?.message || String(err)).replace(/\s+/g, ' ').slice(0, 400)
  return `${label}: ${msg}`
}

async function existingDemoOrgId(db: any): Promise<number | null> {
  const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, DEMO_ORG_SLUG)).limit(1)
  if (!org) return null
  await assertDemoOrganization(db, org.id)
  return org.id
}

/**
 * Pide crear la demo (si no existe) o restablecerla (`reset`: borra sus datos
 * y la vuelve a sembrar anclada a hoy). No ejecuta nada: lo hace el siguiente
 * `advanceDemoProvisioning`.
 */
export async function requestDemoProvisioning(db: any, opts: { reset: boolean; trigger: 'cron' | 'admin'; nowMs?: number }): Promise<DemoProgress> {
  const nowMs = opts.nowMs ?? Date.now()
  const { state, raw } = await readDemoState(db)
  if (state && (state.status === 'provisioning' || state.status === 'resetting') && state.leaseUntil && state.leaseUntil > nowMs) {
    return progressOf(state, { busy: true })
  }
  if (!opts.reset && state && state.status !== 'failed') return progressOf(state)

  const orgId = state?.orgId ?? (await existingDemoOrgId(db))
  const next: DemoState = { ...emptyDemoState(orgId ? 'resetting' : 'provisioning', opts.trigger), orgId, attempts: opts.reset ? 0 : (state?.attempts ?? 0) }
  const written = await writeDemoState(db, next, raw)
  return progressOf(written ? next : (await readDemoState(db)).state, { busy: !written })
}

export interface AdvanceOptions {
  trigger: 'cron' | 'admin'
  budgetMs?: number
  maxQueries?: number
  /** Pruebas: base de datos y ficheros propios. */
  db?: any
  assets?: DemoAssetSource
  nowMs?: number
}

/** Ejecuta el siguiente tramo del seed. Sin trabajo pendiente, sólo informa. */
export async function advanceDemoProvisioning(env: Record<string, any>, opts: AdvanceOptions): Promise<DemoProgress> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const maxQueries = opts.maxQueries ?? DEFAULT_MAX_QUERIES
  const nowMs = opts.nowMs ?? Date.now()
  const ctx: DemoContext = buildDemoContext({ env, db: opts.db, state: emptyDemoState('provisioning', opts.trigger), assets: opts.assets, budgetMs })

  let { state, raw } = await readDemoState(ctx.db)
  if (!state) return progressOf(null)

  // Reintento automático de un fallo (sólo el cron y con tope): desde cero.
  if (state.status === 'failed' && opts.trigger === 'cron' && state.attempts < MAX_AUTO_RETRIES) {
    state = { ...state, status: state.orgId ? 'resetting' : 'provisioning', stepIndex: 0, ids: {}, media: {}, anchorDay: null, error: null, leaseUntil: null }
  } else if (state.status !== 'provisioning' && state.status !== 'resetting') {
    return progressOf(state)
  }
  if (state.leaseUntil && state.leaseUntil > nowMs) return progressOf(state, { busy: true })

  // Cerrojo.
  state = { ...state, leaseUntil: nowMs + budgetMs + LEASE_GRACE_MS, startedAt: state.stepIndex === 0 ? isoNow(nowMs) : state.startedAt, trigger: opts.trigger }
  raw = await writeDemoState(ctx.db, state, raw)
  if (!raw) return progressOf((await readDemoState(ctx.db)).state, { busy: true })
  ctx.state = state

  const save = async (): Promise<boolean> => {
    const written = await writeDemoState(ctx.db, ctx.state, raw)
    if (written) raw = written
    return Boolean(written)
  }
  const fail = async (err: unknown, label: string): Promise<DemoProgress> => {
    ctx.state.status = 'failed'
    ctx.state.error = errorText(err, label)
    ctx.state.attempts += 1
    ctx.state.leaseUntil = null
    await save()
    return progressOf(ctx.state, { queries: ctx.counter.count })
  }

  // Restablecer: primero se borra lo que había (un tramo para eso solo).
  if (ctx.state.status === 'resetting') {
    try {
      if (ctx.state.orgId) {
        await purgeDemoTenant(ctx.db, env, ctx.state.orgId)
        forgetDemoOrgCache(ctx.state.orgId)
      }
    } catch (err) {
      return fail(err, 'Borrado de la demo')
    }
    Object.assign(ctx.state, { status: 'provisioning', stepIndex: 0, ids: {}, media: {}, anchorDay: null, lastStep: 'Datos anteriores borrados', error: null, leaseUntil: null })
    await save()
    return progressOf(ctx.state, { ran: 0, queries: ctx.counter.count })
  }

  if (!ctx.state.anchorDay) ctx.state.anchorDay = madridToday(new Date(nowMs))
  const events = buildDemoTimeline(ctx.state.anchorDay, nowMs)
  let ran = 0
  while (ctx.state.stepIndex < events.length) {
    if (Date.now() > ctx.deadline || ctx.counter.count >= maxQueries) break
    const event = events[ctx.state.stepIndex]
    try {
      await runEvent(ctx, event)
    } catch (err) {
      return fail(err, event.label)
    }
    ctx.state.stepIndex += 1
    ctx.state.lastStep = event.label
    ran++
    // Si otra llamada cambió el estado (un restablecimiento a mitad), se para aquí.
    if (!(await save())) return progressOf((await readDemoState(ctx.db)).state, { ran, total: events.length, busy: true })
  }

  if (ctx.state.stepIndex >= events.length) {
    Object.assign(ctx.state, { status: 'ready', finishedAt: isoNow(Date.now()), error: null, attempts: 0 })
    if (ctx.state.orgId) forgetDemoOrgCache(ctx.state.orgId)
  }
  ctx.state.leaseUntil = null
  await save()
  return progressOf(ctx.state, { ran, total: events.length, queries: ctx.counter.count })
}

/** Lo que enseña la pantalla del super admin. */
export async function demoProvisioningStatus(db: any, nowMs = Date.now()): Promise<DemoProgress> {
  const { state } = await readDemoState(db)
  if (!state) return progressOf(null)
  const total = state.anchorDay ? buildDemoTimeline(state.anchorDay, nowMs).length : null
  return progressOf(state, { total, busy: Boolean(state.leaseUntil && state.leaseUntil > nowMs) })
}
