import { cfEnv } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key || key.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  }
  const obj = await cfEnv(event).MEDIA.get(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  if (obj.httpEtag) setHeader(event, 'ETag', obj.httpEtag)
  return obj.body
})
