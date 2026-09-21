import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { findOrCreateConversation, isoToDbTs, upsertContact } from './inbox'
import { metaCallAction } from './providers/metaCloud'
import type { CallEvent, LoadedChannel } from './types'

/**
 * Llamadas: las de WhatsApp Calling (Meta) que llegan y salen por WebRTC
 * desde el navegador, y las registradas a mano (una llamada telefónica
 * normal que el comercial anota con su resultado).
 *
 * El servidor no toca audio: sólo intercambia el SDP entre el navegador del
 * comercial y Meta (POST /<PHONE_NUMBER_ID>/calls y el webhook `calls`) y
 * lleva el estado. No hay grabación ni transcripción: no existe ninguna
 * ruta por la que el audio pase por aquí.
 *
 * Estados: initiated → ringing → accepted → completed | failed | rejected |
 * missed (entrante sin contestar) | cancelled (saliente sin contestar).
 */

export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'wrong_number' | 'callback' | 'not_interested' | 'interested'
export const CALL_OUTCOMES: { key: CallOutcome; label: string }[] = [
  { key: 'answered', label: 'Contestó' },
  { key: 'interested', label: 'Interesado' },
  { key: 'callback', label: 'Pide que le llamen' },
  { key: 'no_answer', label: 'No contesta' },
  { key: 'busy', label: 'Comunica' },
  { key: 'voicemail', label: 'Buzón de voz' },
  { key: 'wrong_number', label: 'Número equivocado' },
  { key: 'not_interested', label: 'No interesado' },
]

export function isCallOutcome(value: unknown): value is CallOutcome {
  return CALL_OUTCOMES.some((o) => o.key === value)
}

type CallRow = typeof schema.commsCalls.$inferSelect

function sessionOf(row: CallRow | null | undefined): Record<string, any> {
  try {
    return row?.sessionJson ? JSON.parse(row.sessionJson) : {}
  } catch {
    return {}
  }
}

async function threadMessage(db: any, call: Pick<CallRow, 'organizationId' | 'conversationId' | 'direction' | 'id'>, body: string): Promise<void> {
  if (!call.conversationId) return
  const nowTs = now()
  await db.insert(schema.commsMessages).values({
    organizationId: call.organizationId,
    conversationId: call.conversationId,
    direction: call.direction === 'inbound' ? 'in' : 'out',
    type: 'call',
    body,
    status: 'received',
    payloadJson: JSON.stringify({ callId: call.id }),
    createdAt: nowTs,
    updatedAt: nowTs,
  })
  await db.update(schema.commsConversations).set({ lastMessageAt: nowTs, lastMessagePreview: `📞 ${body}`.slice(0, 120), updatedAt: nowTs }).where(eq(schema.commsConversations.id, call.conversationId))
}

function durationLabel(seconds: number | null | undefined): string {
  const s = Math.max(0, Number(seconds || 0))
  const m = Math.floor(s / 60)
  return m ? `${m} min ${s % 60} s` : `${s} s`
}

/** Un evento del webhook `calls` de Meta, ya verificado y ya reclamado como no duplicado. */
export async function ingestCallEvent(db: any, channel: LoadedChannel, event: CallEvent): Promise<{ callId: number | null; note: string }> {
  const rows: CallRow[] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.externalId, event.externalId)).limit(1)
  const existing = rows[0] ?? null
  const ts = isoToDbTs(event.timestamp)

  if (event.event === 'connect') {
    if (!existing) {
      // Llamada entrante (USER_INITIATED): trae la oferta SDP del usuario.
      if (!event.from) return { callId: null, note: 'connect sin remitente' }
      const contact = await upsertContact(db, channel.organizationId, event.from, {})
      const conversation = await findOrCreateConversation(db, channel.organizationId, channel.id, contact.id)
      try {
        const [row] = await db
          .insert(schema.commsCalls)
          .values({
            organizationId: channel.organizationId,
            channelId: channel.id,
            contactId: contact.id,
            conversationId: conversation.id,
            direction: 'inbound',
            provider: 'meta_cloud',
            externalId: event.externalId,
            status: 'ringing',
            startedAt: ts,
            sessionJson: JSON.stringify({ offer: event.session }),
            createdAt: ts,
            updatedAt: ts,
          })
          .returning({ id: schema.commsCalls.id })
        return { callId: row.id, note: 'llamada entrante registrada' }
      } catch (e: any) {
        if (isUniqueConstraintError(e)) return { callId: null, note: 'duplicado' }
        throw e
      }
    }
    // Llamada saliente: el usuario aceptó y Meta manda la respuesta SDP.
    const session = sessionOf(existing)
    await db
      .update(schema.commsCalls)
      .set({
        sessionJson: JSON.stringify({ ...session, answer: event.session }),
        status: ['initiated', 'ringing'].includes(existing.status) ? 'accepted' : existing.status,
        answeredAt: existing.answeredAt ?? ts,
        updatedAt: ts,
      })
      .where(eq(schema.commsCalls.id, existing.id))
    return { callId: existing.id, note: 'respuesta SDP recibida' }
  }

  if (!existing) return { callId: null, note: `evento ${event.event} de una llamada desconocida` }

  if (event.event === 'status') {
    const status = String(event.status || '').toUpperCase()
    const patch: Record<string, any> = { updatedAt: ts }
    if (status === 'RINGING' && existing.status === 'initiated') patch.status = 'ringing'
    if (status === 'ACCEPTED') {
      patch.status = 'accepted'
      patch.answeredAt = existing.answeredAt ?? ts
    }
    if (status === 'REJECTED') patch.status = 'rejected'
    await db.update(schema.commsCalls).set(patch).where(eq(schema.commsCalls.id, existing.id))
    if (status === 'REJECTED') await threadMessage(db, existing, 'Llamada rechazada por el contacto')
    return { callId: existing.id, note: `estado ${status}` }
  }

  // terminate
  const answered = Boolean(existing.answeredAt) || ['accepted', 'in_progress'].includes(existing.status)
  const failed = String(event.status || '').toUpperCase() === 'FAILED'
  const finalStatus = failed ? 'failed' : answered ? 'completed' : existing.status === 'rejected' ? 'rejected' : existing.direction === 'inbound' ? 'missed' : 'cancelled'
  await db
    .update(schema.commsCalls)
    .set({
      status: finalStatus,
      startedAt: event.startTime ? isoToDbTs(event.startTime) : existing.startedAt,
      endedAt: event.endTime ? isoToDbTs(event.endTime) : ts,
      durationSeconds: event.durationSeconds ?? existing.durationSeconds,
      sessionJson: null,
      updatedAt: ts,
    })
    .where(eq(schema.commsCalls.id, existing.id))
  const label =
    finalStatus === 'completed'
      ? `${existing.direction === 'inbound' ? 'Llamada entrante' : 'Llamada saliente'} · ${durationLabel(event.durationSeconds ?? existing.durationSeconds)}`
      : finalStatus === 'missed'
        ? 'Llamada perdida'
        : finalStatus === 'cancelled'
          ? 'Llamada sin respuesta'
          : finalStatus === 'failed'
            ? 'Llamada fallida'
            : 'Llamada rechazada'
  if (existing.status !== 'rejected') await threadMessage(db, existing, label)
  return { callId: existing.id, note: finalStatus }
}

export type CallErrorCode = 'calling_unavailable' | 'permission_required' | 'provider' | 'invalid_state'

/** Inicia una llamada saliente: el navegador ya generó su oferta SDP. Requiere permiso del contacto (Meta lo comprueba: error 138006). */
export async function startOutboundCall(
  db: any,
  env: Record<string, any>,
  input: { channel: LoadedChannel; contactId: number; conversationId: number | null; userId: number; sdpOffer: string; propertyId?: number | null; fetchImpl?: typeof fetch },
): Promise<{ ok: boolean; code: CallErrorCode | null; error: string | null; call: CallRow | null }> {
  const { channel } = input
  if (channel.provider !== 'meta_cloud' || channel.callingStatus !== 'enabled') {
    return { ok: false, code: 'calling_unavailable', error: 'Las llamadas por WhatsApp no están activas en este número (Configuración → Comunicaciones → Llamadas).', call: null }
  }
  const contacts = await db
    .select()
    .from(schema.commsContacts)
    .where(and(eq(schema.commsContacts.id, input.contactId), eq(schema.commsContacts.organizationId, channel.organizationId)))
    .limit(1)
  const contact = contacts[0]
  if (!contact) return { ok: false, code: 'invalid_state', error: 'Contacto no encontrado.', call: null }

  const nowTs = now()
  const [pending] = await db
    .insert(schema.commsCalls)
    .values({
      organizationId: channel.organizationId,
      channelId: channel.id,
      contactId: contact.id,
      conversationId: input.conversationId,
      direction: 'outbound',
      provider: 'meta_cloud',
      status: 'initiated',
      userId: input.userId,
      propertyId: input.propertyId ?? null,
      startedAt: nowTs,
      sessionJson: JSON.stringify({ offer: { sdpType: 'offer', sdp: input.sdpOffer } }),
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  const r = await metaCallAction(channel, env, { action: 'connect', toE164: contact.phoneE164, sdp: input.sdpOffer, bizOpaqueCallbackData: String(pending.id) }, input.fetchImpl)
  if (!r.ok || !r.callId) {
    const permission = r.errorCode === '138006'
    await db
      .update(schema.commsCalls)
      .set({ status: 'failed', endedAt: now(), errorMessage: r.error, sessionJson: null, updatedAt: now() })
      .where(eq(schema.commsCalls.id, pending.id))
    return {
      ok: false,
      code: permission ? 'permission_required' : 'provider',
      error: permission ? 'El contacto no ha dado permiso para recibir llamadas. Pídeselo desde la conversación y vuelve a intentarlo cuando acepte.' : r.error,
      call: null,
    }
  }
  const [call] = await db
    .update(schema.commsCalls)
    .set({ externalId: r.callId, updatedAt: now() })
    .where(eq(schema.commsCalls.id, pending.id))
    .returning()
  return { ok: true, code: null, error: null, call }
}

/** pre_accept / accept (con la respuesta SDP del navegador), reject o terminate sobre una llamada viva. */
export async function callAction(
  db: any,
  env: Record<string, any>,
  input: { channel: LoadedChannel; call: CallRow; action: 'pre_accept' | 'accept' | 'reject' | 'terminate'; sdpAnswer?: string | null; fetchImpl?: typeof fetch },
): Promise<{ ok: boolean; error: string | null; call: CallRow | null }> {
  const { channel, call, action } = input
  if (!call.externalId) return { ok: false, error: 'La llamada no tiene id del proveedor.', call: null }
  if (['completed', 'failed', 'rejected', 'missed', 'cancelled'].includes(call.status)) return { ok: false, error: 'La llamada ya terminó.', call: null }
  let r: { ok: boolean; error: string | null }
  if (action === 'pre_accept' || action === 'accept') {
    if (!input.sdpAnswer) return { ok: false, error: 'Falta la respuesta SDP del navegador.', call: null }
    r = await metaCallAction(channel, env, { action, callId: call.externalId, sdp: input.sdpAnswer }, input.fetchImpl)
  } else {
    r = await metaCallAction(channel, env, { action, callId: call.externalId }, input.fetchImpl)
  }
  if (!r.ok) return { ok: false, error: r.error, call: null }
  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  if (action === 'accept') {
    patch.status = 'in_progress'
    patch.answeredAt = call.answeredAt ?? nowTs
  }
  if (action === 'reject') {
    patch.status = 'rejected'
    patch.endedAt = nowTs
    patch.sessionJson = null
  }
  if (action === 'terminate') {
    // El estado final real (duración incluida) lo pone el webhook terminate;
    // aquí sólo se deja de esperar respuesta.
    patch.status = call.answeredAt ? 'completed' : call.direction === 'inbound' ? 'missed' : 'cancelled'
    patch.endedAt = nowTs
    patch.sessionJson = null
  }
  const [updated] = await db.update(schema.commsCalls).set(patch).where(eq(schema.commsCalls.id, call.id)).returning()
  if (action === 'reject') await threadMessage(db, updated, 'Llamada entrante rechazada')
  return { ok: true, error: null, call: updated }
}

/** Una llamada hecha por teléfono normal, anotada a mano con su resultado. */
export async function logManualCall(
  db: any,
  input: {
    orgId: number
    contactId: number
    conversationId: number | null
    direction: 'inbound' | 'outbound'
    outcome: CallOutcome
    notes?: string | null
    durationSeconds?: number | null
    userId: number
    agentId?: number | null
    propertyId?: number | null
    startedAt?: string | null
  },
): Promise<CallRow> {
  const nowTs = now()
  const answered = ['answered', 'interested', 'callback', 'not_interested', 'wrong_number'].includes(input.outcome)
  const [row] = await db
    .insert(schema.commsCalls)
    .values({
      organizationId: input.orgId,
      channelId: null,
      contactId: input.contactId,
      conversationId: input.conversationId,
      direction: input.direction,
      provider: 'manual',
      status: answered ? 'completed' : input.direction === 'inbound' ? 'missed' : 'cancelled',
      outcome: input.outcome,
      notes: input.notes ?? null,
      userId: input.userId,
      agentId: input.agentId ?? null,
      propertyId: input.propertyId ?? null,
      startedAt: input.startedAt ?? nowTs,
      endedAt: nowTs,
      durationSeconds: input.durationSeconds ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()
  const outcomeLabel = CALL_OUTCOMES.find((o) => o.key === input.outcome)?.label || input.outcome
  await threadMessage(db, row, `${input.direction === 'inbound' ? 'Llamada recibida' : 'Llamada realizada'} · ${outcomeLabel}${input.durationSeconds ? ` · ${durationLabel(input.durationSeconds)}` : ''}`)
  return row
}
