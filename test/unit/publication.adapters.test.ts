import { describe, expect, it } from 'vitest'
import { runChannelAdapter } from '../../server/utils/publication/adapters'
import { CHANNELS, CHANNEL_BY_KEY, isChannelImplemented } from '../../server/utils/publication/channels'
import { createNotImplementedAdapter } from '../../server/utils/publication/adapters/notImplemented'
import { CHANNEL_ADAPTERS } from '../../server/utils/publication/adapters/registry'

/**
 * Regression net for the exact bug this module was rewritten to fix:
 * server/utils/publication/adapters.ts used to return `ok: true` and a
 * fabricated `externalId` the moment ANY value existed for a channel's
 * secret env var — never making a real request. These tests prove that's
 * gone: setting a secret (even a real-looking one) can never turn a channel
 * with no real integration into a "successful" publish.
 */

const FAKE_PROPERTY = { id: 42, slug: 'demo-property', name: 'Demo Property' }

describe('runChannelAdapter — no channel fakes a success', () => {
  it('every registered channel is currently not_implemented (none has a real integration yet)', () => {
    for (const c of CHANNELS) expect(isChannelImplemented(c.key), c.key).toBe(false)
  })

  it('setting the secret env var does not turn a not-implemented channel into a success', async () => {
    for (const c of CHANNELS) {
      const env = { [c.secretEnvVar]: 'this-looks-like-a-real-api-key-but-is-not' }
      const result = await runChannelAdapter({
        channelKey: c.key,
        action: 'publish',
        property: FAKE_PROPERTY,
        idempotencyKey: `test-${c.key}`,
        env,
      })
      expect(result.ok, `${c.key} must not report ok:true`).toBe(false)
      expect(result.state, c.key).toBe('not_implemented')
      expect(result.retryable, `${c.key} must not be retryable`).toBe(false)
      expect(result.externalId, `${c.key} must never fabricate an external id`).toBeFalsy()
    }
  })

  it('an unknown channel key never reaches ok:true either', async () => {
    const result = await runChannelAdapter({
      channelKey: 'not_a_real_channel',
      action: 'publish',
      property: FAKE_PROPERTY,
      idempotencyKey: 'test-unknown',
      env: {},
    })
    expect(result.ok).toBe(false)
    expect(result.state).toBe('not_implemented')
  })

  it('a channel with no secret at all is not_implemented, not merely not_configured (implemented gate runs first)', async () => {
    const result = await runChannelAdapter({
      channelKey: 'idealista',
      action: 'publish',
      property: FAKE_PROPERTY,
      idempotencyKey: 'test-idealista-no-secret',
      env: {},
    })
    expect(result.state).toBe('not_implemented')
  })

  it('every action (publish/update_text/update_images/unpublish) is honestly blocked, not just publish', async () => {
    for (const action of ['publish', 'update_images', 'update_text', 'unpublish'] as const) {
      const result = await runChannelAdapter({
        channelKey: 'facebook',
        action,
        property: FAKE_PROPERTY,
        idempotencyKey: `test-facebook-${action}`,
        env: { CHANNEL_FACEBOOK_TOKEN: 'fake' },
      })
      expect(result.ok, action).toBe(false)
      expect(result.state, action).toBe('not_implemented')
    }
  })

  it('times out instead of hanging forever when a (hypothetical real) adapter never resolves', async () => {
    // Simulates what a future real integration looks like to the
    // orchestrator: implemented:true, a registry entry that actually calls
    // out and hangs. Both the channel-implemented flag and the registry
    // entry get restored in `finally` so this never leaks into other tests.
    const channelDef = CHANNEL_BY_KEY.own_web
    const wasImplemented = channelDef.implemented
    const originalAdapter = CHANNEL_ADAPTERS.own_web
    channelDef.implemented = true
    CHANNEL_ADAPTERS.own_web = {
      ...createNotImplementedAdapter('Web propia'),
      async validateCredentials() {
        return { ok: true, message: 'ok' }
      },
      async publish() {
        return new Promise(() => {}) // never resolves
      },
    }
    try {
      const result = await runChannelAdapter({
        channelKey: 'own_web',
        action: 'publish',
        property: FAKE_PROPERTY,
        idempotencyKey: 'test-timeout',
        env: { CHANNEL_OWN_WEB_TOKEN: 'fake' },
        timeoutMs: 20,
      })
      expect(result.ok).toBe(false)
      expect(result.retryable).toBe(true)
      expect(result.message).toContain('Tiempo de espera agotado')
    } finally {
      channelDef.implemented = wasImplemented
      CHANNEL_ADAPTERS.own_web = originalAdapter
    }
  })
})

describe('createNotImplementedAdapter', () => {
  it('never returns ok:true from any of its five methods', async () => {
    const adapter = createNotImplementedAdapter('Canal de prueba')
    const ctx = { channelKey: 'x', action: 'publish' as const, property: FAKE_PROPERTY, idempotencyKey: 'k', env: {} }
    for (const method of [adapter.publish, adapter.updateText, adapter.updateImages, adapter.unpublish, adapter.getStatus]) {
      const result = await method(ctx)
      expect(result.ok).toBe(false)
      expect(result.state).toBe('not_implemented')
      expect(result.retryable).toBe(false)
    }
    const validation = await adapter.validateCredentials({})
    expect(validation.ok).toBe(false)
  })
})
