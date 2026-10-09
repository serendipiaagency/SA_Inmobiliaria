<template>
  <section class="pcard" data-testid="ficha-price-card">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div class="min-w-0">
        <span class="eyebrow">{{ t('decisionPanel.price.eyebrow', 'Precio') }}</span>
        <p class="mt-3 whitespace-nowrap text-[28px] font-bold leading-none tracking-tight text-ink sm:text-[30px]" data-testid="ficha-price">{{ formatPrice(project.price) }}</p>
        <p v-if="pricePerM2" class="mt-2 text-[14px] text-stone-500" data-testid="ficha-price-m2">{{ pricePerM2 }} / m²</p>
      </div>
      <!-- Evolución sólo con cambios de precio reales (utils/priceTrend.ts). -->
      <div v-if="trend" class="flex shrink-0 items-center gap-2 rounded-xl bg-[#fdf3ea] px-3 py-2" data-testid="ficha-price-trend">
        <svg width="46" height="26" viewBox="0 0 46 26" fill="none" aria-hidden="true">
          <path :d="sparklinePath(trend.points, 46, 26, 3)" stroke="#e8792b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="leading-tight">
          <span class="block text-[13px] font-bold" :class="trend.pct < 0 ? 'text-[#d9532b]' : 'text-[#c2622d]'">{{ trend.pct > 0 ? '+' : '' }}{{ trend.pct }}%</span>
          <span class="block whitespace-nowrap text-[11px] text-stone-500">{{ trend.since ? `${t('ficha.priceSince', 'desde')} ${sinceLabel}` : t('ficha.priceBefore', 'frente al anterior') }}</span>
        </span>
      </div>
    </div>

    <ul v-if="paymentRows.length" class="mt-4 space-y-1.5 border-t border-[#f1eee8] pt-3 text-[13px]" data-testid="ficha-payment-plan">
      <li v-for="(r, i) in paymentRows" :key="i" class="flex justify-between gap-3"><span class="text-stone-500">{{ r.label }}</span><span class="font-semibold text-ink">{{ r.value }}</span></li>
    </ul>

    <!-- Próxima visita disponible: el primer hueco real de la agenda del comercial; abre la reserva. -->
    <div class="no-print mt-5">
      <PropertyNextVisitSlot :agent-slug="agentSlug" @book="(start) => emit('book', start)" @state="onVisitState" />
      <!-- La videollamada sólo con un hueco real en la agenda: sin él, la reserva no tendría horas que ofrecer. -->
      <button v-if="agentSlug && visitState === 'slot'" type="button" class="mt-3 inline-flex items-center gap-2 text-[12.5px] font-medium text-stone-500 hover:text-ink" data-testid="ficha-video-visit" @click="emit('video')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 10l4.55-2.4A1 1 0 0 1 21 8.5v7a1 1 0 0 1-1.45.9L15 14M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>
        {{ t('ficha.videoVisit', '¿Prefieres verla por videollamada?') }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { priceTrend, sparklinePath, type PriceHistoryPoint } from '~/utils/priceTrend'

/**
 * Tarjeta PRECIO de la ficha (#111): precio, precio por m², la evolución
 * (sólo con historial de precio real) y «Próxima visita disponible». La
 * misma tarjeta sale arriba en el móvil y en la columna derecha en
 * escritorio; el historial se pide una vez (usePropertyInsight).
 */
const props = defineProps<{
  slug: string
  project: { price?: number | null; priceOld?: number | null; area?: number | null; paymentPlan?: string | null; downPercentage?: number | string | null; constructionPercentage?: number | string | null; handoverPercentage?: number | string | null }
  agentSlug?: string | null
}>()
const emit = defineEmits<{ book: [start: string]; video: []; visitState: [state: 'loading' | 'slot' | 'none'] }>()

const { t, intlLocale } = useI18n()
// En la moneda que ve el visitante, como el resto de importes de la ficha (utils/currency.ts).
const { format: formatPrice } = useCurrency()

const visitState = ref<'loading' | 'slot' | 'none'>('loading')
function onVisitState(s: 'loading' | 'slot' | 'none') {
  visitState.value = s
  emit('visitState', s)
}

const pricePerM2 = computed(() => (props.project.price && props.project.area ? formatPrice(Math.round(props.project.price / props.project.area)) : ''))

const history = usePropertyInsight<{ history: PriceHistoryPoint[] }>(props.slug, 'price-history')
// Sin historial, el «precio anterior» que la agencia dejó en la propiedad, si es distinto.
const trend = computed(() => {
  const fromHistory = priceTrend(history.value.data?.history, props.project.price)
  if (fromHistory) return fromHistory
  const before = Number(props.project.priceOld)
  const now = Number(props.project.price)
  if (!(before > 0) || !(now > 0) || before === now) return null
  return { pct: Math.round(((now - before) / before) * 100), since: '', points: [before, now] }
})
const sinceLabel = computed(() => {
  if (!trend.value) return ''
  const d = new Date(`${trend.value.since.slice(0, 10)}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(intlLocale.value, { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('.', '')
})

const paymentRows = computed<{ label: string; value: string }[]>(() => {
  const p = props.project
  try {
    const parsed = JSON.parse(p.paymentPlan || '[]')
    if (Array.isArray(parsed) && parsed.length) return parsed.map((s: any, i: number) => ({ label: s.label || s.name || `${t('decisionPanel.price.phase', 'Fase')} ${i + 1}`, value: String(s.value || s.percentage || '') }))
  } catch {
    // Plan de pagos mal guardado: se usan los porcentajes sueltos de abajo.
  }
  const r: { label: string; value: string }[] = []
  if (p.downPercentage) r.push({ label: t('decisionPanel.price.downPayment', 'Entrada'), value: `${p.downPercentage}%` })
  if (p.constructionPercentage) r.push({ label: t('decisionPanel.price.duringConstruction', 'Durante obra'), value: `${p.constructionPercentage}%` })
  if (p.handoverPercentage) r.push({ label: t('decisionPanel.price.onHandover', 'En entrega'), value: `${p.handoverPercentage}%` })
  return r
})
</script>
