import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { ingestCallEvent } from './calls'
import { applyCallPermission, applyMessageStatus, ingestInboundMessage, type IngestContext } from './inbox'
import { eventKeyFor, type LoadedChannel, type ParsedWebhook } from './types'

/**
 * El paso común de los cuatro webhooks: cada evento se **reclama** primero
 * en comms_webhook_events (índice único por proveedor + clave) y sólo
 * después se procesa. Un reenvío del proveedor —Meta y Twilio reintentan
 * todo lo que no responde 2xx, y a veces lo que sí— choca con el índice y
 * se cuenta como duplicado sin tocar nada. Mismo patrón que
 * stripe_webhook_events y resend_webhook_events.
 *
 * Un evento que falla al procesarse queda con processed_ok = 0 y el error
 * en `note`: el webhook responde 200 igualmente (reintentar no lo
 * arreglaría) y el fallo es visible en la tabla, no silencioso.
 */
export interface IngestSummary {
  processed: number
  duplicates: number
  failed: number
  ignored: number
  notes: string[]
}

const PAYLOAD_MAX = 16_000

function trimPayload(raw: unknown): string {
  let json: string
  try {
    json = JSON.stringify(raw)
  } catch {
    json = '{}'
  }
  return json.length > PAYLOAD_MAX ? `${json.slice(0, PAYLOAD_MAX)}…` : json
}

export async function ingestParsedWebhook(db: any, env: Record<string, any>, channel: LoadedChannel, parsed: ParsedWebhook, ctx: IngestContext = {}): Promise<IngestSummary> {
  const summary: IngestSummary = { processed: 0, duplicates: 0, failed: 0, ignored: 0, notes: [] }
  for (const event of parsed.events) {
    const eventKey = eventKeyFor(event)
    let claimedId: number
    try {
      const [row] = await db
        .insert(schema.commsWebhookEvents)
        .values({ provider: channel.provider, eventKey, organizationId: channel.organizationId, channelId: channel.id, payloadJson: trimPayload(event.raw), processedOk: 0, receivedAt: now() })
        .returning({ id: schema.commsWebhookEvents.id })
      claimedId = row.id
    } catch (e: any) {
      if (isUniqueConstraintError(e)) {
        summary.duplicates++
        continue
      }
      throw e
    }

    let note = ''
    try {
      switch (event.kind) {
        case 'message': {
          const r = await ingestInboundMessage(db, env, channel, event, ctx)
          if (r.duplicate) {
            summary.duplicates++
            note = 'mensaje ya existente'
          } else {
            summary.processed++
            note = r.newConversation ? 'nueva conversación' : 'mensaje añadido'
          }
          break
        }
        case 'status': {
          const r = await applyMessageStatus(db, event)
          if (r.updated) summary.processed++
          else summary.ignored++
          note = r.updated ? `estado ${event.status}` : 'mensaje desconocido o estado anterior'
          break
        }
        case 'call_permission': {
          await applyCallPermission(db, channel, event)
          summary.processed++
          note = `permiso ${event.response}`
          break
        }
        case 'call': {
          const r = await ingestCallEvent(db, channel, event)
          if (r.callId) summary.processed++
          else summary.ignored++
          note = r.note
          break
        }
      }
      await db.update(schema.commsWebhookEvents).set({ processedOk: 1, note }).where(eq(schema.commsWebhookEvents.id, claimedId))
    } catch (e: any) {
      summary.failed++
      const message = String(e?.message || e).slice(0, 500)
      summary.notes.push(`${eventKey}: ${message}`)
      try {
        await db.update(schema.commsWebhookEvents).set({ processedOk: 0, note: `error: ${message}` }).where(eq(schema.commsWebhookEvents.id, claimedId))
      } catch {
        // Si ni siquiera se puede anotar el fallo, el resumen lo lleva igualmente.
      }
    }
  }
  return summary
}
