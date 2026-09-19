/**
 * Segundo factor por código temporal (TOTP, RFC 6238 sobre HOTP, RFC 4226):
 * lo que generan Google Authenticator, Authy, 1Password, Bitwarden…
 *
 * ## Por qué aquí y no una librería
 *
 * El algoritmo son treinta líneas sobre HMAC-SHA1, que Web Crypto ya trae
 * en el Worker; una dependencia más para esto es más superficie que
 * beneficio. `test/unit/totp.test.ts` lo comprueba contra los vectores de
 * prueba publicados en el propio RFC 6238, que es la garantía real de que
 * genera lo mismo que la app del teléfono.
 *
 * ## Decisiones
 *
 *  - SHA-1, 6 dígitos, 30 segundos: los valores que toda app de
 *    autenticación asume por defecto. Otros son válidos por RFC, pero
 *    muchas apps los ignoran en silencio y el código nunca coincide.
 *  - Ventana de ±1 paso (30 s a cada lado) para tolerar relojes desajustados.
 *  - **Anti-repetición**: un código sólo vale una vez. Se guarda el paso del
 *    último código aceptado y no se acepta ninguno de ese paso ni anterior.
 *    Sin esto, quien mire por encima del hombro tiene 30 segundos para
 *    reutilizarlo.
 *  - Comparación de códigos en tiempo constante.
 *  - El secreto va cifrado en D1 con TOTP_ENCRYPTION_KEY
 *    (server/utils/encryption.ts): una copia de seguridad filtrada trae los
 *    hashes de contraseña pero no las semillas del segundo factor.
 *
 * Todo lo de este fichero es puro salvo `crypto.subtle` (disponible en el
 * Worker, en Node 22 y en las pruebas).
 */

export const TOTP_DIGITS = 6
export const TOTP_STEP_SECONDS = 30
export const TOTP_WINDOW = 1
/** Cuántos códigos de recuperación se entregan al activar (y al regenerar). */
export const RECOVERY_CODE_COUNT = 10
/** Nombre que enseña la app de autenticación junto al email. */
export const TOTP_ISSUER = 'SA Inmobiliaria'

// --- base32 (RFC 4648, sin relleno: lo que aceptan las apps) --------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[=\s-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error(`Carácter base32 inválido: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

// --- HOTP / TOTP ------------------------------------------------------------

/** 20 bytes aleatorios (160 bits), el tamaño que recomienda el RFC para SHA-1. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource))
}

/** Código HOTP (RFC 4226) para un contador. */
export async function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const message = new Uint8Array(8)
  // Contador de 64 bits en big-endian. Number es seguro hasta 2^53, de sobra.
  let c = counter
  for (let i = 7; i >= 0; i--) {
    message[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const digest = await hmacSha1(secret, message)
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** El paso de tiempo (contador) al que pertenece un instante. */
export function totpStep(nowMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds)
}

/** Código TOTP (RFC 6238) para un instante. */
export async function totpCode(secretBase32: string, nowMs: number, opts: { stepSeconds?: number; digits?: number } = {}): Promise<string> {
  return hotp(base32Decode(secretBase32), totpStep(nowMs, opts.stepSeconds), opts.digits)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface TotpVerifyResult {
  ok: boolean
  /** El paso que coincidió — lo que hay que guardar como "último usado" para no aceptarlo otra vez. */
  step: number | null
}

/**
 * Comprueba un código contra el secreto, dentro de la ventana, y rechaza
 * cualquier paso ya usado (`lastUsedStep`) o anterior a él.
 */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  opts: { window?: number; lastUsedStep?: number | null; stepSeconds?: number } = {},
): Promise<TotpVerifyResult> {
  const normalized = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return { ok: false, step: null }
  const secret = base32Decode(secretBase32)
  const current = totpStep(nowMs, opts.stepSeconds)
  const window = opts.window ?? TOTP_WINDOW
  const lastUsed = opts.lastUsedStep ?? null
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta
    if (lastUsed !== null && step <= lastUsed) continue
    const expected = await hotp(secret, step)
    if (constantTimeEqual(expected, normalized)) return { ok: true, step }
  }
  return { ok: false, step: null }
}

/** La URL `otpauth://` que la app de autenticación lee del QR. */
export function otpauthUrl(secretBase32: string, accountLabel: string, issuer = TOTP_ISSUER): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`)
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}

// --- códigos de recuperación -----------------------------------------------

// Sin 0/O/1/I/L: se dictan por teléfono y se teclean a mano.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Un código de recuperación legible: `XXXXX-XXXXX`. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let out = ''
  for (let i = 0; i < 10; i++) {
    if (i === 5) out += '-'
    out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]
  }
  return out
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode())
}

/** Normaliza lo que teclea una persona: mayúsculas, sin espacios ni guiones. */
export function normalizeRecoveryCode(input: string): string {
  return String(input || '').toUpperCase().replace(/[\s-]/g, '')
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeRecoveryCode(code)))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
