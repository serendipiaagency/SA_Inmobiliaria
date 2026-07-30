import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'

/**
 * Public short-link redirect for dynamic QR codes. Deliberately has no
 * organization scoping on the lookup — the code itself is the only
 * credential a scanner has, same as any short-link service — but every
 * field written to qr_scans is scoped to the QR's own organization_id, so
 * analytics can never mix data across tenants.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDb(event)
  const qr = (await db.select().from(schema.dynamicQrCodes).where(eq(schema.dynamicQrCodes.code, code)).limit(1))[0]
  if (!qr || !qr.active) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (qr.expiresAt && qr.expiresAt < now()) throw createError({ statusCode: 410, statusMessage: 'This link has expired' })

  const nowTs = now()
  try {
    await db.insert(schema.qrScans).values({
      qrCodeId: qr.id,
      organizationId: qr.organizationId,
      scannedAt: nowTs,
      userAgent: getRequestHeader(event, 'user-agent') || null,
      referer: getRequestHeader(event, 'referer') || null,
      ipHash: await hashIp(getRequestHeader(event, 'cf-connecting-ip') || getRequestIP(event) || ''),
    })
    await db
      .update(schema.dynamicQrCodes)
      .set({ scanCount: qr.scanCount + 1 })
      .where(and(eq(schema.dynamicQrCodes.id, qr.id)))
  } catch {
    // A logging failure must never block the redirect itself.
  }

  return sendRedirect(event, qr.destinationUrl, 302)
})

async function hashIp(ip: string): Promise<string | null> {
  if (!ip) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
