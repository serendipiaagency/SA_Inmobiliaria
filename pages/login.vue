<template>
  <div class="mx-auto flex max-w-md flex-col justify-center px-4 py-20">
    <h1 class="text-center heading-serif text-4xl">{{ t('login.title', 'Acceder') }}</h1>
    <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div>
        <label class="label">{{ t('login.form.emailLabel', 'Email') }}</label>
        <input v-model="email" type="email" class="input" required autocomplete="email" />
      </div>
      <div>
        <label class="label">{{ t('login.form.passwordLabel', 'Contraseña') }}</label>
        <input v-model="password" type="password" class="input" required autocomplete="current-password" />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="loading">
        {{ loading ? t('login.form.signingIn', 'Accediendo…') : t('login.form.submit', 'Acceder') }}
      </button>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
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
    router.push(user.value?.role === 'admin' ? '/admin' : '/')
  } catch (e: any) {
    error.value = e?.statusMessage || t('login.form.error', 'Credenciales inválidas')
  } finally {
    loading.value = false
  }
}
</script>
