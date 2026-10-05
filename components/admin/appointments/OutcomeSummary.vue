<template>
  <div v-if="v.outcome || offers.length" class="flex flex-wrap items-center gap-1 text-[11px]" data-testid="outcome-summary">
    <span v-if="v.outcome" class="rounded px-1.5 py-0.5 font-medium" :class="outcomeClass">{{ visitOutcomeLabel(v.outcome) }}</span>
    <span v-if="v.interestLevel" class="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">Interés {{ v.interestLevel }}/5</span>
    <template v-if="!compact">
      <span v-if="v.pricePerception" class="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">Precio: {{ PRICE_PERCEPTION_LABELS[v.pricePerception] || v.pricePerception }}</span>
      <span v-for="r in ratings" :key="r.label" class="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{{ r.label }} {{ r.value }}/5</span>
    </template>
    <span v-if="flag(v.wantsSecondVisit)" class="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">2ª visita</span>
    <span v-if="flag(v.wantsToOffer)" class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Quiere ofertar</span>
    <span v-if="flag(v.discarded)" class="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Descartado</span>
    <NuxtLink
      v-for="o in offers" :key="o.id" :to="v.contactId ? `/admin/contactos/${v.contactId}?tab=ofertas` : '/admin/visitas'"
      class="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 hover:underline" :title="`Oferta #${o.id}`" data-testid="outcome-summary-offer"
    >
      Oferta {{ money(o.amount, o.currency) }} · {{ OFFER_STATUS_LABELS[o.status] || o.status }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { PRICE_PERCEPTION_LABELS, VISIT_RATINGS, visitOutcomeLabel } from '~/utils/appointmentCatalog'

/** Resumen del resultado estructurado de una visita (FASE 19) y de sus ofertas, para la Lista, los Tours y la ficha de la cita. */
const props = withDefaults(defineProps<{ v: Record<string, any>; compact?: boolean }>(), { compact: false })
const OFFER_STATUS_LABELS: Record<string, string> = { draft: 'borrador', submitted: 'enviada', countered: 'contraoferta', accepted: 'aceptada', rejected: 'rechazada', withdrawn: 'retirada', expired: 'vencida' }
const flag = (x: unknown) => x === 1 || x === true
const offers = computed<any[]>(() => props.v.offers || [])
const ratings = computed(() => VISIT_RATINGS.map((r) => ({ label: r.label, value: props.v[r.key] })).filter((r) => r.value))
const outcomeClass = computed(() => ({ interested: 'bg-emerald-50 text-emerald-700', wants_to_think: 'bg-amber-50 text-amber-700', not_interested: 'bg-stone-100 text-stone-600' })[props.v.outcome as string] || 'bg-stone-100 text-stone-600')
function money(n: number, currency = 'eur') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${n} ${currency}`
  }
}
</script>
