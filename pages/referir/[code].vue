<template>
  <div class="mx-auto max-w-md px-4 py-20">
    <div v-if="pending" class="text-center text-sm text-stone-500">Cargando…</div>
    <div v-else-if="!link" class="text-center">
      <h1 class="heading-serif text-2xl">Enlace no válido</h1>
      <p class="mt-2 text-sm text-stone-500">Este enlace de recomendación no existe o ha caducado.</p>
    </div>
    <template v-else>
      <h1 class="heading-serif text-center text-3xl">{{ link.referrerName }} te recomienda {{ link.orgName || 'esta inmobiliaria' }}</h1>
      <p class="mt-2 text-center text-sm text-stone-500">Déjanos tus datos y un agente te contactará.</p>

      <form v-if="!done" class="card mt-8 space-y-4 p-8" @submit.prevent="submit">
        <div>
          <label class="label" for="ref-name">Nombre</label>
          <input id="ref-name" v-model="form.name" class="input" required />
        </div>
        <div>
          <label class="label" for="ref-email">Email</label>
          <input id="ref-email" v-model="form.email" type="email" class="input" />
        </div>
        <div>
          <label class="label" for="ref-phone">Teléfono</label>
          <input id="ref-phone" v-model="form.phone" class="input" />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="submitting">{{ submitting ? 'Enviando…' : 'Enviar' }}</button>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </form>
      <div v-else class="card mt-8 p-8 text-center">
        <p class="text-sm">¡Gracias! Un agente te contactará pronto.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Recomendación — M&M Real Estate' })
const route = useRoute()
const code = String(route.params.code)

const { data: link, pending } = await useFetch<any>(`/api/public/referral-links/${code}`, { onResponseError: () => {} })

const form = reactive({ name: '', email: '', phone: '' })
const submitting = ref(false)
const done = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!form.email && !form.phone) {
    error.value = 'Indica un email o un teléfono'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/public/referrals', { method: 'POST', body: { code, ...form } })
    done.value = true
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al enviar'
  } finally {
    submitting.value = false
  }
}
</script>
