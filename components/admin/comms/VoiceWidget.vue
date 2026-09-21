<template>
  <ClientOnly>
    <!-- Llamada entrante -->
    <Teleport to="body">
      <div v-if="state.incoming" class="fixed inset-x-0 bottom-4 z-[9500] flex justify-center px-4 sm:inset-x-auto sm:right-6" data-testid="voice-incoming">
        <div class="w-full max-w-sm rounded-2xl border border-line bg-white p-4 shadow-2xl">
          <p class="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">Llamada entrante · WhatsApp</p>
          <p class="mt-1 truncate text-[15px] font-semibold text-ink">{{ state.incoming.contactName }}</p>
          <p class="text-[12px] text-stone-500">{{ state.incoming.contactPhone }}</p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700" data-testid="voice-accept" @click="voice.acceptIncoming()">Contestar</button>
            <button type="button" class="flex-1 rounded-full bg-red-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-red-700" data-testid="voice-reject" @click="voice.rejectIncoming()">Rechazar</button>
            <button type="button" class="rounded-full border border-line px-3 py-2 text-[12px] text-stone-500 hover:text-ink" title="Ignorar" @click="voice.dismissIncoming()">✕</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Llamada en curso / terminada -->
    <Teleport to="body">
      <div v-if="state.status !== 'idle' && state.call" class="fixed bottom-4 right-4 z-[9400] w-[calc(100%-2rem)] sm:w-80" data-testid="voice-widget">
        <div class="overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
          <div class="flex items-center gap-3 px-4 py-3" :class="active ? 'bg-ink text-white' : 'bg-stone-50 text-ink'">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" :class="active ? 'bg-white/10' : 'bg-white ring-1 ring-line'">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-semibold">{{ state.call.contactName }}</p>
              <p class="text-[11px] opacity-70" data-testid="voice-status">{{ statusLabel }}</p>
            </div>
            <button v-if="active" type="button" class="rounded-lg p-1 opacity-70 hover:opacity-100" :title="state.minimized ? 'Ampliar' : 'Minimizar'" @click="state.minimized = !state.minimized">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" :d="state.minimized ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'" /></svg>
            </button>
            <button v-else type="button" class="rounded-lg p-1 text-stone-400 hover:text-ink" title="Cerrar" @click="voice.dismiss()">✕</button>
          </div>
          <div v-if="!state.minimized" class="px-4 py-3">
            <p v-if="state.error" class="mb-2 text-[12px] text-red-600">{{ state.error }}</p>
            <div v-if="active" class="flex items-center gap-2">
              <button type="button" class="flex-1 rounded-full border px-3 py-2 text-[12px] font-medium" :class="state.muted ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-line text-stone-600 hover:border-ink'" @click="voice.toggleMute()">{{ state.muted ? 'Micro apagado' : 'Silenciar' }}</button>
              <button type="button" class="flex-1 rounded-full bg-red-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-red-700" data-testid="voice-hangup" @click="voice.hangup()">Colgar</button>
            </div>
            <div v-else-if="state.pendingLog" class="flex items-center gap-2">
              <button type="button" class="flex-1 rounded-full bg-ink px-3 py-2 text-[12px] font-semibold text-white" data-testid="voice-log-outcome" @click="logOpen = true">Anotar resultado</button>
              <button type="button" class="rounded-full border border-line px-3 py-2 text-[12px] text-stone-500" @click="voice.clearPendingLog(); voice.dismiss()">Omitir</button>
            </div>
            <NuxtLink v-if="state.call.conversationId" :to="`/admin/comunicaciones?conversation=${state.call.conversationId}`" class="mt-2 block text-[11px] text-stone-400 hover:text-ink hover:underline">Abrir conversación</NuxtLink>
          </div>
        </div>
      </div>
    </Teleport>

    <AdminCommsCallLogModal v-if="logOpen && state.pendingLog" :call-id="state.pendingLog.callId" :conversation-id="state.pendingLog.conversationId" :contact-name="state.pendingLog.contactName" @close="logOpen = false" @saved="onLogged" />
  </ClientOnly>
</template>

<script setup lang="ts">
/**
 * El widget global de voz: aviso de llamada entrante, la llamada en curso
 * (minimizable, sobrevive a la navegación porque el estado vive en
 * useVoiceManager) y, al colgar, el paso de anotar el resultado.
 */
const voice = useVoiceManager()
const comms = useComms()
const toast = useToast()
const { state, active } = voice
const logOpen = ref(false)

const elapsed = ref('')
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (state.value.startedAt && active.value) {
      const s = Math.floor((Date.now() - state.value.startedAt) / 1000)
      elapsed.value = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    }
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const statusLabel = computed(() => {
  switch (state.value.status) {
    case 'requesting_mic':
      return 'Pidiendo micrófono…'
    case 'dialing':
      return 'Llamando…'
    case 'ringing':
      return 'Sonando…'
    case 'connecting':
      return 'Conectando…'
    case 'in_call':
      return `En llamada · ${elapsed.value || '00:00'}`
    case 'ended':
      return state.value.startedAt ? `Terminada · ${elapsed.value}` : 'Terminada'
    case 'failed':
      return 'No se pudo llamar'
    default:
      return ''
  }
})

// Las llamadas entrantes y los cambios de estado llegan por el sondeo general.
watch(
  () => comms.updates.value,
  (u) => {
    if (!u) return
    voice.syncIncoming(u.incomingCalls)
    for (const c of u.calls || []) voice.applyServerCall(c)
  },
)

function onLogged() {
  logOpen.value = false
  voice.clearPendingLog()
  voice.dismiss()
  toast.success('Resultado guardado')
}
</script>
