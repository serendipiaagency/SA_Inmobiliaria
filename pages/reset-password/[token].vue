<template>
  <div class="mx-auto flex max-w-md flex-col justify-center px-4 py-20">
    <h1 class="text-center heading-serif text-4xl">Restablecer contraseña</h1>
    <form v-if="!done" class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div>
        <label class="label" for="reset-password">Nueva contraseña</label>
        <input id="reset-password" v-model="password" type="password" class="input" required minlength="8" autocomplete="new-password" autofocus />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Guardando…' : 'Guardar contraseña' }}</button>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
    <div v-else class="card mt-10 space-y-4 p-8 text-center text-sm">
      <p class="text-stone-600">Tu contraseña se ha actualizado.</p>
      <NuxtLink to="/login" class="btn-primary inline-flex">Acceder</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
useHead({ title: 'Restablecer contraseña' })
const password = ref('')
const loading = ref(false)
const done = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', { method: 'POST', body: { token: route.params.token, password: password.value } })
    done.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage === 'Invalid or expired token' ? 'Este enlace ha caducado o ya se usó. Solicita uno nuevo.' : 'No se pudo actualizar la contraseña.'
  } finally {
    loading.value = false
  }
}
</script>
