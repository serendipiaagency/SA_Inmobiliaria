<template>
  <div class="mx-auto max-w-2xl px-4 py-16">
    <div v-if="pending" class="text-center text-sm text-stone-500">Cargando…</div>
    <div v-else-if="!contract" class="text-center">
      <h1 class="heading-serif text-2xl">Contrato no encontrado</h1>
      <p class="mt-2 text-sm text-stone-500">Este enlace no es válido o ha caducado.</p>
    </div>
    <template v-else>
      <h1 class="heading-serif text-3xl">{{ contract.title }}</h1>
      <p class="mt-1 text-sm text-stone-500">Para: {{ contract.clientName }}</p>

      <div class="card mt-8 max-h-[50vh] overflow-y-auto whitespace-pre-wrap p-8 text-[14px] leading-relaxed text-stone-700">{{ contract.bodyText }}</div>

      <div v-if="contract.status === 'accepted'" class="card mt-6 p-6 text-center">
        <p class="font-medium text-emerald-700">✓ Contrato aceptado</p>
        <p class="mt-1 text-sm text-stone-500">Aceptado por {{ contract.acceptedByName }} el {{ new Date(contract.acceptedAt).toLocaleString('es-ES') }}</p>
      </div>

      <form v-else class="card mt-6 space-y-4 p-6" @submit.prevent="accept">
        <div>
          <label class="label" for="accept-name">Nombre completo (a efectos de aceptación)</label>
          <input id="accept-name" v-model="fullName" class="input" required />
        </div>
        <label class="flex items-start gap-2 text-sm text-stone-600">
          <input v-model="confirmed" type="checkbox" class="mt-0.5" required />
          <span>Confirmo que he leído el contenido de este documento y acepto sus términos. Entiendo que esto es una firma electrónica simple (no cualificada), y que se registrará mi IP y fecha/hora de aceptación.</span>
        </label>
        <button type="submit" class="btn-primary w-full" :disabled="submitting">{{ submitting ? 'Procesando…' : 'Aceptar contrato' }}</button>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Contrato — M&M Real Estate' })
const route = useRoute()
const token = String(route.params.token)

const { data: contract, pending, refresh } = await useFetch<any>(`/api/public/contracts/${token}`, { onResponseError: () => {} })

const fullName = ref('')
const confirmed = ref(false)
const submitting = ref(false)
const error = ref('')

async function accept() {
  error.value = ''
  submitting.value = true
  try {
    await $fetch(`/api/public/contracts/${token}/accept`, { method: 'POST', body: { fullName: fullName.value, confirm: confirmed.value } })
    await refresh()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al aceptar el contrato'
  } finally {
    submitting.value = false
  }
}
</script>
