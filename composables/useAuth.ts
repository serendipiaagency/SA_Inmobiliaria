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

  async function login(email: string, password: string) {
    const res = await $fetch<{ ok: boolean; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
    loaded.value = true
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, loaded, devAuthBypass, refresh, login, logout }
}
