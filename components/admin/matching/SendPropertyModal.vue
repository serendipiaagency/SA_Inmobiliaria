<template>
  <AdminCommsModal title="Enviar propiedad por WhatsApp" :sub="`${property.name} → ${contact.name}`" test-id="match-send-modal" @close="emit('close')">
    <!-- Sin teléfono no hay canal: se dice, no se simula un envío. -->
    <p v-if="!phone" class="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800" data-testid="match-send-no-channel">
      {{ contact.name }} no tiene teléfono ni WhatsApp en su ficha, así que no hay ningún canal por el que enviarle la propiedad. Añádelo en su ficha (Contactos → Editar) y vuelve a intentarlo.
    </p>

    <template v-else-if="notConfigured">
      <p class="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800" data-testid="match-send-not-configured">
        No hay ningún número de WhatsApp conectado en esta agencia, así que el panel no puede enviarla por ti y la propiedad <strong>no</strong> queda marcada como enviada. Puedes abrir WhatsApp con el número de {{ contact.name }} y mandarla tú.
      </p>
      <a :href="notConfigured" target="_blank" rel="noopener" class="mt-3 inline-flex rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white">Abrir WhatsApp</a>
    </template>

    <template v-else>
      <p class="text-[13px] text-stone-600">
        Se abre (o se reutiliza) la conversación de WhatsApp con <strong>{{ contact.name }}</strong> ({{ phone }}) en Comunicaciones y se le manda la ficha
        {{ property.kind === 'developer' ? 'con foto y enlace público' : 'con foto y texto (2ª mano no tiene página pública)' }}.
        La compatibilidad sólo pasa a «Enviado» cuando el envío se confirma.
      </p>
      <label class="mt-3 block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Nota (opcional)</span>
        <input v-model="note" class="w-full rounded-lg border border-line px-3 py-2 text-sm" maxlength="500" placeholder="Te paso la que comentamos…" data-testid="match-send-note">
      </label>
      <p v-if="error" class="mt-3 text-[12px] font-medium text-red-600">{{ error }}</p>
    </template>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">{{ phone && !notConfigured ? 'Cancelar' : 'Cerrar' }}</button>
      <button v-if="phone && !notConfigured" type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="sending" data-testid="match-send-confirm" @click="send">
        {{ sending ? 'Enviando…' : 'Enviar por WhatsApp' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import AdminCommsModal from '~/components/admin/comms/Modal.vue'

/**
 * «Enviar propiedad» desde una compatibilidad: el mismo flujo que el botón
 * «Compartir por WhatsApp» de la ficha y que la tool `send_property` de INMO
 * — abre la conversación (POST /api/admin/comms/conversations) y manda la
 * ficha (POST …/share-property) con `buyerRequirementId`, que es lo único que
 * puede marcar el match como enviado, y sólo si el proveedor lo acepta.
 */
const props = defineProps<{
  requirementId: number
  contact: { id: number; name: string; phone?: string | null; whatsapp?: string | null }
  property: { id: number; kind: 'agent' | 'developer'; name: string }
}>()
const emit = defineEmits<{ close: []; sent: [] }>()
const toast = useToast()

const phone = computed(() => props.contact.whatsapp || props.contact.phone || '')
const note = ref('')
const sending = ref(false)
const error = ref('')
const notConfigured = ref('')

async function send() {
  if (!phone.value) return
  sending.value = true
  error.value = ''
  try {
    const conv = await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body: { phone: phone.value } })
    await $fetch(`/api/admin/comms/conversations/${conv.id}/share-property`, {
      method: 'POST',
      body: { propertyId: props.property.id, propertyKind: props.property.kind, buyerRequirementId: props.requirementId, note: note.value.trim() || undefined },
    })
    toast.success('Propiedad enviada por WhatsApp')
    emit('sent')
  } catch (err: any) {
    const data = err?.data?.data
    if (err?.statusCode === 409 && data?.clickToChatUrl) notConfigured.value = data.clickToChatUrl
    else error.value = err?.data?.statusMessage || err?.data?.error || 'No se pudo enviar la propiedad'
  } finally {
    sending.value = false
  }
}
</script>
