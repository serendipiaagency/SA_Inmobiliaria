import { describe, expect, it } from 'vitest'
import { verifyResendSignature } from '../../server/utils/email/signature'

const SECRET = `whsec_${btoa('test-svix-secret-do-not-use-in-prod')}`

async function signHeaders(body: string, secret: string, svixId = 'msg_test123', timestamp = Math.floor(Date.now() / 1000)) {
  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', secretBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signedContent = `${svixId}.${timestamp}.${body}`
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  let bin = ''
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  return { svixId, svixTimestamp: String(timestamp), svixSignature: `v1,${b64}` }
}

describe('verifyResendSignature (Svix scheme)', () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } })

  it('accepts a correctly signed payload', async () => {
    const headers = await signHeaders(body, SECRET)
    expect(await verifyResendSignature(body, headers, SECRET)).toBe(true)
  })

  it('rejects a payload signed with the wrong secret', async () => {
    const headers = await signHeaders(body, `whsec_${btoa('a-different-secret')}`)
    expect(await verifyResendSignature(body, headers, SECRET)).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const headers = await signHeaders(body, SECRET)
    const tampered = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_123' } })
    expect(await verifyResendSignature(tampered, headers, SECRET)).toBe(false)
  })

  it('rejects a mismatched svix-id (id is part of the signed content, not just an idempotency key)', async () => {
    const headers = await signHeaders(body, SECRET, 'msg_original')
    expect(await verifyResendSignature(body, { ...headers, svixId: 'msg_different' }, SECRET)).toBe(false)
  })

  it('rejects a stale timestamp (replay protection)', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600
    const headers = await signHeaders(body, SECRET, 'msg_test123', stale)
    expect(await verifyResendSignature(body, headers, SECRET)).toBe(false)
  })

  it('rejects missing headers', async () => {
    expect(await verifyResendSignature(body, { svixId: null, svixTimestamp: null, svixSignature: null }, SECRET)).toBe(false)
    expect(await verifyResendSignature(body, { svixId: 'x', svixTimestamp: '123', svixSignature: undefined }, SECRET)).toBe(false)
  })

  it('accepts when the header lists multiple signatures (secret rotation) and any one matches', async () => {
    const real = await signHeaders(body, SECRET)
    const decoy = 'v1,deadbeefdeadbeefdeadbeef=='
    expect(await verifyResendSignature(body, { ...real, svixSignature: `${decoy} ${real.svixSignature}` }, SECRET)).toBe(true)
  })
})
