// Deliberately permissive — these gate obvious garbage/injection attempts in public form
// fields, not full RFC compliance (international phone formats vary too widely to be strict).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-\s]{6,25}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim()) && value.length <= 254
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim())
}

export function requireValidEmail(value: unknown, field = 'email'): string {
  const v = String(value ?? '').trim()
  if (!isValidEmail(v)) throw createError({ statusCode: 422, statusMessage: `Invalid ${field}` })
  return v
}
