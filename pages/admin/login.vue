<template>
  <div class="flex min-h-screen items-center justify-center bg-paper px-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <Logo size="md" class="mx-auto" />
        <p class="mt-4 text-sm text-stone-500">Panel de administración</p>
      </div>
      <form class="card space-y-5 p-8" @submit.prevent="submit">
        <div>
          <label class="label" for="admin-login-email">Email</label>
          <input id="admin-login-email" v-model="email" type="email" class="input" required autocomplete="email" autofocus >
        </div>
        <div>
          <label class="label" for="admin-login-password">Contraseña</label>
          <input id="admin-login-password" v-model="password" type="password" class="input" required autocomplete="current-password" >
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Accediendo…' : 'Acceder al panel' }}
        </button>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
        <p class="text-center text-sm">
          <NuxtLink to="/forgot-password" class="text-stone-500 hover:underline">¿Olvidaste tu contraseña?</NuxtLink>
        </p>
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
    // The backend's statusMessage ("Invalid credentials") is an internal,
    // English-only string — never surface it on this Spanish-language form.
    // Un bloqueo por exceso de intentos sí se cuenta tal cual: es por IP y
    // anterior a mirar la cuenta, así que no filtra nada, y callarlo dejaba a
    // la gente reintentando contra un candado que sus propios reintentos
    // renovaban. Ver utils/loginError.ts.
    error.value = loginErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>
