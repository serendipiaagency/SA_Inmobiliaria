<template>
  <div class="border-t border-line bg-white" data-testid="web-composer">
    <!-- Por qué canal real se responde; si no hay ninguno, se dice -->
    <div class="flex flex-wrap items-center gap-1.5 px-4 pt-2 text-[11px]">
      <span class="text-stone-400">Responder por:</span>
      <button
        v-for="opt in options"
        :key="opt.key"
        type="button"
        class="rounded-full border px-2.5 py-0.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
        :class="via === opt.key && !noteMode ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-ink'"
        :disabled="!opt.available"
        :title="opt.reason || ''"
        :data-testid="`web-composer-via-${opt.key}`"
        @click="via = opt.key"
      >
        {{ opt.label }}
      </button>
      <button v-if="reply.whatsapp.available" type="button" class="rounded-full border border-emerald-300 px-2.5 py-0.5 font-medium text-emerald-700 hover:border-emerald-600" data-testid="web-composer-whatsapp" @click="emit('whatsapp')">Continuar por WhatsApp</button>
    </div>
    <p v-if="!anyChannel" class="mx-4 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900" data-testid="web-composer-no-channel">
      No hay ningún canal para responder a este hilo: {{ reasons }} Puedes dejar una nota interna.
    </p>
    <p v-else-if="currentReason" class="px-4 pt-1 text-[11px] text-stone-400">{{ currentReason }}</p>
    <p v-else-if="via === 'chat'" class="px-4 pt-1 text-[11px] text-stone-400">El visitante lo verá en el chat de la web mientras tenga la sesión abierta.</p>
    <p v-else-if="via === 'email'" class="px-4 pt-1 text-[11px] text-stone-400">Se envía a {{ reply.email.to }} con el email de la agencia; el estado de entrega lo confirma el proveedor.</p>

    <div class="flex items-end gap-2 px-3 py-2.5">
      <div class="flex items-center gap-0.5">
        <button type="button" class="composer-btn" title="Compartir una propiedad (con enlace personal si es de obra nueva)" :disabled="!canSend" data-testid="web-composer-property" @click="emit('property', via)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" /></svg>
        </button>
        <button type="button" class="composer-btn" :class="noteMode ? '!bg-amber-100 !text-amber-800' : ''" title="Nota interna (no se envía)" data-testid="web-composer-note-toggle" @click="noteMode = !noteMode">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </div>
      <textarea
        v-model="text"
        rows="2"
        class="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border px-3 py-2 text-[13px] focus:outline-none"
        :class="noteMode ? 'border-amber-300 bg-amber-50 focus:border-amber-500' : 'border-line bg-white focus:border-ink'"
        :placeholder="noteMode ? 'Nota interna: sólo la ve tu equipo' : canSend ? (via === 'email' ? 'Escribe la respuesta por email…' : 'Escribe la respuesta del chat… (Enter envía)') : 'No hay canal para responder'"
        :disabled="(!canSend && !noteMode) || sending"
        data-testid="web-composer-input"
        @keydown.enter.exact="onEnter"
      />
      <button type="button" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40" :class="noteMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-ink hover:bg-black'" :disabled="!text.trim() || sending || (!canSend && !noteMode)" :title="noteMode ? 'Guardar nota' : 'Enviar'" data-testid="web-composer-send" @click="send">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
      </button>
    </div>
    <p v-if="error" class="px-4 pb-2 text-[12px] text-red-600" data-testid="web-composer-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Responder a un hilo web (núcleo N8a): por el chat de la web o por email,
 * sólo si ese canal existe de verdad para este hilo (lo decide el servidor
 * en `reply`, con el motivo cuando no). Las notas internas nunca salen y el
 * widget del visitante no las ve.
 */
interface ReplyOptions {
  email: { available: boolean; to: string | null; reason: string | null }
  chat: { available: boolean; reason: string | null }
  whatsapp: { available: boolean; phone: string | null; reason: string | null }
}
const props = defineProps<{ conversationKey: string; reply: ReplyOptions }>()
const emit = defineEmits<{ sent: [message: any]; property: [via: 'chat' | 'email']; whatsapp: [] }>()

const via = ref<'chat' | 'email'>(props.reply.chat.available ? 'chat' : 'email')
const text = ref('')
const noteMode = ref(false)
const sending = ref(false)
const error = ref('')

const options = computed(() => [
  { key: 'chat' as const, label: 'Chat web', available: props.reply.chat.available, reason: props.reply.chat.reason },
  { key: 'email' as const, label: 'Email', available: props.reply.email.available, reason: props.reply.email.reason },
])
const anyChannel = computed(() => props.reply.chat.available || props.reply.email.available)
const canSend = computed(() => (via.value === 'chat' ? props.reply.chat.available : props.reply.email.available))
const currentReason = computed(() => (canSend.value ? null : via.value === 'chat' ? props.reply.chat.reason : props.reply.email.reason))
const reasons = computed(() => [props.reply.chat.reason && `chat: ${props.reply.chat.reason}`, props.reply.email.reason && `email: ${props.reply.email.reason}`].filter(Boolean).join(' · '))

function onEnter(e: KeyboardEvent) {
  // En el chat, Enter envía (como en el resto de la bandeja); en un email, Enter es salto de línea.
  if (via.value === 'chat' || noteMode.value) {
    e.preventDefault()
    send()
  }
}

async function send() {
  const body = text.value.trim()
  if (!body || sending.value) return
  error.value = ''
  sending.value = true
  try {
    if (noteMode.value) {
      const r = await $fetch<{ message: any }>(`/api/admin/comms/conversations/${props.conversationKey}/notes`, { method: 'POST', body: { body } })
      emit('sent', r.message)
    } else {
      const r = await $fetch<{ ok: boolean; message: any; error?: string }>(`/api/admin/comms/conversations/${props.conversationKey}/messages`, { method: 'POST', body: { type: 'text', via: via.value, body } })
      if (r.message) emit('sent', r.message)
      if (!r.ok) error.value = r.error || 'No se pudo enviar'
    }
    text.value = ''
  } catch (e: any) {
    // 502 con cuerpo: el mensaje quedó en el hilo como fallido.
    if (e?.data?.message) emit('sent', e.data.message)
    error.value = e?.data?.statusMessage || e?.data?.error || e?.statusMessage || 'No se pudo enviar'
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.composer-btn {
  @apply flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
