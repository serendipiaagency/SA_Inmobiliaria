import { describe, expect, it } from 'vitest'
import { normalizeHost, isPrimaryHost, isReservedHost, isValidHostname } from '../../server/utils/domain'

describe('normalizeHost', () => {
  it('lowercases', () => {
    expect(normalizeHost('Example.COM')).toBe('example.com')
  })

  it('strips a port suffix', () => {
    expect(normalizeHost('example.com:8788')).toBe('example.com')
  })

  it('strips a leading www.', () => {
    expect(normalizeHost('www.example.com')).toBe('example.com')
  })

  it('combines all three', () => {
    expect(normalizeHost('WWW.Example.COM:443')).toBe('example.com')
  })

  it('leaves a bare hostname untouched', () => {
    expect(normalizeHost('skyline-estates.test')).toBe('skyline-estates.test')
  })

  it('does not strip "www" from the middle of a label', () => {
    expect(normalizeHost('mywww.example.com')).toBe('mywww.example.com')
  })
})

describe('isPrimaryHost', () => {
  it('treats localhost and 127.0.0.1 as primary', () => {
    expect(isPrimaryHost('localhost')).toBe(true)
    expect(isPrimaryHost('127.0.0.1')).toBe(true)
  })

  it('treats any *.workers.dev host as primary', () => {
    expect(isPrimaryHost('sa-inmobiliaria.some-subdomain.workers.dev')).toBe(true)
    expect(isPrimaryHost('sa-inmobiliaria-staging.some-subdomain.workers.dev')).toBe(true)
  })

  it('rejects an unrelated host with no PRIMARY_DOMAIN configured', () => {
    expect(isPrimaryHost('example.com')).toBe(false)
  })

  it('accepts the configured PRIMARY_DOMAIN, normalized on both sides', () => {
    expect(isPrimaryHost('example.com', 'WWW.Example.com')).toBe(true)
    expect(isPrimaryHost('example.com', undefined)).toBe(false)
  })

  it('does not treat a tenant domain as primary just because it shares a workers.dev-like suffix by coincidence', () => {
    expect(isPrimaryHost('notworkers.dev')).toBe(false)
  })
})

describe('isReservedHost', () => {
  it('reserves the primary-host patterns so no org can claim them as a custom domain', () => {
    expect(isReservedHost('localhost')).toBe(true)
    expect(isReservedHost('127.0.0.1')).toBe(true)
    expect(isReservedHost('sa-inmobiliaria.foo.workers.dev')).toBe(true)
  })

  it('allows an ordinary custom domain', () => {
    expect(isReservedHost('skyline-estates.test')).toBe(false)
  })
})

describe('isValidHostname', () => {
  it('accepts real-looking hostnames', () => {
    expect(isValidHostname('example.com')).toBe(true)
    expect(isValidHostname('skyline-estates.test')).toBe(true)
    expect(isValidHostname('sub.example.co.uk')).toBe(true)
  })

  it('rejects a bare label with no dot (not a valid public/custom domain)', () => {
    expect(isValidHostname('localhost')).toBe(false)
    expect(isValidHostname('example')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isValidHostname('not a domain')).toBe(false)
    expect(isValidHostname('http://example.com')).toBe(false)
    expect(isValidHostname('example..com')).toBe(false)
    expect(isValidHostname('')).toBe(false)
  })
})
