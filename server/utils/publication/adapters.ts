import { CHANNEL_BY_KEY, isChannelImplemented } from './channels'
import { getChannelAdapter } from './adapters/registry'
import { getChannelCredential } from './credentials'
import type { PublishContext, PublishResult } from './adapters/types'

/**
 * The orchestration layer between the dispatcher and a channel's own
 * adapter (adapters/registry.ts). This is the one place that decides
 * `not_configured` vs `not_implemented` vs actually calling the adapter —
 * every channel goes through the same gates in the same order, so a real
 * integration can never accidentally skip one just by having a secret set.
 *
 * No channel (Idealista, Fotocasa, Facebook, WhatsApp, ...) has a real
 * adapter wired in yet — see docs/publication-channels.md. Every call to
 * this function for those channels returns `not_implemented` regardless of
 * whether a secret exists, because `isChannelImplemented()` gates first.
 * Wiring a real channel later is: write adapters/<channel>.ts, register it
 * in adapters/registry.ts, flip `implemented: true` in channels.ts — this
 * function itself never needs to change.
 */

const DEFAULT_TIMEOUT_MS = 120_000

export interface RunAdapterInput {
  channelKey: string
  action: 'publish' | 'update_images' | 'update_text' | 'unpublish'
  property: { id: number; slug: string | null; name: string }
  externalId?: string | null
  /** Stable per-attempt key so a real adapter's retried call is idempotent — see PublishContext. */
  idempotencyKey: string
  env: Record<string, any>
  /** Optional: only needed to resolve a per-organization credential (credentials.ts) instead of the Worker-wide secret. */
  db?: any
  organizationId?: number
  /** Caps how long a real adapter call may run — defaults to 2 minutes; the dispatcher passes the job's own `maxDurationSeconds`. */
  timeoutMs?: number
}

function timeoutResult(label: string, timeoutMs: number): PublishResult {
  return {
    state: 'failed',
    ok: false,
    retryable: true,
    message: `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s) al contactar ${label}.`,
  }
}

export async function runChannelAdapter(input: RunAdapterInput): Promise<PublishResult> {
  const def = CHANNEL_BY_KEY[input.channelKey]
  if (!def) return { state: 'not_implemented', ok: false, retryable: false, message: `Canal desconocido: ${input.channelKey}` }

  if (!isChannelImplemented(input.channelKey)) {
    return {
      state: 'not_implemented',
      ok: false,
      retryable: false,
      message: `${def.label} no tiene una integración real implementada todavía. El canal está bloqueado de forma honesta hasta que exista una.`,
    }
  }

  let credential: string | null = null
  if (input.db && input.organizationId) {
    try {
      credential = await getChannelCredential(input.db, input.env, { organizationId: input.organizationId, channelKey: input.channelKey })
    } catch {
      credential = null // no encryption key configured, or no per-org row — fall back to the Worker-wide secret below
    }
  }
  const secret = credential || input.env?.[def.secretEnvVar]
  if (!secret) {
    return {
      state: 'not_configured',
      ok: false,
      retryable: false,
      message: `${def.label} no está conectado: falta configurar el secreto ${def.secretEnvVar} (o una credencial propia de la organización).`,
    }
  }

  const adapter = getChannelAdapter(input.channelKey)
  if (!adapter) return { state: 'not_implemented', ok: false, retryable: false, message: `Canal sin adaptador registrado: ${input.channelKey}` }

  const validation = await adapter.validateCredentials(input.env, credential)
  if (!validation.ok) return { state: 'not_configured', ok: false, retryable: false, message: validation.message }

  const ctx: PublishContext = {
    channelKey: input.channelKey,
    action: input.action,
    property: input.property,
    externalId: input.externalId,
    idempotencyKey: input.idempotencyKey,
    env: input.env,
    credential,
  }
  const methodByAction: Record<RunAdapterInput['action'], (ctx: PublishContext) => Promise<PublishResult>> = {
    publish: adapter.publish,
    update_images: adapter.updateImages,
    update_text: adapter.updateText,
    unpublish: adapter.unpublish,
  }
  const method = methodByAction[input.action]
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return Promise.race([
    method.call(adapter, ctx),
    new Promise<PublishResult>((resolve) => setTimeout(() => resolve(timeoutResult(def.label, timeoutMs)), timeoutMs)),
  ])
}

/** Whether a channel has a real secret configured right now — used by the UI to show a live "Conectado"/"No conectado" badge per channel. Independent of `isChannelImplemented`: a channel can be connected and still not implemented. */
export function isChannelConnected(channelKey: string, env: Record<string, any>): boolean {
  const def = CHANNEL_BY_KEY[channelKey]
  return !!(def && env?.[def.secretEnvVar])
}
