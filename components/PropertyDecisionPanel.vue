<template>
  <div class="space-y-5">
    <!-- PRECIO -->
    <div class="rounded-2xl border border-line bg-white p-6">
      <p class="eyebrow">{{ t('decisionPanel.price.eyebrow', 'Precio') }}</p>
      <p class="heading-serif mt-2 text-4xl">{{ formatPrice(project.price) }}</p>

      <div class="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div v-if="priceVariation">
          <p class="text-stone-450">{{ t('decisionPanel.price.variation', 'Variación') }}</p>
          <p class="mt-0.5 font-semibold" :class="priceVariation.dropped ? 'text-emerald-700' : 'text-ink'">{{ priceVariation.text }}</p>
        </div>
        <div v-if="pricePerM2">
          <p class="text-stone-450">{{ t('decisionPanel.price.perM2', 'Precio / m²') }}</p>
          <p class="mt-0.5 font-semibold text-ink">{{ pricePerM2 }}</p>
        </div>
        <div v-if="lastUpdated" class="col-span-2">
          <p class="text-stone-450">{{ t('decisionPanel.price.lastUpdated', 'Última actualización') }}</p>
          <p class="mt-0.5 font-medium text-stone-600">{{ lastUpdated }}</p>
        </div>
      </div>

      <div v-if="paymentRows.length" class="hairline mt-5 pt-4">
        <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-stone-450">{{ t('decisionPanel.price.paymentPlan', 'Plan de pago') }}</p>
        <ul class="space-y-2">
          <li v-for="(r, i) in paymentRows" :key="i" class="flex justify-between text-sm"><span class="text-stone-500">{{ r.label }}</span><span class="font-semibold">{{ r.value }}</span></li>
        </ul>
      </div>
    </div>

    <!-- INDICADORES -->
    <div class="rounded-2xl border border-line bg-white p-6">
      <p class="eyebrow mb-4">{{ t('decisionPanel.indicators.eyebrow', 'Indicadores') }}</p>
      <div v-if="engagementLoading" class="space-y-3">
        <div class="skeleton h-5 w-full rounded" />
        <div class="skeleton h-5 w-4/5 rounded" />
        <div class="skeleton h-5 w-3/5 rounded" />
      </div>
      <ul v-else class="space-y-3 text-[13px]">
        <li v-if="engagement?.viewsThisWeek" class="flex items-center gap-2.5">
          <svg class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="2.5" /></svg>
          <span><strong class="font-semibold text-ink">{{ engagement.viewsThisWeek }}</strong> {{ engagement.viewsThisWeek === 1 ? t('decisionPanel.indicators.viewSingular', 'vista esta semana') : t('decisionPanel.indicators.viewPlural', 'vistas esta semana') }}</span>
        </li>
        <li v-if="engagement?.favoriteCount" class="flex items-center gap-2.5">
          <svg class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z" /></svg>
          <span><strong class="font-semibold text-ink">{{ engagement.favoriteCount }}</strong> {{ engagement.favoriteCount === 1 ? t('decisionPanel.indicators.savedSingular', 'usuario la tiene guardada') : t('decisionPanel.indicators.savedPlural', 'usuarios la tienen guardada') }}</span>
        </li>
        <li v-if="engagement?.visitsBooked" class="flex items-center gap-2.5">
          <svg class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path stroke-linecap="round" d="M16 2.5v4M8 2.5v4M3 9.5h18" /></svg>
          <span><strong class="font-semibold text-ink">{{ engagement.visitsBooked }}</strong> {{ engagement.visitsBooked === 1 ? t('decisionPanel.indicators.visitSingular', 'visita reservada') : t('decisionPanel.indicators.visitPlural', 'visitas reservadas') }}</span>
        </li>
        <li v-if="engagement?.priceDrop" class="flex items-center gap-2.5">
          <svg class="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7l6 6 4-4 8 8M21 13v6h-6" /></svg>
          <span>{{ t('decisionPanel.indicators.droppedPrefix', 'Bajó') }} <strong class="font-semibold text-emerald-700">{{ formatPrice(engagement.priceDrop.amount) }}</strong> {{ t('decisionPanel.indicators.droppedOn', 'el') }} {{ formatDate(engagement.priceDrop.date) }}</span>
        </li>
        <li class="flex items-center gap-2.5">
          <svg class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 3" /></svg>
          <span>{{ agentName }} {{ t('decisionPanel.indicators.respondsFast', 'responde en menos de 15 min') }}</span>
        </li>
        <li v-if="!hasAnyIndicator" class="text-stone-400">{{ t('decisionPanel.indicators.empty', 'Todavía no hay actividad registrada en esta propiedad.') }}</li>
      </ul>
    </div>

    <!-- DECISIÓN RÁPIDA -->
    <div class="rounded-2xl border border-line bg-white p-6">
      <p class="eyebrow">{{ t('decisionPanel.decision.eyebrow', 'Decisión rápida') }}</p>
      <p class="mt-1 text-[12px] text-stone-450">{{ t('decisionPanel.decision.subtitle', 'Cada valoración se calcula a partir de datos reales de la propiedad — nunca es un número arbitrario.') }}</p>
      <div v-if="scoreLoading" class="mt-4 space-y-3">
        <div v-for="i in 5" :key="i" class="skeleton h-10 w-full rounded" />
      </div>
      <ul v-else class="mt-4 space-y-3.5">
        <li v-for="d in decision" :key="d.key">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-ink">{{ d.label }}</span>
            <span v-if="d.stars != null" class="flex items-center gap-0.5">
              <svg v-for="i in 5" :key="i" class="h-3.5 w-3.5" :class="i <= d.stars ? 'text-ink' : 'text-line'" :fill="i <= d.stars ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.4" viewBox="0 0 24 24">
                <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" />
              </svg>
            </span>
            <span v-else class="text-[12px] text-stone-400">—</span>
          </div>
          <p class="mt-0.5 text-[12px] leading-relaxed text-stone-450">{{ d.detail }}</p>
        </li>
      </ul>
    </div>

    <!-- COSTE MENSUAL -->
    <div class="rounded-2xl border border-line bg-white p-6">
      <p class="eyebrow mb-4">{{ t('decisionPanel.monthlyCost.eyebrow', 'Coste mensual estimado') }}</p>
      <ul class="divide-y divide-line">
        <li class="flex items-center justify-between py-2.5 text-sm">
          <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.mortgage', 'Hipoteca estimada') }}</span>
          <span class="font-semibold">{{ formatPrice(monthlyCost.mortgage) }}</span>
        </li>
        <li class="flex items-center justify-between py-2.5 text-sm">
          <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.serviceCharge', 'Comunidad (service charge)') }}</span>
          <span class="font-semibold">{{ monthlyCost.serviceCharge != null ? formatPrice(monthlyCost.serviceCharge) : t('decisionPanel.monthlyCost.consult', 'Consultar') }}</span>
        </li>
        <li class="flex items-center justify-between py-2.5 text-sm">
          <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.insurance', 'Seguro (estimado)') }}</span>
          <span class="font-semibold">{{ formatPrice(monthlyCost.insurance) }}</span>
        </li>
        <li class="flex items-center justify-between py-3 text-sm font-semibold">
          <span>{{ t('decisionPanel.monthlyCost.total', 'Total mensual') }}{{ monthlyCost.serviceCharge == null ? '*' : '' }}</span>
          <span>{{ formatPrice(monthlyCost.total) }}</span>
        </li>
      </ul>
      <p class="mt-2 text-[11px] leading-relaxed text-stone-400">
        {{ t('decisionPanel.monthlyCost.disclaimer', 'Estimado con 20% de entrada, 4.5% de interés y 25 años · sin IBI ni impuesto anual sobre la propiedad, que no existen en Dubái.') }}
        {{ monthlyCost.serviceCharge == null ? t('decisionPanel.monthlyCost.missingServiceCharge', '*Falta el dato de gastos de comunidad de este edificio.') : '' }}
      </p>
    </div>

    <!-- BOTONES -->
    <div class="no-print rounded-2xl border border-line bg-white p-6">
      <NuxtLink
        to="/leadership/perla-maria-melgarejo"
        class="mb-5 flex items-center gap-4 rounded-xl border border-line bg-paper p-4 transition hover:border-ink hover:shadow-sm"
      >
        <img :src="mediaUrl(agentPhoto)" :alt="agentName" class="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white shadow" />
        <div class="min-w-0">
          <p class="eyebrow">{{ t('decisionPanel.footer.attendedBy', 'Atendido por') }}</p>
          <p class="heading-serif mt-1 truncate text-xl leading-tight text-ink">{{ agentName }}</p>
          <p class="mt-0.5 text-[12px] text-stone-500">{{ t('decisionPanel.indicators.respondsFast', 'responde en menos de 15 min') }}</p>
        </div>
      </NuxtLink>
      <div class="space-y-2.5">
        <NuxtLink to="/contact-us" class="btn-primary w-full">{{ t('decisionPanel.cta.requestInfo', 'Solicitar información') }}</NuxtLink>
        <div class="grid grid-cols-2 gap-2.5">
          <button class="agent-btn agent-btn-outline" @click="openVisit('in_person')">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path stroke-linecap="round" d="M16 2.5v4M8 2.5v4M3 9.5h18" /></svg>
            {{ t('decisionPanel.cta.scheduleVisit', 'Agendar visita') }}
          </button>
          <button class="agent-btn agent-btn-outline" @click="openVisit('video')">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.55-2.4A1 1 0 0 1 21 8.5v7a1 1 0 0 1-1.45.9L15 14M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>
            {{ t('decisionPanel.cta.videoCall', 'Videollamada') }}
          </button>
        </div>
        <a :href="whatsappHref" target="_blank" rel="noopener" class="agent-btn agent-btn-whatsapp">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.52 3.63 1.4 5.13L2 22l5.13-1.35a9.9 9.9 0 0 0 4.9 1.28h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.66-.6-2.92-1.26-4.83-4.2-4.98-4.4-.14-.19-1.19-1.58-1.19-3.01s.75-2.13 1.02-2.42c.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.29.7 1.16 1.51 1.88 1.04.93 1.91 1.22 2.2 1.36.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.63-.14.26.09 1.65.78 1.93.92.29.14.48.21.55.33.07.12.07.68-.17 1.36z" /></svg>
          WhatsApp
        </a>
        <div class="grid grid-cols-2 gap-2.5">
          <a :href="`tel:${agentPhone}`" class="agent-btn agent-btn-outline">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            {{ t('decisionPanel.cta.call', 'Llamar') }}
          </a>
          <button class="agent-btn agent-btn-outline" @click="downloadPdf">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v11m0 0l-4-4m4 4l4-4M4 20h16" /></svg>
            {{ t('decisionPanel.cta.downloadPdf', 'Descargar PDF') }}
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2.5">
          <button class="agent-btn agent-btn-outline" @click="doShare">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 3h7v7M21 3L10 14M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" /></svg>
            {{ shared ? '✓' : t('decisionPanel.cta.share', 'Compartir') }}
          </button>
          <button class="agent-btn" :class="fav ? 'agent-btn-active' : 'agent-btn-outline'" @click="toggleFav(project.id)">
            <svg class="h-4 w-4" :fill="fav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z" /></svg>
            {{ t('decisionPanel.cta.save', 'Guardar') }}
          </button>
          <button class="agent-btn" :class="inCompare ? 'agent-btn-active' : 'agent-btn-outline'" @click="doCompare">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3v18M15 3v18M4 8h5M15 8h5M4 16h5M15 16h5" /></svg>
            {{ t('decisionPanel.cta.compare', 'Comparar') }}
          </button>
        </div>
      </div>
    </div>

    <ScheduleVisitModal class="no-print" :open="visitModal.open" :slug="slug" :property-name="project.name" :channel="visitModal.channel" @close="visitModal.open = false" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string; project: any }>()
const project = computed(() => props.project)

const { t } = useI18n()
const { format: formatPrice } = useCurrency()
const { isFavorite, toggle: toggleFav, load: loadFav } = useFavorites()
const { has: hasCompare, toggle: toggleCompare } = useCompare()
onMounted(loadFav)
const fav = computed(() => isFavorite(project.value.id))
const inCompare = computed(() => hasCompare(project.value.id))
function doCompare() {
  const p = project.value
  toggleCompare({ id: p.id, slug: p.slug, name: p.name, cover: p.coverImage, price: p.price })
}
const shared = ref(false)
async function doShare() {
  const url = location.href
  try {
    if (navigator.share) await navigator.share({ title: project.value.name, url })
    else await navigator.clipboard.writeText(url)
    shared.value = true
    setTimeout(() => (shared.value = false), 1600)
  } catch {}
}
function downloadPdf() {
  window.print()
}

const agentName = 'Perla Maria Melgarejo'
const agentPhoto = '68725.png'
const agentPhone = '+971504178823'
const whatsappHref = computed(() => {
  const msg = `${t('decisionPanel.whatsapp.greeting', 'Hola')} ${agentName.split(' ')[0]}, ${t('decisionPanel.whatsapp.interested', 'me interesa')} "${project.value.name}". ${t('decisionPanel.whatsapp.canWeTalk', '¿Podemos hablar?')}`
  return `https://wa.me/${agentPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`
})

const visitModal = reactive<{ open: boolean; channel: 'in_person' | 'video' }>({ open: false, channel: 'in_person' })
function openVisit(channel: 'in_person' | 'video') {
  visitModal.channel = channel
  visitModal.open = true
}

// --- PRECIO ---
const pricePerM2 = computed(() => (project.value.price && project.value.area ? `AED ${new Intl.NumberFormat('en-US').format(Math.round(project.value.price / project.value.area))}` : ''))
const priceVariation = computed(() => {
  const p = project.value
  if (!p.priceOld || p.priceOld === p.price) return null
  const diff = p.price - p.priceOld
  const pct = Math.round((diff / p.priceOld) * 100)
  const dropped = diff < 0
  return { dropped, text: `${dropped ? '−' : '+'}${Math.abs(pct)}% ${t('decisionPanel.price.sinceLaunch', 'desde el lanzamiento')}` }
})
const lastUpdated = computed(() => formatDate(project.value.updatedAt))
function formatDate(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}
const paymentRows = computed<{ label: string; value: string }[]>(() => {
  const p = project.value
  try {
    const parsed = JSON.parse(p.paymentPlan || '[]')
    if (Array.isArray(parsed) && parsed.length) return parsed.map((s: any, i: number) => ({ label: s.label || s.name || `${t('decisionPanel.price.phase', 'Fase')} ${i + 1}`, value: s.value || s.percentage || '' }))
  } catch {}
  const r = []
  if (p.downPercentage) r.push({ label: t('decisionPanel.price.downPayment', 'Entrada'), value: `${p.downPercentage}%` })
  if (p.constructionPercentage) r.push({ label: t('decisionPanel.price.duringConstruction', 'Durante obra'), value: `${p.constructionPercentage}%` })
  if (p.handoverPercentage) r.push({ label: t('decisionPanel.price.onHandover', 'En entrega'), value: `${p.handoverPercentage}%` })
  return r
})

// --- INDICADORES ---
const engagement = ref<{ viewsThisWeek: number; favoriteCount: number; visitsBooked: number; priceDrop: { amount: number; date: string } | null } | null>(null)
const engagementLoading = ref(true)
const hasAnyIndicator = computed(() => !!(engagement.value?.viewsThisWeek || engagement.value?.favoriteCount || engagement.value?.visitsBooked || engagement.value?.priceDrop))
async function fetchEngagement() {
  try {
    engagement.value = await $fetch<any>(`/api/public/properties/${props.slug}/engagement`)
  } catch {
    engagement.value = null
  } finally {
    engagementLoading.value = false
  }
}

// --- DECISIÓN RÁPIDA ---
const decision = ref<{ key: string; label: string; stars: number | null; detail: string }[]>([])
const scoreLoading = ref(true)
async function fetchDecision() {
  try {
    const res = await $fetch<any>(`/api/public/properties/${props.slug}/score`)
    decision.value = res?.decision || []
  } catch {
    decision.value = []
  } finally {
    scoreLoading.value = false
  }
}

onMounted(() => {
  // Fire the two panel fetches without blocking each other; a single load on
  // mount is enough — no repeated polling that would drain battery/CPU/network
  // while the visitor reads the page.
  fetchEngagement()
  fetchDecision()
})

// --- COSTE MENSUAL ---
const monthlyCost = computed(() => {
  const price = project.value.price || 0
  const loan = price * 0.8
  const r = 0.045 / 12
  const n = 25 * 12
  const mortgage = r === 0 ? Math.round(loan / n) : Math.round((loan * r) / (1 - Math.pow(1 + r, -n)))
  const serviceCharge = project.value.serviceChargeAnnual ? Math.round(project.value.serviceChargeAnnual / 12) : null
  const insurance = Math.round((price * 0.002) / 12)
  const total = mortgage + insurance + (serviceCharge || 0)
  return { mortgage, serviceCharge, insurance, total }
})
</script>

<style scoped>
.agent-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.7rem;
  padding: 0.7rem 1rem;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: transform 0.15s ease, background-color 0.2s, opacity 0.2s, border-color 0.2s;
}
.agent-btn:active {
  transform: scale(0.97);
}
.agent-btn-whatsapp {
  width: 100%;
  background: #25d366;
  color: #fff;
}
.agent-btn-whatsapp:hover {
  background: #1fb855;
}
.agent-btn-outline {
  border: 1px solid #e7e4de;
  color: #16150f;
}
.agent-btn-outline:hover {
  border-color: #16150f;
  background: #f7f5f1;
}
.agent-btn-active {
  border: 1px solid #16150f;
  background: #16150f;
  color: #fff;
}
</style>
