import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { addWebThreadNote, markWebThreadRead, replyToWebThread, startWebChat, postWebChatMessage } from '../../utils/comms/web'
import { logManualCall } from '../../utils/comms/calls'
import { upsertContact } from '../../utils/comms/inbox'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { adminResources } from '../../utils/adminResources'
import { atClock, clockNow } from '../../utils/clock'
import { ctxId, type DemoContext } from '../context'
import { actingUser, commercialId, contactId, hasId, leadId, orgId, propertyId, propertyKindOf } from '../helpers'
import { CALLS, CHATS, NOTES, type DemoChat } from '../dataset/comms'
import { CONTACTS } from '../dataset/crm'
import { after, fromMinutes, toMinutes } from '../moments'
import type { TimelineBuilder } from '../timeline'

/**
 * Centro de comunicaciones de la demo, por sus servicios reales: hilos del
 * chat de la web (el visitante escribe, el comercial responde por el chat y
 * deja notas internas), llamadas anotadas a mano con su resultado y notas en
 * las fichas. Ninguno de estos caminos envía nada fuera de la plataforma.
 */

/** Un hilo completo: cada mensaje en su minuto (reloj del escenario). */
async function playChat(ctx: DemoContext, chat: DemoChat) {
  const org = orgId(ctx)
  const agent = actingUser(ctx, chat.commercial)
  const contact = chat.contact ? CONTACTS.find((c) => c.key === chat.contact) : undefined
  const startMs = clockNow().getTime()
  const at = (minutes: number) => startMs + minutes * 60_000
  const [first, ...rest] = chat.messages
  const started = await startWebChat(ctx.db, {
    orgId: org,
    name: chat.visitor.name,
    email: contact?.email ?? chat.visitor.email ?? null,
    phone: contact?.phone ?? chat.visitor.phone ?? null,
    message: first.text,
    propertyId: chat.property && propertyKindOf(chat.property) === 'developer' ? propertyId(ctx, chat.property) : null,
    pageUrl: '/',
  })
  // La persona ya está en el CRM (entró por su lead): el hilo se vincula a ella y a su comercial.
  await ctx.db
    .update(schema.commsWebThreads)
    .set({
      contactId: chat.contact ? contactId(ctx, chat.contact) : null,
      leadId: chat.lead ? leadId(ctx, chat.lead) : null,
      assignedAgentId: commercialId(ctx, chat.commercial),
    })
    .where(eq(schema.commsWebThreads.id, started.threadId))

  for (const m of rest) {
    await atClock(at(m.after), async () => {
      const [thread] = await ctx.db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, started.threadId)).limit(1)
      if (m.from === 'visitor') await postWebChatMessage(ctx.db, org, started.token, m.text)
      else if (m.from === 'note') await addWebThreadNote(ctx.db, thread, agent.id, m.text)
      else await replyToWebThread(ctx.db, ctx.env, { orgId: org, thread, userId: agent.id, via: 'chat', body: m.text, origin: '', emailConnected: false })
    })
  }
  const last = chat.messages[chat.messages.length - 1]
  await atClock(at(last.after + 5), async () => {
    const [thread] = await ctx.db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, started.threadId)).limit(1)
    if (chat.read) await markWebThreadRead(ctx.db, thread)
    if (chat.status !== 'open') await ctx.db.update(schema.commsWebThreads).set({ status: chat.status }).where(eq(schema.commsWebThreads.id, thread.id))
  })
}

/** «+34 600 020 101» → «+34600020101». */
const e164 = (phone: string) => `+${phone.replace(/\D/g, '')}`

export function addCommsEvents(tl: TimelineBuilder): void {
  for (const chat of CHATS) {
    // Nunca antes de que existan la persona y la ficha a las que se refiere.
    const start = fromMinutes(Math.max(toMinutes(chat.days, chat.at), after({ contact: chat.contact, lead: chat.lead, property: chat.property })))
    tl.add(start.days, start.at, `Chat web ${chat.key}`, (ctx) => playChat(ctx, chat))
  }

  for (const call of CALLS) {
    const when = fromMinutes(Math.max(toMinutes(call.days, call.at), after({ contact: call.contact, property: call.property })))
    tl.add(when.days, when.at, `Llamada ${call.key}`, async (ctx) => {
      const c = CONTACTS.find((x) => x.key === call.contact)!
      if (!c.phone) throw new Error(`Demo: la llamada ${call.key} es a un contacto sin teléfono`)
      const agent = actingUser(ctx, call.commercial)
      const commsContact = await upsertContact(ctx.db, orgId(ctx), e164(c.phone), { displayName: c.name })
      await logManualCall(ctx.db, {
        orgId: orgId(ctx),
        contactId: commsContact.id,
        conversationId: null,
        direction: call.direction,
        outcome: call.outcome,
        notes: call.notes,
        durationSeconds: call.seconds ?? null,
        userId: agent.id,
        agentId: commercialId(ctx, call.commercial),
        propertyId: call.property ? propertyId(ctx, call.property) : null,
        propertyKind: call.property ? propertyKindOf(call.property) : null,
      })
    })
  }

  for (const n of NOTES) {
    const refs = n.entity === 'contact' ? { contact: n.ref } : n.entity === 'lead' ? { lead: n.ref } : n.entity === 'property' ? { property: n.ref } : { deal: n.ref }
    const when = fromMinutes(Math.max(toMinutes(n.days, n.at), after(refs)))
    tl.add(when.days, when.at, `Nota ${n.key}`, async (ctx) => {
      const entityId =
        n.entity === 'contact' ? contactId(ctx, n.ref) : n.entity === 'lead' ? leadId(ctx, n.ref) : n.entity === 'property' ? propertyId(ctx, n.ref) : ctxId(ctx, `deal:${n.ref}`)
      if (!hasId(ctx, n.entity === 'deal' ? `deal:${n.ref}` : n.entity === 'property' ? `prop:${n.ref}` : `${n.entity}:${n.ref}`)) throw new Error(`Demo: la nota ${n.key} apunta a algo que no existe`)
      await insertResourceRecord(
        ctx.db,
        'notes',
        adminResources.notes,
        { entityType: n.entity, entityId, propertyKind: n.entity === 'property' ? propertyKindOf(n.ref) : null, body: n.body, isPinned: n.pinned ? 1 : 0 },
        { orgId: orgId(ctx), user: actingUser(ctx, n.author), event: ctx.event },
      )
    })
  }
}
