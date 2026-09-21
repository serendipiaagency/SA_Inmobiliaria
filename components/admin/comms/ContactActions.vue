<template>
  <div class="flex flex-wrap items-center gap-2" :class="compact ? '' : ''">
    <button
      type="button"
      :class="compact ? 'comms-icon-btn' : 'btn-quiet !py-2'"
      :title="whatsappTitle"
      :disabled="busy !== null || !phone"
      data-testid="contact-whatsapp-button"
      @click="openWhatsApp"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m0 1.67c4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24c-1.53 0-3.03-.42-4.33-1.22l-.31-.18-3.12.82.83-3.04-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.86-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.76 2.67 4.25 3.73.59.27 1.05.42 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.27-.25-.14-1.47-.74-1.69-.82-.23-.08-.37-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.53.07-.26-.13-1.06-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.12-.24-.01-.39.11-.5.11-.11.27-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.11-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43-.14 0-.3-.01-.47-.01" /></svg>
      <span v-if="!compact" class="ml-1.5">{{ busy === 'whatsapp' ? 'Abriendo…' : 'WhatsApp' }}</span>
    </button>
    <button
      type="button"
      :class="compact ? 'comms-icon-btn' : 'btn-quiet !py-2'"
      :title="callTitle"
      :disabled="busy !== null || !phone"
      data-testid="contact-call-button"
      @click="call"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
      <span v-if="!compact" class="ml-1.5">{{ busy === 'call' ? 'Llamando…' : 'Llamar' }}</span>
    </button>
    <a v-if="!compact && phone" :href="`tel:${phone}`" class="text-[11px] text-stone-400 hover:text-ink hover:underline">Marcar con el teléfono</a>

    <AdminCommsCallLogModal v-if="logFor" :contact-id="logFor.contactId" :contact-name="logFor.contactName" @close="logFor = null" @saved="onLogged" />
  </div>
</template>

<script setup lang="ts">
/**
 * Los botones «WhatsApp» y «Llamar» de una ficha (cliente, lead). No
 * duplican lógica: piden al servidor la conversación del contacto y van a
 * Comunicaciones. Cuando la agencia no tiene número conectado, WhatsApp
 * abre el enlace oficial wa.me en la app y lo dice; Llamar usa WhatsApp
 * Calling si el canal lo permite y, si no, marca con el teléfono y ofrece
 * anotar el resultado.
 */
const props = withDefaults(
  defineProps<{
    clientId?: number | null
    leadId?: number | null
    phone?: string | null
    name: string
    compact?: boolean
  }>(),
  { clientId: null, leadId: null, phone: null, compact: false },
)

const toast = useToast()
const comms = useComms()
const voice = useVoiceManager()
const busy = ref<'whatsapp' | 'call' | null>(null)
const logFor = ref<{ contactId: number; contactName: string } | null>(null)

const whatsappTitle = computed(() => (props.phone ? `Escribir por WhatsApp a ${props.name}` : 'Sin teléfono en la ficha'))
const callTitle = computed(() => (props.phone ? `Llamar a ${props.name}` : 'Sin teléfono en la ficha'))

function target() {
  return props.clientId ? { clientId: props.clientId } : props.leadId ? { leadId: props.leadId } : { phone: props.phone }
}

async function openWhatsApp() {
  busy.value = 'whatsapp'
  try {
    const r = await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body: target() })
    await navigateTo(`/admin/comunicaciones?conversation=${r.id}`)
  } catch (e: any) {
    const data = e?.data?.data
    if (e?.statusCode === 409 && data?.clickToChatUrl) {
      window.open(data.clickToChatUrl, '_blank', 'noopener')
      toast.info('No hay ningún número de WhatsApp conectado: se abre la app de WhatsApp. Conecta uno en Configuración → Comunicaciones para tener la bandeja en el panel.', 7000)
    } else {
      toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se pudo abrir la conversación')
    }
  } finally {
    busy.value = null
  }
}

async function call() {
  busy.value = 'call'
  try {
    const overview = await comms.loadOverview()
    const r = await $fetch<{ contact: { id: number; name: string; phone: string } }>('/api/admin/comms/contacts', { method: 'POST', body: target() })
    if (overview?.capabilities.calling) {
      await voice.startCall({ contactId: r.contact.id, contactName: props.name, contactPhone: r.contact.phone })
    } else {
      window.location.href = `tel:${r.contact.phone}`
      logFor.value = { contactId: r.contact.id, contactName: props.name }
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se pudo preparar la llamada')
  } finally {
    busy.value = null
  }
}

function onLogged() {
  logFor.value = null
  toast.success('Llamada registrada')
}
</script>

<style scoped>
.comms-icon-btn {
  @apply flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40;
}
</style>
