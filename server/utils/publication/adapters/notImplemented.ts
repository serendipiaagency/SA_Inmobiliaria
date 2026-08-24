import type { ChannelAdapter, PublishResult } from './types'

/**
 * The honest default every channel in the registry uses today. It never
 * makes a network call and never returns `ok: true` — there's nothing here
 * to "succeed" at. This exists so the rest of the publication system (state
 * machine, dispatcher, UI) has a real object to call that behaves exactly
 * like a real-but-unbuilt integration should, instead of every channel
 * needing its own copy of "return not implemented".
 */
function notImplementedResult(label: string): PublishResult {
  return {
    state: 'not_implemented',
    ok: false,
    retryable: false,
    message: `${label} no tiene una integración real implementada todavía. El canal está preparado en la arquitectura pero bloqueado hasta que exista documentación oficial y acceso válido a su API.`,
  }
}

export function createNotImplementedAdapter(label: string): ChannelAdapter {
  return {
    async validateCredentials() {
      return { ok: false, message: `${label} no tiene una integración real todavía.` }
    },
    async publish() {
      return notImplementedResult(label)
    },
    async updateText() {
      return notImplementedResult(label)
    },
    async updateImages() {
      return notImplementedResult(label)
    },
    async unpublish() {
      return notImplementedResult(label)
    },
    async getStatus() {
      return notImplementedResult(label)
    },
  }
}
