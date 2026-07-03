export default defineNuxtRouteMiddleware(async () => {
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (!user.value || user.value.role !== 'admin') {
    return navigateTo('/login')
  }
})
