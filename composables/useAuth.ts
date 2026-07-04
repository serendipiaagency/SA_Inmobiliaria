interface SessionUser {
  id: number
  name: string
  email: string
  role: string
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const loaded = useState<boolean>('auth-loaded', () => false)

  async function refresh() {
    try {
      // useRequestFetch forwards the incoming request cookies during SSR so a
      // hard load / refresh of an authenticated page keeps the session; on the
      // client it behaves like a normal $fetch.
      const req = useRequestFetch()
      const res = await req<{ user: SessionUser | null }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
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

  return { user, loaded, refresh, login, logout }
}
