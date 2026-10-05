<template>
  <CommsModal title="Resultado de la visita" :sub="[visit.clientName, visit.propertyName].filter(Boolean).join(' — ')" wide test-id="visit-outcome" @close="emit('close')">
    <p class="mb-4 text-xs text-stone-400">Es tu impresión de esta visita concreta — no cambia las características del inmueble ni lo que el cliente dice buscar en sus Necesidades.</p>
    <form class="space-y-5" @submit.prevent="save">
      <section class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="vo-label">¿Cómo quedó? <span class="text-red-500">*</span></span>
          <select v-model="form.outcome" class="vo-input" data-testid="visit-outcome-outcome">
            <option value="" disabled>Elige una opción…</option>
            <option v-for="o in VISIT_OUTCOMES" :key="o" :value="o">{{ VISIT_OUTCOME_LABELS[o] }}</option>
          </select>
        </label>
        <div>
          <span class="vo-label">Interés del cliente (1-5)</span>
          <div class="flex gap-1" data-testid="visit-outcome-interest">
            <button v-for="n in 5" :key="n" type="button" class="h-9 w-9 rounded-lg border text-sm font-medium" :class="form.interestLevel === n ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-stone-400'" @click="form.interestLevel = form.interestLevel === n ? null : n">{{ n }}</button>
          </div>
        </div>
        <label class="block">
          <span class="vo-label">Qué le gustó</span>
          <textarea v-model="form.liked" rows="2" class="vo-input" data-testid="visit-outcome-liked" />
        </label>
        <label class="block">
          <span class="vo-label">Qué no le gustó</span>
          <textarea v-model="form.disliked" rows="2" class="vo-input" data-testid="visit-outcome-disliked" />
        </label>
        <div>
          <span class="vo-label">Percepción del precio</span>
          <div class="flex flex-wrap gap-1" data-testid="visit-outcome-price">
            <button v-for="p in PRICE_PERCEPTIONS" :key="p" type="button" class="rounded-lg border px-3 py-1.5 text-xs font-medium" :class="form.pricePerception === p ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-stone-400'" @click="form.pricePerception = form.pricePerception === p ? null : p">{{ PRICE_PERCEPTION_LABELS[p] }}</button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <label v-for="r in VISIT_RATINGS" :key="r.key" class="block">
            <span class="vo-label">{{ r.label }}</span>
            <select v-model="form[r.key]" class="vo-input !px-2" :data-testid="`visit-outcome-${r.key}`">
              <option :value="null">—</option>
              <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600 sm:col-span-2">
          <label class="flex items-center gap-2"><input v-model="form.wantsSecondVisit" type="checkbox" data-testid="visit-outcome-second">Quiere una segunda visita</label>
          <label class="flex items-center gap-2"><input v-model="form.wantsToOffer" type="checkbox" data-testid="visit-outcome-wants-offer">Quiere ofertar</label>
          <label class="flex items-center gap-2"><input v-model="form.discarded" type="checkbox" data-testid="visit-outcome-discarded">Descarta este inmueble</label>
        </div>
        <label class="block sm:col-span-2">
          <span class="vo-label">Notas</span>
          <textarea v-model="form.notes" rows="2" class="vo-input" placeholder="Qué dijo, qué observaste…" data-testid="visit-outcome-notes" />
        </label>
      </section>

      <section class="space-y-3 rounded-lg border border-line bg-stone-50/60 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Siguientes pasos</p>
        <div>
          <label class="flex items-center gap-2 text-sm text-stone-600"><input v-model="form.followUp" type="checkbox" data-testid="visit-outcome-followup">Crear tarea de seguimiento</label>
          <input v-if="form.followUp" v-model="form.followUpDueAt" type="datetime-local" class="vo-input mt-2" data-testid="visit-outcome-followup-at">
        </div>
        <div v-if="visit.propertyId">
          <label class="flex items-center gap-2 text-sm text-stone-600"><input v-model="form.scheduleSecond" type="checkbox" :disabled="form.discarded" data-testid="visit-outcome-schedule-second">Agendar ya la segunda visita (mismo inmueble y comercial)</label>
          <div v-if="form.scheduleSecond" class="mt-2 grid gap-2 sm:grid-cols-2">
            <input v-model="form.secondAt" type="datetime-local" class="vo-input" data-testid="visit-outcome-second-at">
            <select v-model.number="form.secondDuration" class="vo-input">
              <option v-for="m in [30, 45, 60, 90]" :key="m" :value="m">{{ m }} min</option>
            </select>
          </div>
        </div>
        <div v-if="visit.propertyId">
          <label class="flex items-center gap-2 text-sm text-stone-600"><input v-model="form.createOffer" type="checkbox" :disabled="form.discarded" data-testid="visit-outcome-create-offer">Crear oferta (en borrador)</label>
          <div v-if="form.createOffer" class="mt-2 grid gap-2 sm:grid-cols-2">
            <label class="block"><span class="vo-label">Importe <span class="text-red-500">*</span></span><input v-model.number="form.offerAmount" type="number" min="1" step="1" class="vo-input" data-testid="visit-outcome-offer-amount"></label>
            <label class="block"><span class="vo-label">Vence el</span><input v-model="form.offerExpiration" type="date" class="vo-input"></label>
            <label class="block"><span class="vo-label">Condiciones</span><input v-model="form.offerConditions" class="vo-input" placeholder="Ej. sujeta a tasación"></label>
            <label class="block"><span class="vo-label">Financiación</span><select v-model="form.offerFinance" class="vo-input" data-testid="visit-outcome-offer-finance"><option value="">Sin indicar</option><option v-for="f in OFFER_FINANCE_CONDITIONS" :key="f" :value="f">{{ OFFER_FINANCE_LABELS[f] }}</option></select></label>
            <div v-if="!visit.contactId" class="sm:col-span-2">
              <span class="vo-label">Comprador <span class="text-red-500">*</span></span>
              <EntityPicker v-model="buyer" kind="contact" placeholder="Buscar el contacto del comprador…" test-id="visit-outcome-buyer" />
              <p class="mt-1 text-[11px] text-stone-400">Esta visita no tiene un contacto vinculado: elígelo (o créalo en CRM → Contactos) y quedará vinculado a la visita.</p>
            </div>
          </div>
          <p class="mt-1 text-[11px] text-stone-400">La oferta se crea en borrador con el circuito de ofertas: se revisa y se envía desde la ficha del cliente → «Ofertas».</p>
        </div>
      </section>

      <p v-if="error" class="text-sm font-medium text-red-600" data-testid="visit-outcome-error">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !form.outcome" data-testid="visit-outcome-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar resultado' }}</button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import { PRICE_PERCEPTIONS, PRICE_PERCEPTION_LABELS, VISIT_OUTCOMES, VISIT_OUTCOME_LABELS, VISIT_RATINGS, type PickedEntity } from '~/utils/appointmentCatalog'
import { OFFER_FINANCE_CONDITIONS, OFFER_FINANCE_LABELS } from '~/utils/pipelineCatalog'

/**
 * Resultado estructurado de una visita realizada (FASE 19) —
 * POST /api/admin/saas/visits/:id/outcome. Desde aquí salen acciones
 * reales: tarea de seguimiento, segunda visita ya agendada y oferta en
 * borrador con el servicio de ofertas.
 */
const props = defineProps<{ visit: Record<string, any> }>()
const emit = defineEmits<{ close: []; saved: [result: Record<string, any>] }>()
const v = props.visit
const flag = (x: unknown) => x === 1 || x === true

const form = reactive({
  outcome: v.outcome || '',
  interestLevel: (v.interestLevel ?? null) as number | null,
  liked: v.outcomeLiked || '',
  disliked: v.outcomeDisliked || '',
  pricePerception: (v.pricePerception ?? null) as string | null,
  locationRating: (v.locationRating ?? null) as number | null,
  conditionRating: (v.conditionRating ?? null) as number | null,
  layoutRating: (v.layoutRating ?? null) as number | null,
  wantsSecondVisit: flag(v.wantsSecondVisit),
  wantsToOffer: flag(v.wantsToOffer),
  discarded: flag(v.discarded),
  notes: v.outcomeNotes || '',
  followUp: false,
  followUpDueAt: '',
  scheduleSecond: false,
  secondAt: '',
  secondDuration: 60,
  createOffer: false,
  offerAmount: null as number | null,
  offerExpiration: '',
  offerConditions: '',
  offerFinance: '',
})
const buyer = ref<PickedEntity | null>(null)

watch(
  () => form.discarded,
  (d) => {
    if (d) {
      form.createOffer = false
      form.scheduleSecond = false
      if (form.outcome === 'interested') form.outcome = 'not_interested'
    }
  },
)
watch(
  () => form.createOffer,
  (c) => {
    if (c) form.wantsToOffer = true
  },
)
watch(
  () => form.scheduleSecond,
  (c) => {
    if (c) form.wantsSecondVisit = true
  },
)

const saving = ref(false)
const error = ref('')
const toServer = (s: string) => `${s.replace('T', ' ')}:00`

async function save() {
  error.value = ''
  if (!form.outcome) return
  if (form.followUp && !form.followUpDueAt) return (error.value = 'Indica cuándo hacer el seguimiento')
  if (form.scheduleSecond && !form.secondAt) return (error.value = 'Indica la fecha de la segunda visita')
  if (form.createOffer && !(Number(form.offerAmount) > 0)) return (error.value = 'Indica el importe de la oferta')
  if (form.createOffer && !v.contactId && !buyer.value) return (error.value = 'Elige el contacto del comprador')
  saving.value = true
  try {
    const res = await $fetch<Record<string, any>>(`/api/admin/saas/visits/${v.id}/outcome`, {
      method: 'POST',
      body: {
        outcome: form.outcome,
        interestLevel: form.interestLevel,
        liked: form.liked.trim() || null,
        disliked: form.disliked.trim() || null,
        pricePerception: form.pricePerception,
        locationRating: form.locationRating,
        conditionRating: form.conditionRating,
        layoutRating: form.layoutRating,
        wantsSecondVisit: form.wantsSecondVisit,
        wantsToOffer: form.wantsToOffer,
        discarded: form.discarded,
        notes: form.notes.trim() || null,
        contactId: buyer.value?.id ?? null,
        followUp: form.followUp ? { dueAt: toServer(form.followUpDueAt) } : null,
        secondVisit: form.scheduleSecond ? { scheduledAt: toServer(form.secondAt), durationMinutes: form.secondDuration } : null,
        createOffer: form.createOffer
          ? { amount: Number(form.offerAmount), conditions: form.offerConditions.trim() || null, financeCondition: form.offerFinance || null, expiration: form.offerExpiration || null }
          : null,
      },
    })
    emit('saved', res)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo guardar el resultado'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.vo-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.vo-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>
