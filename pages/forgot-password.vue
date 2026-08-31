<template>
  <div class="mx-auto flex max-w-md flex-col justify-center px-4 py-20">
    <h1 class="text-center heading-serif text-4xl">Recuperar contraseña</h1>
    <form v-if="!sent" class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <p class="text-sm text-stone-500">Indica tu email y, si tienes una cuenta, te enviaremos un enlace para restablecer tu contraseña.</p>
      <div>
        <label class="label" for="forgot-email">Email</label>
        <input id="forgot-email" v-model="email" type="email" class="input" required autocomplete="email" autofocus >
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Enviando…' : 'Enviar enlace' }}</button>
    </form>
    <div v-else class="card mt-10 p-8 text-center text-sm text-stone-600">
      Si existe una cuenta con ese email, hemos enviado un enlace para restablecer la contraseña. Revisa tu bandeja de entrada.
    </div>
    <p class="mt-6 text-center text-sm">
      <NuxtLink to="/login" class="text-stone-500 hover:underline">Volver a acceder</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Recuperar contraseña' })
const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  loading.value = true
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.value } })
  } catch {
    // Always show the same generic confirmation — never leak whether the email exists via a different outcome.
  } finally {
    loading.value = false
    sent.value = true
  }
}
</script>
