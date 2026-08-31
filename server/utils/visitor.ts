import { getCookie, setCookie, type H3Event } from 'h3'

const VISITOR_COOKIE = 'sa_visitor'
const VISITOR_ID_RE = /^[0-9a-f]{32}$/

function randomVisitorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * A long-lived, anonymous, per-browser identifier for the public site — no
 * login involved, no personal data (a random opaque token, same privacy
 * footprint as any session cookie). Gives "one favorite per visitor" and
 * "one counted view per visitor per window" real per-visitor meaning
 * instead of a raw counter any script could drive arbitrarily by replaying
 * the same request (docs/production-hardening-audit.md, P1-6/P1-7).
 */
export function getOrSetVisitorId(event: H3Event): string {
  const existing = getCookie(event, VISITOR_COOKIE)
  if (existing && VISITOR_ID_RE.test(existing)) return existing
  const id = randomVisitorId()
  setCookie(event, VISITOR_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 2, // 2 years
  })
  return id
}
