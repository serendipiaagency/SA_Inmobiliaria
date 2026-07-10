<template>
  <div class="mx-auto max-w-xl px-4 py-14">
    <h1 class="heading-serif text-4xl">{{ t('complain.title', 'Enviar una reclamación') }}</h1>
    <p class="mt-2 text-stone-500">{{ t('complain.subtitle', 'Nos tomamos cada reclamación en serio y te daremos seguimiento.') }}</p>

    <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div>
        <label class="label">{{ t('complain.form.nameLabel', 'Nombre *') }}</label>
        <input v-model="form.name" class="input" required />
      </div>
      <div>
        <label class="label">{{ t('complain.form.emailLabel', 'Email *') }}</label>
        <input v-model="form.email" type="email" class="input" required />
      </div>
      <div>
        <label class="label">{{ t('complain.form.phoneLabel', 'Teléfono') }}</label>
        <input v-model="form.phone" class="input" />
      </div>
      <div>
        <label class="label">{{ t('complain.form.subjectLabel', 'Asunto') }}</label>
        <input v-model="form.subject" class="input" />
      </div>
      <div>
        <label class="label">{{ t('complain.form.messageLabel', 'Reclamación *') }}</label>
        <textarea v-model="form.message" class="input" rows="5" required />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="sending">
        {{ sending ? t('complain.form.sending', 'Enviando…') : t('complain.form.submit', 'Enviar reclamación') }}
      </button>
      <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ t('complain.form.success', 'Reclamación recibida — gracias.') }}</p>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: 'Complaints — M&M Real Estate' })
const form = reactive({ name: '', email: '', phone: '', subject: '', message: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  sending.value = true
  sent.value = false
  error.value = ''
  try {
    await $fetch('/api/public/contact', { method: 'POST', body: { ...form, type: 'complaint' } })
    sent.value = true
    Object.assign(form, { name: '', email: '', phone: '', subject: '', message: '' })
  } catch (e: any) {
    error.value = e?.statusMessage || t('complain.form.error', 'Algo salió mal. Por favor, inténtalo de nuevo.')
  } finally {
    sending.value = false
  }
}
</script>
