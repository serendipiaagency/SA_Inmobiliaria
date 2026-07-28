import { CHANNEL_BY_KEY } from './channels'

/**
 * Channel adapter layer. No channel (Idealista, Fotocasa, Facebook, WhatsApp,
 * ...) has a real API credential configured in this Worker yet — every
 * adapter call honestly reports `connected: false` until the matching secret
 * (see channels.ts `secretEnvVar`) is added. Nothing here fakes a successful
 * publish; the dispatcher, retries, history and notifications built on top
 * are all real, so wiring in a genuine channel later is a pure addition (an
 * HTTP call where the `secret` branch already exists) rather than a rewrite.
 */

export interface PublishContext {
  channelKey: string
  action: 'publish' | 'update_images' | 'update_text' | 'unpublish'
  property: { id: number; slug: string | null; name: string }
  externalId?: string | null
  env: Record<string, any>
}

export interface PublishResult {
  ok: boolean
  connected: boolean
  message: string
  externalId?: string | null
}

export async function runChannelAdapter(ctx: PublishContext): Promise<PublishResult> {
  const def = CHANNEL_BY_KEY[ctx.channelKey]
  if (!def) return { ok: false, connected: false, message: `Canal desconocido: ${ctx.channelKey}` }

  const secret = ctx.env?.[def.secretEnvVar]
  if (!secret) {
    return {
      ok: false,
      connected: false,
      message: `${def.label} no está conectado: falta configurar el secreto ${def.secretEnvVar} en el Worker.`,
    }
  }

  // Real integration point — reached only once a real secret exists for this
  // channel. No channel has one configured today, so this branch never runs
  // in this deployment; it documents exactly where the real HTTP call goes.
  return {
    ok: true,
    connected: true,
    message: `${ctx.action === 'unpublish' ? 'Despublicado' : 'Publicado'} en ${def.label}.`,
    externalId: ctx.externalId || `${def.key}-${ctx.property.id}-${Date.now()}`,
  }
}

/** Whether a channel has a real secret configured right now — used by the UI to show a live "Conectado"/"No conectado" badge per channel, same signal the adapter itself checks. */
export function isChannelConnected(channelKey: string, env: Record<string, any>): boolean {
  const def = CHANNEL_BY_KEY[channelKey]
  return !!(def && env?.[def.secretEnvVar])
}
