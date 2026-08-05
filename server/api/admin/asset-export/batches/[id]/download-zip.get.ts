import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, cfEnv } from '../../../../../utils/db'
import { buildZip, sanitizeZipEntryName, type ZipEntry } from '../../../../../utils/zip'

/**
 * Bundles every completed item in a batch into a single ZIP — the batch UI
 * previously only offered one-at-a-time downloads per item. Skips items
 * that failed or whose render is missing from storage rather than failing
 * the whole download; a partial bundle beats none, and metadata.json records
 * exactly what was skipped and why so the user isn't left guessing.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(batchId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const batch = (await db.select().from(schema.exportBatches).where(eq(schema.exportBatches.id, batchId)).limit(1))[0]
  if (!batch || batch.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  const items = await db
    .select({
      id: schema.exportBatchItems.id,
      assetId: schema.exportBatchItems.assetId,
      assetName: schema.developerProperties.name,
      status: schema.exportBatchItems.status,
      errorMessage: schema.exportBatchItems.errorMessage,
      r2Key: schema.assetExportRenders.r2Key,
    })
    .from(schema.exportBatchItems)
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.exportBatchItems.assetId))
    .leftJoin(schema.assetExportRenders, eq(schema.assetExportRenders.id, schema.exportBatchItems.renderId))
    .where(eq(schema.exportBatchItems.batchId, batchId))
    .limit(200)

  const env = cfEnv(event)
  const entries: ZipEntry[] = []
  const usedNames = new Set<string>()
  const skipped: Array<{ assetId: number; reason: string }> = []

  for (const item of items) {
    if (item.status !== 'completed' || !item.r2Key) {
      skipped.push({ assetId: item.assetId, reason: item.errorMessage || `estado: ${item.status}` })
      continue
    }
    const obj = await env.MEDIA.get(item.r2Key)
    if (!obj) {
      skipped.push({ assetId: item.assetId, reason: 'archivo no encontrado en almacenamiento' })
      continue
    }
    let name = `${sanitizeZipEntryName(item.assetName || `activo-${item.assetId}`)}.pdf`
    let suffix = 2
    while (usedNames.has(name)) {
      name = `${sanitizeZipEntryName(item.assetName || `activo-${item.assetId}`)}-${suffix++}.pdf`
    }
    usedNames.add(name)
    entries.push({ name, data: new Uint8Array(await obj.arrayBuffer()) })
  }

  if (!entries.length) throw createError({ statusCode: 409, statusMessage: 'No hay ningún archivo completado para descargar' })

  const metadata = { batchId, batchName: batch.name, generatedAt: new Date().toISOString(), included: entries.length, skipped }
  entries.push({ name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify(metadata, null, 2)) })

  const zip = buildZip(entries)
  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="lote-${batchId}.zip"`)
  return zip
})
