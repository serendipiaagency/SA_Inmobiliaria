<template>
  <AdminPanel title="Plantilla de los emails de Portal INMO" data-testid="portal-email-preview">
    <p class="text-sm text-stone-500">
      Así llegan los emails propios de la plataforma (alta y estado de empresas, cuenta, avisos al equipo). Datos de ejemplo: la vista previa no
      envía nada.
    </p>
    <div class="mt-4 flex flex-wrap items-center gap-3">
      <select v-model="template" class="cfg-input !w-auto min-w-[280px]" data-testid="portal-email-template">
        <option v-for="t in templates" :key="t.key" :value="t.key">{{ t.label }}</option>
      </select>
      <div class="inline-flex rounded-lg border border-line p-0.5 text-[13px]">
        <button v-for="w in WIDTHS" :key="w.key" type="button" class="rounded-md px-3 py-1" :class="width === w.key ? 'bg-ink text-white' : 'text-stone-600'" @click="width = w.key">{{ w.label }}</button>
      </div>
      <div class="inline-flex rounded-lg border border-line p-0.5 text-[13px]">
        <button v-for="l in ['es', 'en']" :key="l" type="button" class="rounded-md px-3 py-1 uppercase" :class="locale === l ? 'bg-ink text-white' : 'text-stone-600'" @click="locale = l as 'es' | 'en'">{{ l }}</button>
      </div>
      <button type="button" class="ml-auto rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-stone-50" :disabled="sending || !preview" data-testid="portal-email-send-test" @click="sendTest">
        {{ sending ? 'Enviando…' : 'Enviarme una prueba' }}
      </button>
    </div>
    <div v-if="preview" class="mt-4 text-[13px] text-stone-600">
      <p><span class="text-stone-400">De:</span> {{ preview.from }} · <span class="text-stone-400">Responder a:</span> {{ preview.replyTo }}</p>
      <p class="mt-0.5"><span class="text-stone-400">Asunto:</span> <span class="font-medium text-ink" data-testid="portal-email-subject">{{ preview.subject }}</span></p>
    </div>
    <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    <div class="mt-4 overflow-x-auto rounded-xl border border-line bg-[#EDF0EB]">
      <iframe
        v-if="preview"
        :srcdoc="preview.html"
        sandbox=""
        title="Vista previa del email"
        class="mx-auto block border-0 transition-[width]"
        :style="{ width: width === 'mobile' ? '375px' : '680px', height: '1100px' }"
        data-testid="portal-email-frame"
      />
    </div>
  </AdminPanel>
</template>

<script setup lang="ts">
/**
 * Vista previa de la plantilla maestra de Portal INMO (server/utils/email/master.ts)
 * con datos de ejemplo, en escritorio y móvil. Sólo para el super admin: la
 * API (email-health?view=preview) lo exige igualmente. «Enviarme una prueba»
 * manda esa plantilla al correo del propio super admin y dice la verdad del
 * resultado (enviado, en cola, sin proveedor).
 */
const toast = useToast()
const WIDTHS = [
  { key: 'desktop', label: 'Escritorio' },
  { key: 'mobile', label: 'Móvil' },
] as const

const template = ref('company_registration_welcome')
const locale = ref<'es' | 'en'>('es')
const width = ref<'desktop' | 'mobile'>('desktop')
const templates = ref<Array<{ key: string; label: string }>>([])
const preview = ref<any>(null)
const error = ref<string | null>(null)
const sending = ref(false)

async function load() {
  error.value = null
  try {
    preview.value = await $fetch<any>('/api/admin/saas/email-health', { query: { view: 'preview', template: template.value, locale: locale.value } })
    templates.value = preview.value.templates
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar la vista previa'
  }
}

async function sendTest() {
  sending.value = true
  try {
    const res = await $fetch<any>('/api/admin/saas/settings', { method: 'POST', body: { section: 'email-preview', template: template.value, locale: locale.value } })
    const msg: Record<string, string> = {
      sent: `Enviado a ${res.to}`,
      queued: `Resend no lo aceptó todavía; queda en cola para reintentar (${res.message || 'sin detalle'})`,
      not_configured: 'No se ha enviado: falta el secreto RESEND_API_KEY en el Worker',
      failed: `No se ha enviado: ${res.message || 'error del proveedor'}`,
    }
    ;(res.delivery === 'sent' ? toast.success : toast.error)(msg[res.delivery] || `Resultado: ${res.delivery}`)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo enviar la prueba')
  } finally {
    sending.value = false
  }
}

watch([template, locale], load)
onMounted(load)
</script>
