import { describe, expect, it } from 'vitest'
import { dummyVerify, hashPassword, verifyPassword } from '../../server/utils/auth'

describe('password hashing (PBKDF2)', () => {
  it('round-trips: a hashed password verifies against the same plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('two hashes of the same password differ (random salt per hash)', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
  })

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false)
    expect(await verifyPassword('anything', 'pbkdf2$100000$onlytwoparts')).toBe(false)
  })

  it('dummyVerify runs without a real hash to compare against (timing-attack mitigation)', async () => {
    await expect(dummyVerify('some password')).resolves.toBeUndefined()
  })
})
