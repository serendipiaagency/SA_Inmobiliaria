<template>
  <div class="mx-auto max-w-2xl px-4 py-14">
    <h1 class="heading-serif text-4xl">{{ t('vendorRegistration.title', 'Registro de proveedor') }}</h1>
    <p class="mt-2 text-stone-500">{{ t('vendorRegistration.subtitle', 'Registra tu empresa para trabajar con nosotros.') }}</p>

    <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('vendorRegistration.form.nameLabel', 'Empresa / nombre *') }}</label>
          <input v-model="form.name" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.emailLabel', 'Email *') }}</label>
          <input v-model="form.email" type="email" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.phoneLabel', 'Número de teléfono') }}</label>
          <input v-model="form.phone_number" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.contactPersonLabel', 'Persona de contacto') }}</label>
          <input v-model="form.contact_person_name" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.tradeLicenseLabel', 'N.º de licencia comercial') }}</label>
          <input v-model="form.trade_license" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.vatRegistrationLabel', 'N.º de registro de IVA') }}</label>
          <input v-model="form.vat_registration_no" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.emiratesIdLabel', 'Emirates ID') }}</label>
          <input v-model="form.emirates_id" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.passportLabel', 'N.º de pasaporte') }}</label>
          <input v-model="form.passport" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.bankAccountLabel', 'N.º de cuenta bancaria') }}</label>
          <input v-model="form.bank_account_no" class="input" />
        </div>
        <div>
          <label class="label">{{ t('vendorRegistration.form.ibanLabel', 'IBAN') }}</label>
          <input v-model="form.iban_letter" class="input" />
        </div>
      </div>
      <div>
        <label class="label">{{ t('vendorRegistration.form.officeAddressLabel', 'Dirección de la oficina') }}</label>
        <textarea v-model="form.office_address" class="input" rows="3" />
      </div>
      <button type="submit" class="btn-primary w-full" :disabled="sending">
        {{ sending ? t('vendorRegistration.form.sending', 'Enviando…') : t('vendorRegistration.form.submit', 'Registrar') }}
      </button>
      <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ t('vendorRegistration.form.success', 'Registro recibido — ¡gracias!') }}</p>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead(
  seoHead({
    title: 'Vendor registration — M&M Real Estate',
    description: 'Regístrate como proveedor y colabora con M&M Real Estate.',
  }),
)

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
    error.value = e?.statusMessage || t('vendorRegistration.form.error', 'Algo salió mal. Por favor, inténtalo de nuevo.')
  } finally {
    sending.value = false
  }
}
</script>
