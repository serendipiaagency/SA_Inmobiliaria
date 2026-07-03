<template>
  <div class="mx-auto max-w-2xl px-4 py-14">
    <h1 class="text-3xl font-bold">Vendor registration</h1>
    <p class="mt-2 text-slate-600">Register your company to work with us.</p>

    <form class="card mt-8 space-y-4 p-6" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Company / name *</label>
          <input v-model="form.name" class="input" required />
        </div>
        <div>
          <label class="label">Email *</label>
          <input v-model="form.email" type="email" class="input" required />
        </div>
        <div>
          <label class="label">Phone number</label>
          <input v-model="form.phone_number" class="input" />
        </div>
        <div>
          <label class="label">Contact person</label>
          <input v-model="form.contact_person_name" class="input" />
        </div>
        <div>
          <label class="label">Trade license no.</label>
          <input v-model="form.trade_license" class="input" />
        </div>
        <div>
          <label class="label">VAT registration no.</label>
          <input v-model="form.vat_registration_no" class="input" />
        </div>
        <div>
          <label class="label">Emirates ID</label>
          <input v-model="form.emirates_id" class="input" />
        </div>
        <div>
          <label class="label">Passport no.</label>
          <input v-model="form.passport" class="input" />
        </div>
        <div>
          <label class="label">Bank account no.</label>
          <input v-model="form.bank_account_no" class="input" />
        </div>
        <div>
          <label class="label">IBAN</label>
          <input v-model="form.iban_letter" class="input" />
        </div>
      </div>
      <div>
        <label class="label">Office address</label>
        <textarea v-model="form.office_address" class="input" rows="3" />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="sending">
        {{ sending ? 'Submitting…' : 'Register' }}
      </button>
      <p v-if="sent" class="text-center text-sm font-medium text-emerald-700">Registration received — thank you!</p>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Vendor registration — SA Inmobiliaria' })

const form = reactive({
  name: '',
  email: '',
  phone_number: '',
  contact_person_name: '',
  trade_license: '',
  vat_registration_no: '',
  emirates_id: '',
  passport: '',
  bank_account_no: '',
  iban_letter: '',
  office_address: '',
})
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  sending.value = true
  sent.value = false
  error.value = ''
  try {
    await $fetch('/api/public/vendor-registration', { method: 'POST', body: { ...form } })
    sent.value = true
  } catch (e: any) {
    error.value = e?.statusMessage || 'Something went wrong. Please try again.'
  } finally {
    sending.value = false
  }
}
</script>
