import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import { handleInboundEmail, INBOUND_REJECT_REASONS, type InboundEmailMessage } from '../utils/comms/inboundEmail'

/**
 * Email entrante (FASE 29): el manejador `email` del Worker.
 *
 * Con el preset `cloudflare_module`, Nitro exporta un `email(message, env,
 * ctx)` que llama al hook `cloudflare:email` dentro de `ctx.waitUntil`
 * (nitropack/dist/presets/cloudflare/runtime/_module-handler.mjs). Cloudflare
 * Email Routing lo invoca para cada correo que una regla manda «al Worker»
 * (docs/communications.md, «Email entrante»). Esto no es una ruta HTTP: no
 * hay URL que llamar desde fuera, sólo Email Routing entrega aquí.
 *
 * Todo el trabajo está en server/utils/comms/inboundEmail.ts (sin H3, probado
 * en test/unit/inboundEmail.test.ts). Aquí sólo se abre la D1 y se deja una
 * línea de log con el resultado: nunca direcciones, asunto ni contenido.
 *
 * Nota honesta: `setReject()` se llama dentro de ese `waitUntil`. La
 * documentación de Cloudflare no dice si un rechazo hecho ahí, después de que
 * el manejador haya devuelto, llega a la respuesta SMTP. Si no llegara, un
 * correo inválido se descartaría en silencio en vez de rebotar — nunca
 * entraría en un hilo: la verificación no depende de eso.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:email', async ({ message: cfMessage, env }) => {
    // ForwardableEmailMessage de workers-types; su ReadableStream no es el de lib.dom, de ahí el cast.
    const message = cfMessage as unknown as InboundEmailMessage
    const bindings = (env || {}) as Record<string, any>
    if (!bindings.DB) {
      message.setReject(INBOUND_REJECT_REASONS.failed)
      console.error('[email entrante] sin binding DB: correo rechazado')
      return
    }
    try {
      const outcome = await handleInboundEmail(drizzle(bindings.DB as D1Database, { schema }), bindings, message)
      console.log(`[email entrante] ${outcome.status}${'reason' in outcome ? ` (${outcome.reason})` : ''}${'threadId' in outcome ? ` hilo w${outcome.threadId}` : ''}`)
    } catch (e: any) {
      // Inesperado (handleInboundEmail no lanza por un correo malo). Sin el mensaje del error: podría llevar el contenido.
      message.setReject(INBOUND_REJECT_REASONS.failed)
      console.error(`[email entrante] fallo inesperado: ${String(e?.name || 'Error')}`)
    }
  })
})
