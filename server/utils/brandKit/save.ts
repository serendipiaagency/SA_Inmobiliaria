import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'

/**
 * Guarda el Brand Kit de una empresa (uno por empresa) y deja su versión en
 * el historial. Lo usan el panel (PUT /api/admin/asset-export/brand-kit) y el
 * seed de la cuenta demo, por el mismo camino.
 */
const EDITABLE_FIELDS = [
  'logo',
  'logoAlt',
  'logoLight',
  'logoDark',
  'isotype',
  'favicon',
  'colorPrimary',
  'colorSecondary',
  'colorBackground',
  'colorText',
  'fontHeading',
  'fontBody',
  'fontAlt',
  'buttonStyle',
  'iconStyle',
  'cardStyle',
  'phone',
  'whatsapp',
  'email',
  'website',
  'legalText',
] as const

export interface BrandKitBody {
  colorAccents?: string[]
  socialLinks?: Record<string, string>
  [key: string]: unknown
}

export async function saveBrandKit(db: any, orgId: number, userId: number, body: BrandKitBody): Promise<{ brandKit: any; created: boolean }> {
  const nowTs = now()
  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field] == null ? null : String(body[field]).slice(0, 2000)
  }
  if (Array.isArray(body.colorAccents)) {
    patch.colorAccentsJson = JSON.stringify(body.colorAccents.slice(0, 12).map((c) => String(c).slice(0, 20)))
  }
  if (body.socialLinks && typeof body.socialLinks === 'object') {
    patch.socialLinksJson = JSON.stringify(body.socialLinks)
  }

  const existing = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId)).limit(1)
  let brandKitId: number
  if (existing[0]) {
    brandKitId = existing[0].id
    await db
      .update(schema.brandKits)
      .set({ ...patch, updatedBy: userId, updatedAt: nowTs })
      .where(eq(schema.brandKits.id, brandKitId))
  } else {
    const inserted = await db
      .insert(schema.brandKits)
      .values({ organizationId: orgId, ...patch, updatedBy: userId, createdAt: nowTs, updatedAt: nowTs })
      .returning({ id: schema.brandKits.id })
    brandKitId = inserted[0].id
  }

  const full = (await db.select().from(schema.brandKits).where(eq(schema.brandKits.id, brandKitId)).limit(1))[0]
  await db.insert(schema.brandKitVersions).values({
    brandKitId,
    snapshotJson: JSON.stringify(full),
    editedBy: userId,
    createdAt: nowTs,
  })
  return { brandKit: full, created: !existing[0] }
}
