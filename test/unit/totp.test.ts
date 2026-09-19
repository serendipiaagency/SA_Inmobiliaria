import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  normalizeRecoveryCode,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from '../../server/utils/totp'

/**
 * Lo único que garantiza que este TOTP genera lo mismo que la app del
 * teléfono son los vectores de prueba publicados en el RFC 6238 (apéndice B,
 * modo SHA-1, secreto ASCII "12345678901234567890"). El RFC da códigos de 8
 * dígitos; con 6 son los mismos sin los dos primeros.
 */
const RFC_SECRET_ASCII = '12345678901234567890'
const RFC_SECRET_B32 = base32Encode(new TextEncoder().encode(RFC_SECRET_ASCII))
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

describe('TOTP (RFC 6238)', () => {
  it('reproduce los vectores de prueba del RFC con 8 y con 6 dígitos', async () => {
    for (const [seconds, expected8] of RFC_VECTORS) {
      expect(await totpCode(RFC_SECRET_B32, seconds * 1000, { digits: 8 }), `T=${seconds}`).toBe(expected8)
      expect(await totpCode(RFC_SECRET_B32, seconds * 1000), `T=${seconds}`).toBe(expected8.slice(2))
    }
  })

  it('HOTP (RFC 4226) para los primeros contadores del secreto de referencia', async () => {
    const secret = new TextEncoder().encode(RFC_SECRET_ASCII)
    // Apéndice D del RFC 4226.
    expect(await hotp(secret, 0)).toBe('755224')
    expect(await hotp(secret, 1)).toBe('287082')
    expect(await hotp(secret, 9)).toBe('520489')
  })

  it('base32 va y vuelve, y acepta lo que teclea una persona (minúsculas, espacios, guiones)', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    const encoded = base32Encode(bytes)
    expect(encoded).toMatch(/^[A-Z2-7]+$/)
    expect(base32Decode(encoded)).toEqual(bytes)
    expect(base32Decode(encoded.toLowerCase().replace(/(.{4})/g, '$1 '))).toEqual(bytes)
    expect(() => base32Decode('ABC1')).toThrow(/inválido/)
  })

  it('el secreto generado tiene 160 bits y la URL otpauth lleva lo que la app espera', () => {
    const secret = generateTotpSecret()
    expect(base32Decode(secret)).toHaveLength(20)
    const url = otpauthUrl(secret, 'ana@ejemplo.com')
    expect(url.startsWith('otpauth://totp/SA%20Inmobiliaria%3Aana%40ejemplo.com?')).toBe(true)
    expect(url).toContain(`secret=${secret}`)
    expect(url).toContain('issuer=SA+Inmobiliaria')
    expect(url).toContain('digits=6')
    expect(url).toContain('period=30')
  })

  describe('verifyTotp', () => {
    const t = 1_700_000_000_000 // un instante cualquiera, en ms
    const secret = generateTotpSecret()

    it('acepta el código del paso actual y los de ±30 s, y rechaza el de ±60 s', async () => {
      const now = await totpCode(secret, t)
      const prev = await totpCode(secret, t - 30_000)
      const next = await totpCode(secret, t + 30_000)
      const tooOld = await totpCode(secret, t - 60_000)
      expect((await verifyTotp(secret, now, t)).ok).toBe(true)
      expect((await verifyTotp(secret, prev, t)).ok).toBe(true)
      expect((await verifyTotp(secret, next, t)).ok).toBe(true)
      expect((await verifyTotp(secret, tooOld, t)).ok).toBe(false)
    })

    it('un código sólo vale una vez: el paso ya usado (y cualquiera anterior) se rechaza', async () => {
      const code = await totpCode(secret, t)
      const first = await verifyTotp(secret, code, t)
      expect(first.ok).toBe(true)
      expect(first.step).not.toBeNull()
      // Mismo código, mismo instante, pero ya usado.
      expect((await verifyTotp(secret, code, t, { lastUsedStep: first.step })).ok).toBe(false)
      // El del paso anterior tampoco, aunque esté en ventana.
      const prev = await totpCode(secret, t - 30_000)
      expect((await verifyTotp(secret, prev, t, { lastUsedStep: first.step })).ok).toBe(false)
      // El siguiente sí.
      const next = await totpCode(secret, t + 30_000)
      expect((await verifyTotp(secret, next, t, { lastUsedStep: first.step })).ok).toBe(true)
    })

    it('rechaza lo que no tiene forma de código sin tocar el secreto', async () => {
      expect((await verifyTotp(secret, '', t)).ok).toBe(false)
      expect((await verifyTotp(secret, '12345', t)).ok).toBe(false)
      expect((await verifyTotp(secret, 'abcdef', t)).ok).toBe(false)
    })

    it('tolera espacios en lo que teclea la persona', async () => {
      const code = await totpCode(secret, t)
      expect((await verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, t)).ok).toBe(true)
    })
  })
})

describe('códigos de recuperación', () => {
  it('son 10, legibles, sin caracteres que se confundan, y todos distintos', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/)
  })

  it('el hash no depende de cómo lo teclee la persona', async () => {
    expect(await hashRecoveryCode('abcde-fghjk')).toBe(await hashRecoveryCode('ABCDE FGHJK'))
    expect(await hashRecoveryCode('ABCDEFGHJK')).toBe(await hashRecoveryCode('ABCDE-FGHJK'))
    expect(normalizeRecoveryCode(' ab-cd ')).toBe('ABCD')
  })
})
