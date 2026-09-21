<template>
  <div class="border-t border-line bg-white" data-testid="comms-composer">
    <!-- Avisos que explican por qué no se puede escribir -->
    <div v-if="blocked" class="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-[12px] text-amber-900" data-testid="composer-blocked">
      <span>{{ blocked }}</span>
      <button v-if="canTemplate && !optedOut && channelActive" type="button" class="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white" data-testid="composer-open-templates" @click="emit('template')">Enviar plantilla</button>
    </div>
    <div v-else-if="window.open && window.expiresAt" class="px-4 pt-2 text-[11px] text-stone-400">Ventana de 24 h abierta hasta {{ dt.dateTime(window.expiresAt) }}.</div>

    <div class="flex items-end gap-2 px-3 py-2.5">
      <div class="flex items-center gap-0.5">
        <button type="button" class="composer-btn" title="Adjuntar imagen o PDF" :disabled="!canSendFree || !capabilities.media || uploading" data-testid="composer-attach" @click="fileInput?.click()">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <input ref="fileInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" @change="onFile">
        <button type="button" class="composer-btn" title="Compartir una propiedad" :disabled="!canSendFree" data-testid="composer-property" @click="emit('property')">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" /></svg>
        </button>
        <button type="button" class="composer-btn" title="Enviar plantilla" :disabled="!canTemplate || optedOut || !channelActive" data-testid="composer-template" @click="emit('template')">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" /></svg>
        </button>
        <button type="button" class="composer-btn" :class="noteMode ? '!bg-amber-100 !text-amber-800' : ''" title="Nota interna (no se envía)" data-testid="composer-note-toggle" @click="noteMode = !noteMode">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </div>
      <textarea
        ref="input"
        v-model="text"
        rows="1"
        class="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border px-3 py-2 text-[13px] focus:outline-none"
        :class="noteMode ? 'border-amber-300 bg-amber-50 focus:border-amber-500' : 'border-line bg-white focus:border-ink'"
        :placeholder="noteMode ? 'Nota interna: sólo la ve tu equipo' : canSendFree ? 'Escribe un mensaje… (Enter envía, Shift+Enter salto de línea)' : 'No se puede escribir texto libre ahora'"
        :disabled="(!canSendFree && !noteMode) || sending"
        data-testid="comms-composer-input"
        @keydown.enter.exact.prevent="send"
        @input="autosize"
      />
      <button type="button" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40" :class="noteMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-ink hover:bg-black'" :disabled="!text.trim() || sending || (!canSendFree && !noteMode)" :title="noteMode ? 'Guardar nota' : 'Enviar'" data-testid="comms-send" @click="send">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
      </button>
    </div>
    <p v-if="uploading" class="px-4 pb-2 text-[11px] text-stone-500">Subiendo archivo…</p>
    <p v-if="error" class="px-4 pb-2 text-[12px] text-red-600" data-testid="composer-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * El cuadro de escritura del hilo. Sabe por qué no se puede enviar (ventana
 * de 24 h cerrada, contacto dado de baja, canal parado) y lo dice en vez de
 * dejar que el proveedor lo rechace; las plantillas quedan disponibles
 * cuando son la única salida. Las notas internas nunca salen.
 */
const props = defineProps<{
  conversationId: number
  window: { open: boolean; expiresAt: string | null }
  consentStatus: string
  channelActive: boolean
  capabilities: { messaging: boolean; media: boolean; templates: boolean }
  templatesCount: number
}>()
const emit = defineEmits<{ sent: [message: any]; template: []; property: [] }>()
const dt = useDash()
const text = ref('')
const noteMode = ref(false)
const sending = ref(false)
const uploading = ref(false)
const error = ref('')
const input = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const optedOut = computed(() => props.consentStatus === 'opted_out')
const canTemplate = computed(() => props.capabilities.templates && props.templatesCount > 0)
const canSendFree = computed(() => props.channelActive && props.capabilities.messaging && props.window.open && !optedOut.value)
const blocked = computed(() => {
  if (!props.channelActive) return 'El número de este hilo está desactivado: no se puede enviar nada.'
  if (optedOut.value) return 'Este contacto pidió no recibir mensajes (baja). Sólo se reanuda si vuelve a escribir o cambias su consentimiento a mano.'
  if (!props.window.open) return props.window.expiresAt ? 'Han pasado más de 24 h desde su último mensaje: WhatsApp sólo permite plantillas aprobadas.' : 'Este contacto aún no os ha escrito: la conversación sólo puede empezar con una plantilla aprobada.'
  return ''
})

function autosize() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

async function send() {
  const body = text.value.trim()
  if (!body || sending.value) return
  error.value = ''
  sending.value = true
  try {
    if (noteMode.value) {
      const r = await $fetch<{ message: any }>(`/api/admin/comms/conversations/${props.conversationId}/notes`, { method: 'POST', body: { body } })
      emit('sent', r.message)
    } else {
      const r = await $fetch<{ ok: boolean; message: any; error?: string }>(`/api/admin/comms/conversations/${props.conversationId}/messages`, { method: 'POST', body: { type: 'text', body } })
      if (r.message) emit('sent', r.message)
      if (!r.ok) error.value = r.error || 'El proveedor rechazó el mensaje'
    }
    text.value = ''
    await nextTick()
    autosize()
  } catch (e: any) {
    // 502 con cuerpo: el mensaje quedó en el hilo como fallido.
    if (e?.data?.message) emit('sent', e.data.message)
    error.value = e?.data?.statusMessage || e?.data?.error || e?.statusMessage || 'No se pudo enviar'
  } finally {
    sending.value = false
  }
}

async function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  error.value = ''
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('folder', 'comms')
    const up = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: form })
    const type = file.type.startsWith('image/') ? 'image' : 'document'
    const r = await $fetch<{ ok: boolean; message: any; error?: string }>(`/api/admin/comms/conversations/${props.conversationId}/messages`, {
      method: 'POST',
      body: { type, mediaKey: up.key, caption: text.value.trim() || undefined, filename: file.name },
    })
    if (r.message) emit('sent', r.message)
    if (!r.ok) error.value = r.error || 'El proveedor rechazó el archivo'
    else text.value = ''
  } catch (e: any) {
    if (e?.data?.message) emit('sent', e.data.message)
    error.value = e?.data?.statusMessage || e?.data?.error || e?.statusMessage || 'No se pudo enviar el archivo'
  } finally {
    uploading.value = false
  }
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<style scoped>
.composer-btn {
  @apply flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
