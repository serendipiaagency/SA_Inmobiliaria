<template>
  <div class="mx-auto max-w-2xl px-4 py-14">
    <h1 class="heading-serif text-4xl">{{ t('visitor.title', 'Formulario de visita') }}</h1>
    <p class="mt-2 text-stone-500">{{ t('visitor.subtitle', 'Cuéntanos qué estás buscando y adjunta los documentos requeridos.') }}</p>

    <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('visitor.form.nameLabel', 'Nombre *') }}</label>
          <input v-model="form.name" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.emailLabel', 'Email *') }}</label>
          <input v-model="form.email" type="email" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.phoneLabel', 'Número de teléfono *') }}</label>
          <input v-model="form.phone_number" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.nationalityLabel', 'Nacionalidad *') }}</label>
          <input v-model="form.nationality" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.propertyTypeLabel', 'Tipo de propiedad') }}</label>
          <input v-model="form.property_type" class="input" :placeholder="t('visitor.form.propertyTypePlaceholder', 'Apartamento, villa…')" />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.preferredLocationLabel', 'Ubicación preferida') }}</label>
          <input v-model="form.preferred_location" class="input" />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.budgetRangeLabel', 'Rango de presupuesto') }}</label>
          <input v-model="form.budget_range" class="input" :placeholder="t('visitor.form.budgetRangePlaceholder', 'p. ej. 800k – 1.2M AED')" />
        </div>
        <div>
          <label class="label">{{ t('visitor.form.paymentForRentLabel', 'Alquiler pagado por') }}</label>
          <select v-model="form.payment_for_rent" class="input">
            <option>Personal</option>
            <option>Company</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('visitor.form.familyMembersLabel', 'Miembros de la familia') }}</label>
          <input v-model="form.number_of_family_members" type="number" min="0" class="input" />
        </div>
      </div>
      <div>
        <label class="label">{{ t('visitor.form.specificationsLabel', 'Especificaciones') }}</label>
        <textarea v-model="form.specifications" class="input" rows="3" />
      </div>

      <fieldset class="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend class="px-1 text-sm font-semibold text-stone-600">{{ t('visitor.form.documentsLegend', 'Documentos (PDF)') }}</legend>
        <div v-for="doc in docs" :key="doc.field">
          <label class="label">{{ doc.label }}</label>
          <input type="file" accept="application/pdf" class="text-sm" @change="onFile(doc.field, $event)" />
        </div>
      </fieldset>

      <button type="submit" class="btn-primary w-full" :disabled="sending">
        {{ sending ? t('visitor.form.sending', 'Enviando…') : t('visitor.form.submit', 'Enviar') }}
      </button>
      <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ t('visitor.form.success', 'Formulario recibido — ¡gracias!') }}</p>
      <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead(
  seoHead({
    title: 'Visitor form — M&M Real Estate',
    description: 'Regístrate como visitante para acreditar tu identidad ante el promotor antes de una visita.',
  }),
)

const form = reactive({
  name: '',
  email: '',
  phone_number: '',
  nationality: '',
  property_type: '',
  preferred_location: '',
  budget_range: '',
  payment_for_rent: 'Personal',
  number_of_family_members: '',
  specifications: '',
})

const docs = [
  { field: 'passport_pdf', label: t('visitor.docs.passport', 'Pasaporte') },
  { field: 'emirates_id_pdf', label: t('visitor.docs.emiratesId', 'Emirates ID') },
  { field: 'bank_statement_pdf', label: t('visitor.docs.bankStatement', 'Extracto bancario') },
  { field: 'trade_license_pdf', label: t('visitor.docs.tradeLicense', 'Licencia comercial (empresas)') },
  { field: 'vat_registration_certificate_pdf', label: t('visitor.docs.vatCertificate', 'Certificado de registro de IVA') },
  { field: 'etihad_credit_bureau_pdf', label: t('visitor.docs.etihadCreditBureau', 'Informe de Etihad Credit Bureau') },
]

const files: Record<string, File> = {}
const sending = ref(false)
const sent = ref(false)
const error = ref('')

function onFile(field: string, e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) files[field] = input.files[0]
}

async function submit() {
  sending.value = true
  sent.value = false
  error.value = ''
  try {
    const fd = new FormData()
    for (const [k, v] of Object.entries(form)) fd.append(k, String(v ?? ''))
    for (const [k, f] of Object.entries(files)) fd.append(k, f)
    await $fetch('/api/public/visitor', { method: 'POST', body: fd })
    sent.value = true
  } catch (e: any) {
    error.value = e?.statusMessage || t('visitor.form.error', 'Algo salió mal. Por favor, inténtalo de nuevo.')
  } finally {
    sending.value = false
  }
}
</script>
