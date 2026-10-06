<template>
  <AdminCommsModal title="Enviar selección por WhatsApp" :sub="`«${selection.title}» → ${contactName}`" wide test-id="selection-send-modal" @close="emit('close')">
    <!-- Sin persona o sin teléfono no hay canal: se dice, no se simula un envío. -->
    <p v-if="!selection.contact" class="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800" data-testid="selection-send-no-contact">
      La persona de esta selección ya no está en tus contactos, así que no hay a quién enviársela.
    </p>
    <p v-else-if="!phone" class="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800" data-testid="selection-send-no-channel">
      {{ contactName }} no tiene teléfono ni WhatsApp en su ficha, así que no hay ningún canal por el que enviarle la selección. Añádelo en su ficha (Contactos → Editar) y vuelve a intentarlo.
    </p>

    <template v-else-if="notConfigured">
      <p class="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800" data-testid="selection-send-not-configured">
        No hay ningún número de WhatsApp conectado en esta agencia, así que el panel no puede enviarla por ti y <strong>no</strong> se ha enviado nada. Puedes abrir WhatsApp con el número de {{ contactName }} y mandársela tú.
      </p>
      <a :href="notConfigured" target="_blank" rel="noopener" class="mt-3 inline-flex rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white">Abrir WhatsApp</a>
    </template>

    <template v-else>
      <p class="text-[13px] text-stone-600">
        Se abre (o se reutiliza) la conversación de WhatsApp con <strong>{{ contactName }}</strong> ({{ phone }}) en Comunicaciones y se le manda cada propiedad, en este orden, con su ficha: con foto y enlace público si es de obra nueva, con foto y texto si es de 2ª mano. Cada una sale igual que con «Enviar propiedad», con su nota si la tiene.
        <template v-if="selection.requirement"> Las compatibilidades de «{{ selection.requirement.title || 'su necesidad' }}» sólo pasan a «Enviado» cuando el envío se confirma.</template>
      </p>
      <ol class="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]" data-testid="selection-send-list">
        <li v-for="(it, i) in sendable" :key="it.id" class="flex items-center justify-between gap-2 px-3 py-2" :data-testid="`selection-send-item-${it.id}`">
          <span class="min-w-0 truncate">{{ i + 1 }}. {{ it.name }}</span>
          <span class="shrink-0 text-[12px]" :class="stateClass(results[it.id]?.state)">{{ stateLabel(results[it.id]) }}</span>
        </li>
      </ol>
      <p v-if="skipped.length" class="mt-2 text-[12px] text-stone-500" data-testid="selection-send-skipped">
        No se envían ({{ skipped.length }}): {{ skipped.map((s) => s.name).join(', ') }} — {{ skipped.length === 1 ? 'está' : 'están' }} en la papelera o ya no existe{{ skipped.length === 1 ? '' : 'n' }}.
      </p>
      <p v-if="summary" class="mt-3 text-[13px] font-medium" :class="failedCount ? 'text-red-600' : 'text-emerald-700'" data-testid="selection-send-summary">{{ summary }}</p>
    </template>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">{{ canSend && !finished ? 'Cancelar' : 'Cerrar' }}</button>
      <button v-if="canSend && !finished" type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="sending || !sendable.length" data-testid="selection-send-confirm" @click="send">
        {{ sending ? `Enviando ${sentCount + 1} de ${sendable.length}…` : `Enviar ${sendable.length} ${sendable.length === 1 ? 'propiedad' : 'propiedades'}` }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import AdminCommsModal from '~/components/admin/comms/Modal.vue'

/**
 * Enviar una selección como conjunto (FASE 11, cierre C2). No hay un envío
 * «de selección» aparte: es exactamente el mecanismo real de «Enviar
 * propiedad» (SendPropertyModal y la tool `send_property`) repetido en el
 * orden de la selección — abre la conversación (POST
 * /api/admin/comms/conversations) y manda cada ficha (POST
 * …/share-property, con `buyerRequirementId` si la selección viene de una
 * necesidad, que es lo único que puede dejar un match como enviado, y sólo si
 * el proveedor acepta). Si una falla, se para ahí y se dice cuáles salieron:
 * nunca se da por enviada una que el proveedor no aceptó.
 */
const props = defineProps<{ selection: Record<string, any> }>()
const emit = defineEmits<{ close: []; sent: [count: number] }>()

type SendState = { state: 'sent' | 'failed' | 'sending'; message?: string }

const contactName = computed(() => props.selection.contact?.name || 'el contacto')
const phone = computed(() => props.selection.contact?.whatsapp || props.selection.contact?.phone || '')
const sendable = computed<any[]>(() => (props.selection.items || []).filter((i: any) => !i.trashed && !i.missing))
const skipped = computed<any[]>(() => (props.selection.items || []).filter((i: any) => i.trashed || i.missing))
const canSend = computed(() => Boolean(props.selection.contact && phone.value && !notConfigured.value))

const notConfigured = ref('')
const sending = ref(false)
const finished = ref(false)
const results = reactive<Record<number, SendState>>({})
const sentCount = computed(() => Object.values(results).filter((r) => r.state === 'sent').length)
const failedCount = computed(() => Object.values(results).filter((r) => r.state === 'failed').length)
const summary = computed(() => {
  if (!finished.value) return ''
  if (!failedCount.value) return `Enviadas ${sentCount.value} de ${sendable.value.length}.`
  return `Enviadas ${sentCount.value} de ${sendable.value.length}. El envío se ha parado en la que falló; las siguientes no se han enviado.`
})

function stateLabel(r?: SendState) {
  if (!r) return 'Pendiente'
  if (r.state === 'sending') return 'Enviando…'
  if (r.state === 'sent') return '✓ Enviada'
  return `✕ ${r.message || 'No se pudo enviar'}`
}
function stateClass(state?: SendState['state']) {
  return state === 'sent' ? 'text-emerald-700' : state === 'failed' ? 'text-red-600' : 'text-stone-400'
}
function errorMessage(err: any) {
  return err?.data?.statusMessage || err?.data?.error || err?.data?.message || 'No se pudo enviar'
}

async function send() {
  if (!canSend.value || !sendable.value.length) return
  sending.value = true
  try {
    let conversationId: number
    try {
      conversationId = (await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body: { phone: phone.value } })).id
    } catch (err: any) {
      // Sin número conectado: el servidor devuelve el enlace wa.me — no hay bandeja, y no se finge que la hay.
      const data = err?.data?.data
      if (err?.statusCode === 409 && data?.clickToChatUrl) {
        notConfigured.value = data.clickToChatUrl
        return
      }
      if (sendable.value[0]) results[sendable.value[0].id] = { state: 'failed', message: errorMessage(err) }
      finished.value = true
      return
    }
    for (const item of sendable.value) {
      results[item.id] = { state: 'sending' }
      try {
        await $fetch(`/api/admin/comms/conversations/${conversationId}/share-property`, {
          method: 'POST',
          body: { propertyId: item.propertyId, propertyKind: item.propertyKind, buyerRequirementId: props.selection.requirement?.id ?? undefined, note: item.note || undefined },
        })
        results[item.id] = { state: 'sent' }
      } catch (err: any) {
        results[item.id] = { state: 'failed', message: errorMessage(err) }
        break
      }
    }
    finished.value = true
    if (sentCount.value) emit('sent', sentCount.value)
  } finally {
    sending.value = false
  }
}
</script>
