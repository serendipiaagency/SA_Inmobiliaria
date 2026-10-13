import { buildDemoContext, madridToday, type DemoAssetSource, type DemoContext } from './context'
import { DEMO_ACTIVE_STATUSES, emptyDemoState, readDemoState, writeDemoState, type DemoState, type DemoStatus } from './state'
import { assertDemoOrganization, purgeDemoTenant, DEMO_ORG_SLUG } from './purge'
import { deleteDemoSnapshot, deleteMediaKeys, exportDemoSnapshot, hasDemoSnapshot, readDemoSnapshot, restoreDemoSnapshotStep, visitorMediaKeys } from './snapshot'
import { forgetDemoOrgCache } from '../utils/demo/tenant'
import { runEvent, type DemoEvent } from './timeline'
import { buildDemoTimeline } from './scenario'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

/**
 * El ejecutor del seed de la cuenta demo, por tramos.
 *
 * La historia completa son unos cientos de eventos y miles de consultas: no
 * cabe en una invocación de un Worker (D1 admite unas mil consultas por
 * invocación y el cron comparte invocación con otras tareas). Así que cada
 * llamada —el cron de cada minuto o el botón del super admin— ejecuta lo que
 * cabe en su presupuesto de tiempo y de consultas, guarda por dónde va y lo
 * deja para la siguiente.
 *
 * Tres maneras de dejar la demo como manda el código:
 *
 *  - Generar (`provisioning`): desde cero, la historia entera anclada a hoy.
 *    Al terminar se guarda una instantánea del estado sembrado (snapshot.ts).
 *  - Restablecer (`restoring` → `updating` → `snapshotting`): NO destructivo.
 *    Borra las filas actuales de la demo (lo que hayan dejado los visitantes),
 *    vuelve a insertar las de la instantánea —mismos ids y mismas imágenes,
 *    que no se tocan—, ejecuta sólo los eventos que el código añadió desde la
 *    instantánea y guarda una instantánea nueva. Los ficheros subidos por
 *    visitantes se borran; los sembrados, no.
 *  - Regenerar (`resetting` → `provisioning`): destructivo y explícito. Borra
 *    todo (también los ficheros) y vuelve a sembrar anclada a hoy. Es lo que
 *    hace falta para re-anclar la historia, y la única salida de una demo
 *    sembrada antes de que existieran las instantáneas.
 *
 * Seguridad:
 *  - Sólo una invocación a la vez (cerrojo con caducidad en el propio estado,
 *    escrito con compare-and-swap).
 *  - Borrar afecta únicamente a la empresa demo: `purgeDemoTenant` vuelve a
 *    comprobar slug, origen «demo» y que no es la empresa 1.
 *  - Si un evento falla, se para con el error visible. El cron reintenta desde
 *    cero sólo una generación (nunca convierte un restablecimiento fallido en
 *    un borrado), como mucho MAX_AUTO_RETRIES veces.
 */

const DEFAULT_BUDGET_MS = 20_000
/** Margen sobre el límite de consultas por invocación (los eventos más pesados rondan las 120). */
const DEFAULT_MAX_QUERIES = 450
const MAX_AUTO_RETRIES = 3
const LEASE_GRACE_MS = 60_000

export type DemoRequestMode = 'create' | 'restore' | 'regenerate'

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
  /** Cuándo se guardó la instantánea del estado sembrado (null = no hay). */
  snapshotAt: string | null
  /** Eventos que el código ha añadido desde la instantánea y que «Restablecer» ejecutará. */
  pendingSteps: number
  /** Sembrada antes de las instantáneas: el primer restablecimiento tiene que regenerarla entera. */
  legacy: boolean
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
    snapshotAt: state?.snapshotAt ?? null,
    pendingSteps: 0,
    legacy: isLegacyState(state),
    ...extra,
  }
}

/** Una demo lista sin claves de eventos: sembrada por una versión anterior, sin instantánea posible. */
export function isLegacyState(state: DemoState | null): boolean {
  return Boolean(state && state.status === 'ready' && !Object.keys(state.done || {}).length)
}

/** Los eventos de la línea de tiempo que todavía no se han ejecutado en esta demo. */
export function pendingEvents(events: DemoEvent[], done: Record<string, 1>): DemoEvent[] {
  return events.filter((e) => !done[e.key])
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

export interface RequestOptions {
  /** `create` (si no existe), `restore` (no destructivo, desde la instantánea) o `regenerate` (borrar y sembrar de cero). */
  mode?: DemoRequestMode
  /** Compatibilidad: `reset: true` equivale a `regenerate`. */
  reset?: boolean
  trigger: 'cron' | 'admin'
  nowMs?: number
}

/**
 * Pide crear la demo (si no existe), restablecerla desde su instantánea o
 * regenerarla de cero. No ejecuta nada: lo hace el siguiente
 * `advanceDemoProvisioning`. Un `restore` sin instantánea (o de una demo
 * sembrada antes de que existieran) se convierte en `regenerate`: el
 * resultado lo dice en `status` ('resetting' en vez de 'restoring').
 */
export async function requestDemoProvisioning(db: any, opts: RequestOptions, env?: Record<string, any> | null): Promise<DemoProgress> {
  const nowMs = opts.nowMs ?? Date.now()
  let mode: DemoRequestMode = opts.mode ?? (opts.reset ? 'regenerate' : 'create')
  const { state, raw } = await readDemoState(db)
  if (state && DEMO_ACTIVE_STATUSES.includes(state.status) && state.leaseUntil && state.leaseUntil > nowMs) {
    return progressOf(state, { busy: true })
  }
  if (mode === 'create' && state && state.status !== 'failed') return progressOf(state)

  const orgId = state?.orgId ?? (await existingDemoOrgId(db))
  if (mode === 'restore') {
    if (!orgId || !state || isLegacyState(state) || !(await hasDemoSnapshot(env))) mode = 'regenerate'
  }
  let next: DemoState
  if (mode === 'restore') {
    next = { ...state!, status: 'restoring', restore: null, updateIndex: 0, attempts: 0, error: null, failedPhase: null, leaseUntil: null, startedAt: null, trigger: opts.trigger }
  } else {
    next = { ...emptyDemoState(orgId ? 'resetting' : 'provisioning', opts.trigger), orgId, attempts: mode === 'regenerate' ? 0 : (state?.attempts ?? 0) }
  }
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

/** Ejecuta el siguiente tramo (generación, restauración, actualización o instantánea). Sin trabajo pendiente, sólo informa. */
export async function advanceDemoProvisioning(env: Record<string, any>, opts: AdvanceOptions): Promise<DemoProgress> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const maxQueries = opts.maxQueries ?? DEFAULT_MAX_QUERIES
  const nowMs = opts.nowMs ?? Date.now()
  const ctx: DemoContext = buildDemoContext({ env, db: opts.db, state: emptyDemoState('provisioning', opts.trigger), assets: opts.assets, budgetMs })

  let { state, raw } = await readDemoState(ctx.db)
  if (!state) return progressOf(null)

  // Reintento automático de un fallo (sólo el cron, con tope y sólo de una
  // generación: un restablecimiento fallido espera al super admin).
  const retriable = !state.failedPhase || state.failedPhase === 'provisioning' || state.failedPhase === 'resetting'
  if (state.status === 'failed' && opts.trigger === 'cron' && retriable && state.attempts < MAX_AUTO_RETRIES) {
    state = { ...state, status: state.orgId ? 'resetting' : 'provisioning', stepIndex: 0, ids: {}, media: {}, done: {}, anchorDay: null, error: null, leaseUntil: null, restore: null, updateIndex: 0 }
  } else if (!DEMO_ACTIVE_STATUSES.includes(state.status)) {
    return progressOf(state)
  }
  if (state.leaseUntil && state.leaseUntil > nowMs) return progressOf(state, { busy: true })

  // Cerrojo.
  state = { ...state, leaseUntil: nowMs + budgetMs + LEASE_GRACE_MS, startedAt: state.startedAt ?? isoNow(nowMs), trigger: opts.trigger }
  raw = await writeDemoState(ctx.db, state, raw)
  if (!raw) return progressOf((await readDemoState(ctx.db)).state, { busy: true })
  ctx.state = state

  const save = async (): Promise<boolean> => {
    const written = await writeDemoState(ctx.db, ctx.state, raw)
    if (written) raw = written
    return Boolean(written)
  }
  const fail = async (err: unknown, label: string): Promise<DemoProgress> => {
    ctx.state.failedPhase = ctx.state.status === 'failed' ? ctx.state.failedPhase : ctx.state.status
    ctx.state.status = 'failed'
    ctx.state.error = errorText(err, label)
    ctx.state.attempts += 1
    ctx.state.leaseUntil = null
    await save()
    return progressOf(ctx.state, { queries: ctx.counter.count })
  }
  const release = async (extra: Partial<DemoProgress> = {}): Promise<DemoProgress> => {
    ctx.state.leaseUntil = null
    await save()
    return progressOf(ctx.state, { queries: ctx.counter.count, ...extra })
  }

  // Regenerar: primero se borra lo que había, ficheros incluidos (un tramo para eso solo).
  if (ctx.state.status === 'resetting') {
    try {
      if (ctx.state.orgId) {
        await purgeDemoTenant(ctx.db, env, ctx.state.orgId)
        await deleteDemoSnapshot(env)
        forgetDemoOrgCache(ctx.state.orgId)
      }
    } catch (err) {
      return fail(err, 'Borrado de la demo')
    }
    Object.assign(ctx.state, { status: 'provisioning', stepIndex: 0, ids: {}, media: {}, done: {}, anchorDay: null, snapshotAt: null, lastStep: 'Datos anteriores borrados', error: null })
    return release({ ran: 0 })
  }

  // Restablecer: volver a la instantánea sembrada, por tramos.
  if (ctx.state.status === 'restoring') {
    const orgId = ctx.state.orgId
    if (!orgId) return fail(new Error('No hay empresa demo que restablecer'), 'Restablecimiento')
    try {
      const snapshot = await readDemoSnapshot(env)
      if (!snapshot || snapshot.orgId !== orgId) throw new Error('No hay instantánea de esta demo: regenérala desde cero')
      if (!ctx.state.restore) {
        // Primer tramo: fuera lo que dejaron los visitantes (filas y ficheros que no están en la instantánea).
        const extra = await visitorMediaKeys(ctx.db, orgId, snapshot)
        await deleteMediaKeys(env, extra)
        await purgeDemoTenant(ctx.db, null, orgId)
        ctx.state.restore = { table: 0, offset: 0 }
        ctx.state.lastStep = extra.length ? `Datos de visitantes retirados (${extra.length} ficheros)` : 'Datos de visitantes retirados'
        return release({ ran: 0 })
      }
      const step = await restoreDemoSnapshotStep(ctx, snapshot, ctx.state.restore, { maxStatements: maxQueries - ctx.counter.count, deadline: ctx.deadline })
      ctx.state.restore = step.progress
      if (step.label) ctx.state.lastStep = step.label
      if (!step.done) return release({ ran: 0 })
      // Todo insertado: el estado vuelve a ser el de la instantánea y quedan por ejecutar los eventos nuevos del código.
      Object.assign(ctx.state, {
        status: 'updating',
        restore: null,
        updateIndex: 0,
        anchorDay: snapshot.state.anchorDay,
        ids: snapshot.state.ids,
        media: snapshot.state.media,
        done: snapshot.state.done || {},
        finishedAt: snapshot.state.finishedAt,
        lastStep: 'Instantánea restaurada',
      })
      forgetDemoOrgCache(orgId)
      return release({ ran: 0 })
    } catch (err) {
      return fail(err, 'Restablecimiento')
    }
  }

  // Instantánea del estado sembrado (un tramo para ella sola).
  if (ctx.state.status === 'snapshotting') {
    try {
      const result = await exportDemoSnapshot(ctx, ctx.state.orgId!)
      Object.assign(ctx.state, { status: 'ready', snapshotAt: isoNow(Date.now()), error: null, attempts: 0, failedPhase: null, lastStep: `Instantánea guardada (${result.rows} filas)` })
      if (ctx.state.orgId) forgetDemoOrgCache(ctx.state.orgId)
    } catch (err) {
      return fail(err, 'Instantánea de la demo')
    }
    return release({ ran: 0, total: ctx.state.anchorDay ? buildDemoTimeline(ctx.state.anchorDay, nowMs).length : null })
  }

  // Generar (todos los eventos, por índice) o actualizar (sólo los pendientes, por clave).
  if (!ctx.state.anchorDay) ctx.state.anchorDay = madridToday(new Date(nowMs))
  const events = buildDemoTimeline(ctx.state.anchorDay, nowMs)
  const updating = ctx.state.status === 'updating'
  const queue = updating ? pendingEvents(events, ctx.state.done) : events
  const indexKey = updating ? 'updateIndex' : 'stepIndex'
  let ran = 0
  while (ctx.state[indexKey] < queue.length) {
    if (Date.now() > ctx.deadline || ctx.counter.count >= maxQueries) break
    const event = queue[ctx.state[indexKey]]
    try {
      await runEvent(ctx, event)
    } catch (err) {
      return fail(err, event.label)
    }
    ctx.state.done[event.key] = 1
    ctx.state[indexKey] += 1
    ctx.state.lastStep = event.label
    ran++
    // Si otra llamada cambió el estado (un restablecimiento a mitad), se para aquí.
    if (!(await save())) return progressOf((await readDemoState(ctx.db)).state, { ran, total: queue.length, busy: true })
  }

  if (ctx.state[indexKey] >= queue.length) {
    // Sembrada (o actualizada): la instantánea va en el tramo siguiente.
    Object.assign(ctx.state, { status: 'snapshotting', finishedAt: isoNow(Date.now()), error: null, attempts: 0, failedPhase: null })
    if (ctx.state.orgId) forgetDemoOrgCache(ctx.state.orgId)
  }
  return release({ ran, total: queue.length })
}

/** Lo que enseña la pantalla del super admin. */
export async function demoProvisioningStatus(db: any, nowMs = Date.now(), env?: Record<string, any> | null): Promise<DemoProgress> {
  const { state } = await readDemoState(db)
  if (!state) return progressOf(null)
  const events = state.anchorDay ? buildDemoTimeline(state.anchorDay, nowMs) : null
  const total = events ? (state.status === 'updating' ? pendingEvents(events, state.done).length : events.length) : null
  const pendingSteps = events && state.status === 'ready' && !isLegacyState(state) ? pendingEvents(events, state.done).length : 0
  const snapshotAt = state.snapshotAt && env !== undefined ? ((await hasDemoSnapshot(env)) ? state.snapshotAt : null) : state.snapshotAt
  return progressOf(state, { total, pendingSteps, snapshotAt, busy: Boolean(state.leaseUntil && state.leaseUntil > nowMs) })
}
