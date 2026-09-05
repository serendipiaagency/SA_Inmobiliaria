import { and, eq } from 'drizzle-orm'
import { useDb, schema, cfEnv, now } from '../../../../utils/db'
import { rateLimit } from '../../../../utils/rateLimit'
import { dispatchWebhook } from '../../../../utils/webhooks'
import { renderContractPdf } from '../../../../utils/contracts/pdfRenderer'
import { buildStructuredKey } from '../../../../utils/media'
import { registerGeneratedFile } from '../../../../utils/mediaAssets'
import { assertQuotaAvailable } from '../../../../utils/mediaQuota'
import { sendInternalNotification } from '../../../../utils/email/send'
import { getRequestId } from '../../../../utils/requestId'

interface Body {
  fullName?: string
  confirm?: boolean
}

/** Simple e-signature: typed name + explicit checkbox + captured IP/user-agent/timestamp. NOT a qualified/eIDAS signature. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'contract-accept', { limit: 10, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const body = await readBody<Body>(event)
  if (!body?.fullName?.trim()) throw createError({ statusCode: 422, statusMessage: 'Indica tu nombre completo' })
  if (!body.confirm) throw createError({ statusCode: 422, statusMessage: 'Debes confirmar la aceptación' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.managementToken, token)).limit(1))[0]
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato no encontrado' })
  if (contract.status === 'accepted') throw createError({ statusCode: 409, statusMessage: 'Este contrato ya fue aceptado' })
  if (contract.status !== 'sent') throw createError({ statusCode: 409, statusMessage: 'Este contrato no está disponible para aceptación' })

  const ip = getRequestHeader(event, 'cf-connecting-ip') || getRequestHeader(event, 'x-forwarded-for') || 'unknown'
  const userAgent = getRequestHeader(event, 'user-agent') || 'unknown'
  const acceptedAt = now()

  const pdfBytes = await renderContractPdf({
    title: contract.title,
    bodyText: contract.bodyText,
    clientName: contract.clientName,
    acceptance: { byName: body.fullName.trim(), ip, userAgent, at: acceptedAt },
  })

  // A signed contract carries a name, an IP address and a signature
  // timestamp — confidential from the moment it exists, same as a KYC
  // document, and counted against the tenant's storage quota like any other
  // real file.
  await assertQuotaAvailable(db, contract.organizationId, pdfBytes.byteLength)
  const r2Key = buildStructuredKey(contract.organizationId, 'contract', 'pdf')
  await cfEnv(event).MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })
  await registerGeneratedFile(db, {
    organizationId: contract.organizationId,
    r2Key,
    bytes: pdfBytes,
    mimeType: 'application/pdf',
    extension: 'pdf',
    visibility: 'confidential',
    category: 'contract',
    entityType: 'contracts',
    entityId: contract.id,
  })

  // Conditional on status still being 'sent' — the initial check above is
  // only a fast-path for the common case; two concurrent submissions (a
  // double-click, the accept form has no client-side dedup either) can
  // both pass it before either writes. This UPDATE is the real guard: only
  // one can flip status away from 'sent', so only one goes on to dispatch
  // the webhook and notification below — the loser gets a clean 409
  // instead of a second 'contract.accepted' fan-out for the same contract.
  const [updated] = await db
    .update(schema.contracts)
    .set({
      status: 'accepted',
      acceptedByName: body.fullName.trim(),
      acceptedIp: ip,
      acceptedUserAgent: userAgent,
      acceptedAt,
      r2Key,
      updatedAt: acceptedAt,
    })
    .where(and(eq(schema.contracts.id, contract.id), eq(schema.contracts.status, 'sent')))
    .returning({ id: schema.contracts.id })
  if (!updated) throw createError({ statusCode: 409, statusMessage: 'Este contrato ya fue aceptado' })

  await dispatchWebhook(event, contract.organizationId, 'contract.accepted', { id: contract.id, title: contract.title, clientName: contract.clientName, acceptedAt })

  try {
    await sendInternalNotification(db, cfEnv(event), contract.organizationId, 'contract_accepted', { title: contract.title, clientName: contract.clientName, acceptedAt }, getRequestId(event))
  } catch {
    // The acceptance is already saved — a notification failure must never undo that.
  }

  return { ok: true }
})
