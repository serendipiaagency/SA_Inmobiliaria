<template>
  <section class="space-y-5" data-testid="org-sender-panel" :data-ready="mounted ? 'true' : undefined">
    <div v-if="loadError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{{ loadError }}</div>

    <template v-else-if="state">
      <!-- Cómo salen hoy -->
      <div class="rounded-2xl border p-5" :class="state.effective.mode === 'own' ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-paper'" data-testid="org-sender-effective" :data-mode="state.effective.mode">
        <p class="text-xs font-semibold uppercase tracking-widest" :class="state.effective.mode === 'own' ? 'text-emerald-800' : 'text-stone-500'">
          {{ state.effective.mode === 'own' ? 'Tus emails salen de tu dirección' : 'Tus emails salen con tu nombre, desde la dirección de INMO' }}
        </p>
        <p class="mt-2 break-all font-mono text-sm text-ink" data-testid="org-sender-from">{{ state.effective.fromHeader }}</p>
        <p v-if="state.effective.replyTo" class="mt-1 text-sm text-stone-600">Las respuestas llegan a <span class="font-medium text-ink">{{ state.effective.replyTo }}</span>.</p>
        <p v-if="state.effective.mode === 'platform' && state.senderAddress" class="mt-2 text-sm text-stone-600">
          En cuanto verifiques <strong>{{ domainName }}</strong>, saldrán de <strong>{{ state.senderAddress }}</strong>.
        </p>
        <p class="mt-3 text-xs text-stone-500">
          Esto es lo que reciben tus clientes y tu equipo (leads, citas, contratos, avisos internos). Las altas de usuario, la bienvenida y la recuperación de contraseña salen siempre de {{ state.platformFrom }}.
        </p>
      </div>

      <!-- Formulario -->
      <form class="card space-y-5 p-5 sm:p-6" novalidate @submit.prevent="save">
        <div>
          <h3 class="text-base font-bold text-ink">Remitente de tu empresa</h3>
          <p class="mt-1 text-sm text-stone-500">Opcional: una dirección de tu propio dominio (no Gmail, Outlook…). Sin ella tus emails ya salen con tu nombre y las respuestas te llegan a ti; con ella verificada, también la dirección es la tuya.</p>
        </div>
        <p v-if="formError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" data-testid="org-sender-error">{{ formError }}</p>
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label :for="`${uid}-name`" class="label">Nombre del remitente</label>
            <input :id="`${uid}-name`" v-model="form.senderName" type="text" maxlength="80" class="input" :placeholder="namePlaceholder" :disabled="!canEdit" data-testid="org-sender-name">
          </div>
          <div>
            <label :for="`${uid}-address`" class="label">Dirección del remitente</label>
            <input :id="`${uid}-address`" v-model="form.senderAddress" type="email" class="input" placeholder="hola@tuinmobiliaria.es" autocomplete="off" :aria-invalid="errors.senderAddress ? 'true' : undefined" :disabled="!canEdit" data-testid="org-sender-address">
            <p v-if="errors.senderAddress" class="mt-1.5 text-xs font-medium text-red-600" data-testid="org-sender-address-error">{{ errors.senderAddress }}</p>
          </div>
          <div>
            <label :for="`${uid}-reply`" class="label">Responder a <span class="font-normal normal-case tracking-normal text-stone-400">(opcional)</span></label>
            <input :id="`${uid}-reply`" v-model="form.replyTo" type="email" class="input" placeholder="ventas@tuinmobiliaria.es" :aria-invalid="errors.replyTo ? 'true' : undefined" :disabled="!canEdit" data-testid="org-sender-reply">
            <p v-if="errors.replyTo" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.replyTo }}</p>
            <p v-else class="mt-1.5 text-xs text-stone-500">Puede ser cualquier buzón, también un Gmail.</p>
          </div>
          <div>
            <label :for="`${uid}-recipients`" class="label">Avisos internos para tu equipo</label>
            <textarea :id="`${uid}-recipients`" v-model="form.internalRecipients" rows="3" class="input" placeholder="ventas@tuinmobiliaria.es&#10;ops@tuinmobiliaria.es" :aria-invalid="errors.internalRecipients ? 'true' : undefined" :disabled="!canEdit" data-testid="org-sender-recipients" />
            <p v-if="errors.internalRecipients" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.internalRecipients }}</p>
            <p v-else class="mt-1.5 text-xs text-stone-500">Uno por línea: nuevos leads, mensajes de contacto, reclamaciones…</p>
          </div>
        </div>
        <div v-if="canEdit" class="flex justify-end">
          <button type="submit" class="btn-primary" :disabled="saving || !dirty" data-testid="org-sender-save">{{ saving ? 'Guardando…' : 'Guardar remitente' }}</button>
        </div>
      </form>

      <!-- Verificación del dominio -->
      <div v-if="state.domain" class="card p-5 sm:p-6" data-testid="org-sender-domain" :data-status="state.domain.status">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-ink">Verifica {{ state.domain.name }}</h3>
            <p class="mt-1 text-sm text-stone-500">{{ domainHint }}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="statusTone" data-testid="org-sender-domain-status">{{ statusLabel }}</span>
        </div>

        <p v-if="state.domain.error" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="org-sender-domain-error">{{ state.domain.error }}</p>

        <template v-if="state.domain.records.length && !state.domain.verified">
          <ol class="mt-4 list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>Entra en el panel donde gestionas el DNS de <strong>{{ state.domain.name }}</strong> (tu registrador, Cloudflare, tu proveedor de hosting…).</li>
            <li>Añade estos {{ state.domain.records.length }} registros tal cual. No tocan tu correo actual: van en subdominios propios (<span class="font-mono">send</span>, <span class="font-mono">resend._domainkey</span>).</li>
            <li>Pulsa «Comprobar ahora». El DNS puede tardar desde minutos hasta 48 horas en propagarse.</li>
          </ol>
          <div class="mt-4 overflow-x-auto rounded-xl border border-line">
            <table class="w-full min-w-[40rem] text-left text-sm" data-testid="org-sender-records">
              <thead class="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th class="px-3 py-2">Tipo</th>
                  <th class="px-3 py-2">Nombre / Host</th>
                  <th class="px-3 py-2">Valor</th>
                  <th class="px-3 py-2">Prioridad</th>
                  <th class="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in state.domain.records" :key="i" class="border-t border-line align-top">
                  <td class="px-3 py-2.5 font-mono text-xs">{{ r.type }}</td>
                  <td class="px-3 py-2.5">
                    <button type="button" class="break-all text-left font-mono text-xs text-ink hover:underline" :title="`Copiar ${r.host}`" @click="copy(r.host)">{{ r.host }}</button>
                  </td>
                  <td class="max-w-[22rem] px-3 py-2.5">
                    <button type="button" class="break-all text-left font-mono text-xs text-ink hover:underline" title="Copiar valor" @click="copy(r.value)">{{ r.value }}</button>
                  </td>
                  <td class="px-3 py-2.5 font-mono text-xs">{{ r.priority ?? '—' }}</td>
                  <td class="px-3 py-2.5 text-xs">{{ recordStatus(r.status) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-stone-500">Pulsa un nombre o un valor para copiarlo. Si tu panel añade el dominio solo, escribe en «Nombre» únicamente la primera parte (p. ej. <span class="font-mono">send</span>).</p>
        </template>

        <div v-if="canEdit && !state.domain.verified && state.providerConnected" class="mt-5 flex justify-end">
          <button type="button" class="btn-secondary" :disabled="verifying" data-testid="org-sender-verify" @click="verify">{{ verifying ? 'Comprobando…' : 'Comprobar ahora' }}</button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Remitente de los emails de una empresa y verificación autoservicio de su
 * dominio (server/utils/email/orgSender.ts). Lo usan Sistema → Emails (el
 * administrador de la empresa, su propia empresa) y Sistemas > Empresas >
 * ficha > Email (super admin, con `organizationId`).
 */
const props = defineProps<{ organizationId?: number | null; canEdit: boolean; fallbackName?: string }>()

interface SenderRecord { record: string; name: string; host: string; type: string; value: string; priority?: number | null; status: string }
interface SenderView {
  organizationId: number
  senderName: string
  senderAddress: string
  replyTo: string
  internalRecipients: string[]
  effective: { mode: 'own' | 'platform'; fromHeader: string; replyTo: string | null }
  platformFrom: string
  providerConnected: boolean
  domain: null | { name: string; status: string; verified: boolean; records: SenderRecord[]; error: string | null }
}

const uid = useId()
const toast = useToast()
const state = ref<SenderView | null>(null)
const loadError = ref('')
const form = reactive({ senderName: '', senderAddress: '', replyTo: '', internalRecipients: '' })
const original = ref('')
const errors = reactive<Record<string, string>>({})
const formError = ref('')
const saving = ref(false)
const verifying = ref(false)

const query = computed(() => ({ view: 'sender', ...(props.organizationId ? { organizationId: props.organizationId } : {}) }))
const { data, error } = await useFetch<SenderView>('/api/admin/saas/email-health', { query, key: `org-sender-${props.organizationId ?? 'own'}` })
if (data.value) apply(data.value)
else if (error.value) loadError.value = 'No se ha podido cargar el remitente de la empresa.'

function apply(v: SenderView) {
  state.value = v
  form.senderName = v.senderName
  form.senderAddress = v.senderAddress
  form.replyTo = v.replyTo
  form.internalRecipients = v.internalRecipients.join('\n')
  original.value = JSON.stringify(form)
}

const dirty = computed(() => JSON.stringify(form) !== original.value)
const domainName = computed(() => state.value?.domain?.name || form.senderAddress.split('@')[1] || '')
const namePlaceholder = computed(() => props.fallbackName || 'Nombre de tu inmobiliaria')

const STATUS: Record<string, { label: string; tone: string }> = {
  verified: { label: 'Verificado', tone: 'bg-emerald-100 text-emerald-800' },
  pending: { label: 'Comprobando DNS', tone: 'bg-amber-100 text-amber-800' },
  not_started: { label: 'Pendiente de DNS', tone: 'bg-amber-100 text-amber-800' },
  temporary_failure: { label: 'Fallo temporal', tone: 'bg-amber-100 text-amber-800' },
  failed: { label: 'No verificado', tone: 'bg-red-100 text-red-800' },
  not_registered: { label: 'Sin registrar', tone: 'bg-stone-100 text-stone-700' },
  not_connected: { label: 'Email no conectado', tone: 'bg-stone-100 text-stone-700' },
  error: { label: 'Error del proveedor', tone: 'bg-red-100 text-red-800' },
}
const statusLabel = computed(() => STATUS[state.value?.domain?.status ?? '']?.label ?? state.value?.domain?.status ?? '')
const statusTone = computed(() => STATUS[state.value?.domain?.status ?? '']?.tone ?? 'bg-stone-100 text-stone-700')
const domainHint = computed(() => {
  const d = state.value?.domain
  if (!d) return ''
  if (d.verified) return `Listo: los emails de tu empresa salen de ${state.value!.senderAddress}.`
  if (d.status === 'failed') return 'Resend no encuentra los registros. Revisa que estén exactamente como abajo y vuelve a comprobar.'
  if (d.status === 'not_registered') return 'Guarda de nuevo la dirección para registrar el dominio.'
  return 'Publica estos registros en el DNS de tu dominio para poder enviar desde tu dirección.'
})
const recordStatus = (s: string) => (s === 'verified' ? 'Correcto' : s === 'failed' ? 'No encontrado' : 'Pendiente')

function readError(e: any) {
  const err = e?.data?.error
  if (err?.field) {
    errors[err.field] = err.message
    formError.value = err.message
  } else {
    formError.value = e?.data?.statusMessage || 'No se ha podido guardar. Inténtalo de nuevo.'
  }
}

async function save() {
  if (saving.value) return
  for (const k of Object.keys(errors)) errors[k] = ''
  formError.value = ''
  saving.value = true
  try {
    const res = await $fetch<SenderView>('/api/admin/saas/settings', {
      method: 'POST',
      body: { section: 'email-sender', ...(props.organizationId ? { organizationId: props.organizationId } : {}), ...form, internalRecipients: form.internalRecipients },
    })
    apply(res)
    toast.success(res.domain && !res.domain.verified ? 'Remitente guardado. Falta verificar el dominio.' : 'Remitente guardado')
  } catch (e: any) {
    readError(e)
  } finally {
    saving.value = false
  }
}

async function verify() {
  if (verifying.value) return
  formError.value = ''
  verifying.value = true
  try {
    const res = await $fetch<SenderView>('/api/admin/saas/settings', {
      method: 'POST',
      body: { section: 'email-sender', action: 'verify', ...(props.organizationId ? { organizationId: props.organizationId } : {}) },
    })
    apply(res)
    if (res.domain?.verified) toast.success('Dominio verificado: tus emails ya salen de tu dirección')
    else toast.error('Todavía no está verificado. Si acabas de añadir los registros, espera unos minutos.')
  } catch (e: any) {
    readError(e)
  } finally {
    verifying.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copiado')
  } catch {
    toast.error('No se ha podido copiar: selecciónalo a mano.')
  }
}

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
</script>
