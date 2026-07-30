<template>
  <div class="flex min-h-screen items-center justify-center bg-paper px-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <Logo size="md" class="mx-auto" />
        <p class="mt-4 text-sm text-stone-500">Panel de administración</p>
      </div>
      <form class="card space-y-5 p-8" @submit.prevent="submit">
        <div>
          <label class="label">Email</label>
          <input v-model="email" type="email" class="input" required autocomplete="email" autofocus />
        </div>
        <div>
          <label class="label">Contraseña</label>
          <input v-model="password" type="password" class="input" required autocomplete="current-password" />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Accediendo…' : 'Acceder al panel' }}
        </button>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
// Dedicated staff entry point, separate from the consumer /login (favorites)
// flow — enforces that only admin/super_admin accounts can land in /admin,
// signing out and rejecting anything else instead of silently redirecting
// to the public site.
definePageMeta({ layout: false })
useHead({ title: 'Acceder — Panel de administración' })

const { login, logout, user } = useAuth()
const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await login(email.value, password.value)
    if (user.value?.role !== 'admin' && user.value?.role !== 'super_admin') {
      await logout()
      error.value = 'Esta cuenta no tiene acceso al panel de administración.'
      return
    }
    router.push('/admin')
  } catch (e: any) {
    error.value = e?.statusMessage || 'Credenciales inválidas'
  } finally {
    loading.value = false
  }
}
</script>
