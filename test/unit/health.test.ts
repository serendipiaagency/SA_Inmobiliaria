import { describe, expect, it } from 'vitest'
import { checkDatabaseHealth, checkStorageHealth } from '../../server/utils/health'

/**
 * /api/health/ready (P1-10) didn't exist before — checkDatabaseHealth()/
 * checkStorageHealth() are the real dependency checks behind it, split out
 * so they're testable without the Workers runtime.
 */

function fakeHealthyDb(): any {
  return { prepare: () => ({ first: async () => ({ '1': 1 }) }) }
}

function fakeFailingDb(message: string): any {
  return {
    prepare: () => ({
      first: async () => {
        throw new Error(message)
      },
    }),
  }
}

function fakeHealthyBucket(): any {
  return { head: async () => null } // null = object doesn't exist, but R2 answered — still healthy
}

function fakeFailingBucket(message: string): any {
  return {
    head: async () => {
      throw new Error(message)
    },
  }
}

describe('checkDatabaseHealth', () => {
  it('reports ok when a trivial query succeeds', async () => {
    expect(await checkDatabaseHealth(fakeHealthyDb())).toEqual({ ok: true })
  })

  it('reports not-ok with the real error message when D1 throws', async () => {
    const result = await checkDatabaseHealth(fakeFailingDb('D1_ERROR: binding not found'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('binding not found')
  })
})

describe('checkStorageHealth', () => {
  it('reports ok when R2 answers, even for a key that does not exist (head() returning null)', async () => {
    expect(await checkStorageHealth(fakeHealthyBucket())).toEqual({ ok: true })
  })

  it('reports not-ok with the real error message when R2 throws', async () => {
    const result = await checkStorageHealth(fakeFailingBucket('R2 bucket not bound'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('R2 bucket not bound')
  })
})
