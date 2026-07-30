import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

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

interface BrandKitBody {
  colorAccents?: string[]
  socialLinks?: Record<string, string>
  [key: string]: unknown
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<BrandKitBody>(event)
  const db = useDb(event)
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
      .set({ ...patch, updatedBy: user.id, updatedAt: nowTs })
      .where(eq(schema.brandKits.id, brandKitId))
  } else {
    const inserted = await db
      .insert(schema.brandKits)
      .values({ organizationId: orgId, ...patch, updatedBy: user.id, createdAt: nowTs, updatedAt: nowTs })
      .returning({ id: schema.brandKits.id })
    brandKitId = inserted[0].id
  }

  const full = (await db.select().from(schema.brandKits).where(eq(schema.brandKits.id, brandKitId)).limit(1))[0]
  await db.insert(schema.brandKitVersions).values({
    brandKitId,
    snapshotJson: JSON.stringify(full),
    editedBy: user.id,
    createdAt: nowTs,
  })

  await logAdminAction(event, { user, orgId, action: existing[0] ? 'update' : 'create', resource: 'brand-kit', resourceId: brandKitId })

  return full
})
