<template>
  <div class="mx-auto max-w-xl px-4 py-14">
    <h1 class="text-3xl font-bold">Submit a complaint</h1>
    <p class="mt-2 text-slate-600">We take every complaint seriously and will follow up with you.</p>

    <form class="card mt-8 space-y-4 p-6" @submit.prevent="submit">
      <div>
        <label class="label">Name *</label>
        <input v-model="form.name" class="input" required />
      </div>
      <div>
        <label class="label">Email *</label>
        <input v-model="form.email" type="email" class="input" required />
      </div>
      <div>
        <label class="label">Phone</label>
        <input v-model="form.phone" class="input" />
      </div>
      <div>
        <label class="label">Subject</label>
        <input v-model="form.subject" class="input" />
      </div>
      <div>
        <label class="label">Complaint *</label>
        <textarea v-model="form.message" class="input" rows="5" required />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="sending">
        {{ sending ? 'Sending…' : 'Submit complaint' }}
      </button>
      <p v-if="sent" class="text-center text-sm font-medium text-emerald-700">Complaint received — thank you.</p>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Complaints — SA Inmobiliaria' })
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
    error.value = e?.statusMessage || 'Something went wrong. Please try again.'
  } finally {
    sending.value = false
  }
}
</script>
