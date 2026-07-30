import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../utils/db'
import { requireApiKey } from '../../../../../utils/apiAuth'
import { rateLimit } from '../../../../../utils/rateLimit'

/**
 * GET /api/v1/asset-export/qr-codes/:id/analytics — Fase 16 (public API).
 * Real numbers only: totalScans/uniqueVisitors come straight from qr_scans
 * (see server/routes/q/[code].get.ts, the only writer). No geo breakdown —
 * no IP-geolocation provider is wired up, so it isn't fabricated here either.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const qr = (await db.select().from(schema.dynamicQrCodes).where(eq(schema.dynamicQrCodes.id, id)).limit(1))[0]
  if (!qr || qr.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'QR code not found' })

  const scans = await db.select({ ipHash: schema.qrScans.ipHash, scannedAt: schema.qrScans.scannedAt }).from(schema.qrScans).where(eq(schema.qrScans.qrCodeId, id)).limit(5000)
  const uniqueVisitors = new Set(scans.map((s) => s.ipHash).filter(Boolean)).size
  const lastScanAt = scans.reduce<string | null>((max, s) => (!max || s.scannedAt > max ? s.scannedAt : max), null)

  return {
    id: qr.id,
    code: qr.code,
    destinationUrl: qr.destinationUrl,
    active: !!qr.active,
    totalScans: scans.length,
    uniqueVisitors,
    lastScanAt,
  }
})
