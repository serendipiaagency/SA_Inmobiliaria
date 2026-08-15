import { requireAdmin } from '../../utils/auth'
import { storeFile } from '../../utils/media'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folder')
  const folder = (folderPart ? new TextDecoder().decode(folderPart.data) : 'uploads').replace(/[^a-z0-9_-]/gi, '')
  // The folder segment is client-supplied (the admin form sends the resource
  // key, e.g. "developer-properties" or "brand-kit"), so it stays open — but
  // never into the namespaces /api/media guards with an ownership check.
  // Writing there would put an attacker-controlled object inside a prefix
  // whose other objects are private tenant documents.
  const RESERVED_FOLDERS = ['visitor-docs', 'contracts', 'asset-export-renders', 'asset-export-catalogs', 'cms']
  const safeFolder = !folder || RESERVED_FOLDERS.includes(folder) ? 'uploads' : folder
  const key = await storeFile(event, file, safeFolder)
  return { key, url: `/api/media/${key}` }
})
