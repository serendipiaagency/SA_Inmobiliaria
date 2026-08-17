import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, cfEnv } from '../../../../../utils/db'
import { findMediaAssetByKey } from '../../../../../utils/mediaAssets'
import { logMediaAccess } from '../../../../../utils/mediaAccessLog'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)).limit(1))[0]
  if (!contract || contract.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
  if (!contract.r2Key) throw createError({ statusCode: 409, statusMessage: 'El PDF final se genera al aceptar el contrato' })

  const obj = await cfEnv(event).MEDIA.get(contract.r2Key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'File missing from storage' })

  const asset = (await findMediaAssetByKey(db, contract.r2Key))[0]
  await logMediaAccess(db, event, {
    organizationId: orgId,
    userId: user.id,
    userEmail: user.email,
    mediaAssetId: asset?.id ?? null,
    r2Key: contract.r2Key,
    action: 'download',
    visibility: 'confidential',
  })

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Content-Disposition', `attachment; filename="contrato-${contract.id}.pdf"`)
  return obj.body
})
