import { requireAdmin } from '../../utils/auth'
import { storeFile } from '../../utils/media'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folder')
  const folder = (folderPart ? new TextDecoder().decode(folderPart.data) : 'uploads').replace(/[^a-z0-9_-]/gi, '')
  const key = await storeFile(event, file, folder || 'uploads')
  return { key, url: `/api/media/${key}` }
})
