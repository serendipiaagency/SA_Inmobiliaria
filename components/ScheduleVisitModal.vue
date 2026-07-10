<template>
  <transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" @click.self="close">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <transition name="sheet" appear>
        <div class="relative flex max-h-[92vh] w-full flex-col bg-white sm:max-h-[86vh] sm:w-[480px] sm:rounded-2xl">
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 class="font-serif text-xl font-medium">{{ channel === 'video' ? t('scheduleVisit.titleVideo', 'Agendar videollamada') : t('scheduleVisit.titleInPerson', 'Agendar visita') }}</h2>
            <button class="text-stone-400 transition hover:text-ink" :aria-label="t('scheduleVisit.close', 'Cerrar')" @click="close">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <form v-if="!sent" class="flex-1 space-y-4 overflow-y-auto px-6 py-6" @submit.prevent="submit">
            <p class="text-[13px] text-stone-500">{{ propertyName }} — {{ channel === 'video' ? t('scheduleVisit.subtitleVideo', 'te llamamos por videollamada en el horario que prefieras.') : t('scheduleVisit.subtitleInPerson', 'te recibimos en persona en el horario que prefieras.') }}</p>
            <div>
              <label class="label">{{ t('scheduleVisit.form.nameLabel', 'Nombre *') }}</label>
              <input v-model="form.name" class="input" required />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">{{ t('scheduleVisit.form.emailLabel', 'Email') }}</label>
                <input v-model="form.email" type="email" class="input" />
              </div>
              <div>
                <label class="label">{{ t('scheduleVisit.form.phoneLabel', 'Teléfono') }}</label>
                <input v-model="form.phone" class="input" />
              </div>
            </div>
            <div>
              <label class="label">{{ t('scheduleVisit.form.dateLabel', 'Fecha y hora preferida *') }}</label>
              <input v-model="form.scheduledAt" type="datetime-local" class="input" required />
            </div>
            <div>
              <label class="label">{{ t('scheduleVisit.form.notesLabel', 'Notas') }}</label>
              <textarea v-model="form.notes" class="input" rows="2" />
            </div>
            <button type="submit" class="btn-primary w-full" :disabled="sending">{{ sending ? t('scheduleVisit.form.sending', 'Enviando…') : t('scheduleVisit.form.confirm', 'Confirmar') }}</button>
            <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
          </form>

          <div v-else class="flex-1 px-6 py-14 text-center">
            <p class="font-serif text-2xl">{{ t('scheduleVisit.success.title', '¡Solicitud enviada!') }}</p>
            <p class="mt-2 text-[14px] text-stone-500">{{ t('scheduleVisit.success.textPrefix', 'Te confirmaremos la') }} {{ channel === 'video' ? t('scheduleVisit.success.video', 'videollamada') : t('scheduleVisit.success.visit', 'visita') }} {{ t('scheduleVisit.success.textSuffix', 'en breve.') }}</p>
            <button class="btn-secondary mt-6" @click="close">{{ t('scheduleVisit.close', 'Cerrar') }}</button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
const props = defineProps<{ open: boolean; slug: string; propertyName: string; channel: 'in_person' | 'video' }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const form = reactive({ name: '', email: '', phone: '', scheduledAt: '', notes: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref('')

watch(() => props.open, (v) => {
  if (v) {
    sent.value = false
    error.value = ''
  }
})

async function submit() {
  sending.value = true
  error.value = ''
  try {
    await $fetch(`/api/public/properties/${props.slug}/schedule-visit`, {
      method: 'POST',
      body: { ...form, channel: props.channel },
    })
    sent.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || t('scheduleVisit.error', 'No se pudo enviar. Inténtalo de nuevo.')
  } finally {
    sending.value = false
  }
}
function close() {
  emit('close')
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active { transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.32s; }
.sheet-enter-from { transform: translateY(24px); opacity: 0; }
@media (min-width: 640px) {
  .sheet-enter-from { transform: translateY(12px) scale(0.98); }
}
</style>
