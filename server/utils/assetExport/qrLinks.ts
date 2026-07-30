import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../db'
import type { H3Event } from 'h3'

const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz' // no 0/1/l/i/o — avoids visual ambiguity when typed by hand

function randomCode(length = 9): string {
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

/**
 * The QR image printed on any exported piece always encodes one of our own
 * short links (/q/{code}), never the destination URL directly — so the
 * destination can be repointed later without reprinting anything, and every
 * scan gets logged (qr_scans) regardless of what generated the QR.
 *
 * One QR per (org, assetKind, assetId, destinationUrl) is reused across
 * renders of the same asset+destination instead of minting a new code every
 * time a PDF is regenerated.
 */
export async function getOrCreateAssetQrUrl(
  event: H3Event,
  params: { orgId: number; assetKind: string; assetId: number; destinationUrl: string; createdBy?: number },
): Promise<string> {
  const db = useDb(event)
  const existing = await db
    .select()
    .from(schema.dynamicQrCodes)
    .where(eq(schema.dynamicQrCodes.assetId, params.assetId))
    .limit(20)
  const match = existing.find((q) => q.organizationId === params.orgId && q.assetKind === params.assetKind && q.destinationUrl === params.destinationUrl && q.active)

  const origin = getRequestURL(event).origin
  if (match) return `${origin}/q/${match.code}`

  let code = randomCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.select({ id: schema.dynamicQrCodes.id }).from(schema.dynamicQrCodes).where(eq(schema.dynamicQrCodes.code, code)).limit(1)
    if (!clash[0]) break
    code = randomCode()
  }

  const nowTs = now()
  await db.insert(schema.dynamicQrCodes).values({
    organizationId: params.orgId,
    code,
    destinationUrl: params.destinationUrl,
    destinationType: 'property',
    assetKind: params.assetKind,
    assetId: params.assetId,
    createdBy: params.createdBy,
    createdAt: nowTs,
    updatedAt: nowTs,
  })

  return `${origin}/q/${code}`
}
