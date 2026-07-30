import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../../utils/db'
import { logAdminAction } from '../../../../../../utils/audit'

// Columns copied from a version's snapshot back onto the live row — deliberately
// excludes id/organizationId/createdAt so restoring an old version can never
// re-point the kit at a different org or forge its creation date.
const RESTORABLE_FIELDS = [
  'logo',
  'logoAlt',
  'logoLight',
  'logoDark',
  'isotype',
  'favicon',
  'colorPrimary',
  'colorSecondary',
  'colorAccentsJson',
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
  'socialLinksJson',
  'legalText',
] as const

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const versionId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(versionId)) throw createError({ statusCode: 400, statusMessage: 'Invalid version id' })

  const db = useDb(event)
  const version = (await db.select().from(schema.brandKitVersions).where(eq(schema.brandKitVersions.id, versionId)).limit(1))[0]
  if (!version) throw createError({ statusCode: 404, statusMessage: 'Version not found' })

  const kit = (await db.select().from(schema.brandKits).where(eq(schema.brandKits.id, version.brandKitId)).limit(1))[0]
  if (!kit || kit.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Version not found' })

  const snapshot = JSON.parse(version.snapshotJson) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const field of RESTORABLE_FIELDS) patch[field] = snapshot[field] ?? null

  const nowTs = now()
  await db
    .update(schema.brandKits)
    .set({ ...patch, updatedBy: user.id, updatedAt: nowTs })
    .where(eq(schema.brandKits.id, kit.id))

  const restored = (await db.select().from(schema.brandKits).where(eq(schema.brandKits.id, kit.id)).limit(1))[0]
  await db.insert(schema.brandKitVersions).values({ brandKitId: kit.id, snapshotJson: JSON.stringify(restored), editedBy: user.id, createdAt: nowTs })

  await logAdminAction(event, { user, orgId, action: 'restore', resource: 'brand-kit', resourceId: kit.id, detail: `from version ${versionId}` })

  return restored
})
