<template>
  <transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" @click.self="close">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <transition name="sheet" appear>
        <div class="relative flex max-h-[92vh] w-full flex-col bg-white sm:max-h-[86vh] sm:w-[520px] sm:rounded-2xl">
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 class="font-serif text-xl font-medium">{{ channel === 'video' ? t('bookAppointment.titleVideo', 'Agendar videollamada') : t('bookAppointment.title', 'Reservar cita') }}</h2>
            <button class="text-stone-400 transition hover:text-ink" :aria-label="t('scheduleVisit.close', 'Cerrar')" @click="close">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <!-- Step 1: date + slot picker -->
          <div v-if="!sent && step === 'slot'" class="flex-1 overflow-y-auto px-6 py-6">
            <p class="mb-4 text-[13px] text-stone-500">
              {{ t('bookAppointment.with', 'con') }} <span class="font-medium text-ink">{{ agentName }}</span>{{ propertyName ? ` · ${propertyName}` : '' }}
            </p>

            <div v-if="loadingDays" class="py-10 text-center text-sm text-stone-400">{{ t('bookAppointment.loading', 'Cargando disponibilidad…') }}</div>
            <template v-else>
              <div class="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  v-for="d in days"
                  :key="d.date"
                  class="flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs transition"
                  :class="[selectedDate === d.date ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300', !d.slots.length ? 'opacity-40' : '']"
                  :disabled="!d.slots.length"
                  @click="selectedDate = d.date"
                >
                  <span class="font-semibold">{{ weekdayLabel(d.date) }}</span>
                  <span>{{ dayLabel(d.date) }}</span>
                </button>
              </div>

              <div v-if="selectedDaySlots.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
                <button
                  v-for="s in selectedDaySlots"
                  :key="s.start"
                  class="rounded-lg border border-line px-2 py-2 text-[13px] font-medium transition hover:border-ink"
                  @click="chooseSlot(s)"
                >
                  {{ timeLabel(s.start) }}
                </button>
              </div>
              <p v-else class="py-10 text-center text-sm text-stone-400">{{ t('bookAppointment.noSlots', 'Sin huecos disponibles ese día — prueba otra fecha.') }}</p>
            </template>
          </div>

          <!-- Step 2: contact details -->
          <form v-else-if="!sent && step === 'details'" class="flex-1 space-y-4 overflow-y-auto px-6 py-6" @submit.prevent="submit">
            <button type="button" class="mb-1 text-xs font-medium text-stone-400 hover:text-ink" @click="step = 'slot'">← {{ t('bookAppointment.changeSlot', 'Cambiar horario') }}</button>
            <p class="text-[13px] text-stone-500">
              {{ agentName }} — <span class="font-medium text-ink">{{ selectedSlotLabel }}</span>
            </p>
            <div>
              <label class="label" for="book-appt-name">{{ t('scheduleVisit.form.nameLabel', 'Nombre *') }}</label>
              <input id="book-appt-name" v-model="form.name" class="input" required >
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="book-appt-email">{{ t('scheduleVisit.form.emailLabel', 'Email') }}</label>
                <input id="book-appt-email" v-model="form.email" type="email" class="input" >
              </div>
              <div>
                <label class="label" for="book-appt-phone">{{ t('scheduleVisit.form.phoneLabel', 'Teléfono') }}</label>
                <input id="book-appt-phone" v-model="form.phone" class="input" >
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="book-appt-budget">{{ t('bookAppointment.budgetLabel', 'Presupuesto aprox. (AED)') }}</label>
                <input id="book-appt-budget" v-model.number="form.budget" type="number" min="0" class="input" >
              </div>
              <div>
                <label class="label" for="book-appt-interest">{{ t('bookAppointment.interestLabel', '¿Qué buscas?') }}</label>
                <input id="book-appt-interest" v-model="form.interest" class="input" :placeholder="t('bookAppointment.interestPlaceholder', 'Ej: villa 3 hab. para invertir')" >
              </div>
            </div>
            <div>
              <label class="label" for="book-appt-notes">{{ t('scheduleVisit.form.notesLabel', 'Notas') }}</label>
              <textarea id="book-appt-notes" v-model="form.notes" class="input" rows="2" />
            </div>
            <button type="submit" class="btn-primary w-full" :disabled="sending">{{ sending ? t('scheduleVisit.form.sending', 'Enviando…') : t('bookAppointment.confirm', 'Confirmar cita') }}</button>
            <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
          </form>

          <div v-else class="flex-1 px-6 py-14 text-center">
            <p class="font-serif text-2xl">{{ t('bookAppointment.success.title', '¡Cita confirmada!') }}</p>
            <p class="mt-2 text-[14px] text-stone-500">{{ selectedSlotLabel }} — {{ agentName }}</p>
            <a v-if="videoLink" :href="videoLink" target="_blank" rel="noopener" class="mt-4 inline-block text-sm font-medium text-blue-600 underline">{{ t('bookAppointment.joinVideo', 'Enlace de la videollamada') }}</a>
            <p v-if="manageUrl" class="mt-4 text-[12px] text-stone-400">
              {{ t('bookAppointment.manageHint', 'Guarda este enlace para cancelar o cambiar la hora:') }}
              <a :href="manageUrl" class="underline">{{ manageUrl }}</a>
            </p>
            <button class="btn-secondary mt-6" @click="close">{{ t('scheduleVisit.close', 'Cerrar') }}</button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
interface Slot { start: string; end: string }
interface DaySlots { date: string; slots: Slot[] }

const props = defineProps<{ open: boolean; agentSlug: string; agentName: string; propertyId?: number; propertyName?: string; channel?: 'in_person' | 'video' | 'phone' }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const step = ref<'slot' | 'details'>('slot')
const loadingDays = ref(false)
const days = ref<DaySlots[]>([])
const selectedDate = ref('')
const selectedSlot = ref<Slot | null>(null)
const form = reactive({ name: '', email: '', phone: '', notes: '', budget: null as number | null, interest: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref('')
const videoLink = ref('')
const manageUrl = ref('')

const selectedDaySlots = computed(() => days.value.find((d) => d.date === selectedDate.value)?.slots || [])
const selectedSlotLabel = computed(() => (selectedSlot.value ? `${dayLabel(selectedSlot.value.start.slice(0, 10))} · ${timeLabel(selectedSlot.value.start)}` : ''))

async function loadAvailability() {
  loadingDays.value = true
  try {
    const res = await $fetch<{ days: DaySlots[] }>(`/api/public/agents/${props.agentSlug}/availability`, { query: { days: 14 } })
    days.value = res.days
    selectedDate.value = res.days.find((d) => d.slots.length)?.date || res.days[0]?.date || ''
  } catch {
    days.value = []
  } finally {
    loadingDays.value = false
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      step.value = 'slot'
      sent.value = false
      error.value = ''
      selectedSlot.value = null
      form.name = ''
      form.email = ''
      form.phone = ''
      form.notes = ''
      form.budget = null
      form.interest = ''
      videoLink.value = ''
      manageUrl.value = ''
      loadAvailability()
    }
  },
)

function chooseSlot(s: Slot) {
  selectedSlot.value = s
  step.value = 'details'
}

function weekdayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })
}
function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
function timeLabel(startDateTime: string) {
  return startDateTime.slice(11, 16)
}

async function submit() {
  if (!selectedSlot.value) return
  sending.value = true
  error.value = ''
  try {
    const res = await $fetch<{ videoLink?: string; manageUrl?: string }>(`/api/public/agents/${props.agentSlug}/book`, {
      method: 'POST',
      body: { ...form, budget: form.budget || undefined, startAt: selectedSlot.value.start, propertyId: props.propertyId, channel: props.channel },
    })
    videoLink.value = res.videoLink || ''
    manageUrl.value = res.manageUrl || ''
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
