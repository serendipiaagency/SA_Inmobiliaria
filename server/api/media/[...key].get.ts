import { cfEnv } from '../../utils/db'
import { requireAdmin } from '../../utils/auth'

// Visitor KYC uploads (passport, Emirates ID, bank statements — see server/api/public/visitor.post.ts)
// are the only sensitive prefix in this bucket; everything else (property/blog/agent images) is
// intentionally public. Gate that prefix behind admin auth instead of relying on the R2 key being
// hard to guess.
const PROTECTED_PREFIXES = ['visitor-docs/']

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key || key.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  }
  const isProtected = PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix))
  if (isProtected) await requireAdmin(event)

  const obj = await cfEnv(event).MEDIA.get(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Cache-Control', isProtected ? 'private, no-store' : 'public, max-age=31536000, immutable')
  if (isProtected) setHeader(event, 'Content-Disposition', 'attachment')
  if (obj.httpEtag) setHeader(event, 'ETag', obj.httpEtag)
  return obj.body
})
