<template>
  <div class="mx-auto flex max-w-md flex-col justify-center px-4 py-20">
    <h1 class="text-center heading-serif text-4xl">{{ t('login.title', 'Acceder') }}</h1>
    <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div>
        <label class="label" for="login-email">{{ t('login.form.emailLabel', 'Email') }}</label>
        <input id="login-email" v-model="email" type="email" class="input" required autocomplete="email" />
      </div>
      <div>
        <label class="label" for="login-password">{{ t('login.form.passwordLabel', 'Contraseña') }}</label>
        <input id="login-password" v-model="password" type="password" class="input" required autocomplete="current-password" />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="loading">
        {{ loading ? t('login.form.signingIn', 'Accediendo…') : t('login.form.submit', 'Acceder') }}
      </button>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      <p class="text-center text-sm">
        <NuxtLink to="/forgot-password" class="text-stone-500 hover:underline">{{ t('login.form.forgotPassword', '¿Olvidaste tu contraseña?') }}</NuxtLink>
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: 'Sign in — M&M Real Estate' })
const { login, user } = useAuth()
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
    const isStaff = user.value?.role === 'admin' || user.value?.role === 'super_admin'
    router.push(isStaff ? '/admin' : '/demo')
  } catch {
    // The backend's statusMessage ("Invalid credentials") is an internal,
    // English-only string — never surface it on this localized form.
    error.value = t('login.form.error', 'Credenciales inválidas')
  } finally {
    loading.value = false
  }
}
</script>
