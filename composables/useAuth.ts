interface SessionUser {
  id: number
  name: string
  email: string
  role: string
  organizationId: number | null
  /** Nullable JSON array of "<area>:<action>" strings — see utils/permissions.ts. Null = unrestricted. */
  permissions: string | null
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const loaded = useState<boolean>('auth-loaded', () => false)
  /**
   * Cierto sólo cuando se está entrando sin login en desarrollo
   * (`DEV_AUTH_BYPASS`, ver server/utils/auth.ts). El panel lo enseña para
   * que nunca esté encendido en silencio. En producción el servidor devuelve
   * `false` siempre: la rama que lo pondría a `true` no existe en ese build.
   */
  const devAuthBypass = useState<boolean>('auth-dev-bypass', () => false)

  async function refresh() {
    try {
      // useRequestFetch forwards the incoming request cookies during SSR so a
      // hard load / refresh of an authenticated page keeps the session; on the
      // client it behaves like a normal $fetch.
      const req = useRequestFetch()
      const res = await req<{ user: SessionUser | null; devAuthBypass?: boolean }>('/api/auth/me')
      user.value = res.user
      devAuthBypass.value = !!res.devAuthBypass
    } catch {
      user.value = null
      devAuthBypass.value = false
    }
    loaded.value = true
  }

  /**
   * Contraseña correcta → sesión, salvo que la cuenta tenga segundo factor:
   * entonces no hay sesión todavía y se devuelve el desafío que
   * `verifyTotp()` convierte en sesión con un código válido.
   */
  async function login(email: string, password: string): Promise<{ requiresTotp: false } | { requiresTotp: true; challenge: string }> {
    const res = await $fetch<{ ok: boolean; user?: SessionUser; requiresTotp?: boolean; challenge?: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (res.requiresTotp && res.challenge) return { requiresTotp: true, challenge: res.challenge }
    user.value = res.user ?? null
    loaded.value = true
    return { requiresTotp: false }
  }

  /** Segundo paso del login: el desafío de `login()` más un código TOTP o de recuperación. */
  async function verifyTotp(challenge: string, code: string) {
    const res = await $fetch<{ ok: boolean; user: SessionUser; method: 'totp' | 'recovery'; recoveryCodesLeft?: number }>('/api/auth/totp/verify', {
      method: 'POST',
      body: { challenge, code },
    })
    user.value = res.user
    loaded.value = true
    return res
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, loaded, devAuthBypass, refresh, login, verifyTotp, logout }
}
