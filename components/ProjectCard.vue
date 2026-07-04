<template>
  <div class="group relative" @mouseenter="onEnter" @mouseleave="onLeave">
    <!-- Media -->
    <div class="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100">
      <!-- Slides -->
      <div
        v-for="(ph, i) in photos"
        :key="i"
        class="absolute inset-0 transition-opacity duration-500"
        :style="{ opacity: i === index ? 1 : 0 }"
      >
        <img
          :src="mediaUrl(ph)"
          :alt="`${project.name} — ${i + 1}`"
          class="h-full w-full object-cover transition-transform duration-[1200ms] ease-out"
          :class="{ 'scale-105': hovering }"
          loading="lazy"
        />
      </div>
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

      <!-- Stretched navigation link -->
      <NuxtLink :to="to" class="absolute inset-0 z-10" :aria-label="project.name" />

      <!-- Badges (top-left) -->
      <div class="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[75%] flex-wrap gap-1.5">
        <span v-for="b in badges" :key="b.text" class="badge" :class="b.cls">{{ b.text }}</span>
      </div>

      <!-- Actions (top-right) -->
      <div class="absolute right-3 top-3 z-20 flex gap-1.5">
        <button type="button" class="act" :class="{ 'act-on': fav }" :aria-label="fav ? t('card.saved') : t('card.save')" @click="onFav">
          <svg class="h-4 w-4" :fill="fav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z" />
          </svg>
        </button>
        <button type="button" class="act" :class="{ 'act-on': inCompare }" aria-label="Comparar" @click="onCompare">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 3v18M15 3v18M4 8h5M15 8h5M4 16h5M15 16h5" />
          </svg>
        </button>
        <button type="button" class="act" aria-label="Compartir" @click="onShare">
          <svg v-if="!shared" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
          </svg>
          <svg v-else class="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      <!-- Carousel arrows (hover, desktop) -->
      <template v-if="photos.length > 1">
        <button type="button" class="nav-arrow left-2" aria-label="Anterior" @click="step(-1)">‹</button>
        <button type="button" class="nav-arrow right-2" aria-label="Siguiente" @click="step(1)">›</button>
        <div class="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5">
          <span
            v-for="(p, i) in photos"
            :key="i"
            class="h-1.5 rounded-full bg-white/90 transition-all"
            :class="i === index ? 'w-4' : 'w-1.5 bg-white/60'"
          />
        </div>
      </template>

      <!-- Meta chips (bottom-left) -->
      <div class="pointer-events-none absolute bottom-3 left-3 z-20 flex gap-1.5">
        <span v-if="project.hasTour" class="chip-glass"><span class="mr-1">◐</span>{{ t('badge.tour') }}</span>
        <span v-if="project.aiSummary" class="chip-glass">{{ t('badge.ai') }}</span>
      </div>
    </div>

    <!-- Info -->
    <div class="pt-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="flex items-baseline gap-2">
            <span class="text-lg font-semibold tracking-tight">{{ formatPrice(project.price) }}</span>
            <span v-if="priceDrop" class="text-xs font-semibold text-emerald-600">−{{ priceDrop }}%</span>
          </p>
          <p v-if="pricePerM2" class="text-[12px] text-stone-400">{{ pricePerM2 }} / m²</p>
        </div>
        <span v-if="project.rentalYield" class="shrink-0 rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink ring-1 ring-line">
          {{ project.rentalYield }}% rent.
        </span>
      </div>

      <h3 class="mt-1 truncate font-serif text-xl font-medium">{{ project.name }}</h3>
      <p class="mt-0.5 truncate text-[13px] text-stone-500">
        <span v-if="project.community">{{ project.community }}</span>
        <span v-if="project.community && project.developerName" class="mx-1.5 text-stone-300">·</span>
        <span v-if="project.developerName">{{ project.developerName }}</span>
      </p>

      <!-- Meta -->
      <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-500">
        <span v-if="project.bedrooms != null" class="inline-flex items-center gap-1.5">
          <svg class="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M3 12V7a2 2 0 012-2h14a2 2 0 012 2v5m-18 0v5m18-5v5M6 12V9h5v3"/></svg>
          {{ project.bedrooms || t('card.studio') }}<span v-if="project.bedrooms"> {{ t('card.beds') }}</span>
        </span>
        <span v-if="project.bathrooms != null" class="inline-flex items-center gap-1.5">
          <svg class="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 12h16v3a4 4 0 01-4 4H8a4 4 0 01-4-4v-3zM6 12V6a2 2 0 012-2c1 0 1.5.5 1.7 1"/></svg>
          {{ project.bathrooms }} {{ t('card.baths') }}
        </span>
        <span v-if="project.area" class="inline-flex items-center gap-1.5">
          <svg class="h-4 w-4 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16v16H4zM4 9h5M4 15h5M15 4v5M9 15v5"/></svg>
          {{ Math.round(project.area) }} m²
        </span>
      </div>

      <!-- Footer: published + CTA -->
      <div class="mt-3 flex items-center justify-between">
        <span class="text-[11px] uppercase tracking-widest text-stone-400">{{ publishedLabel }}</span>
        <NuxtLink :to="to" class="cta">{{ t('card.viewDetails') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  project: {
    id: number
    slug?: string | null
    name: string
    community?: string | null
    developerName?: string | null
    coverImage?: string | null
    photos?: string[]
    price?: number | null
    priceOld?: number | null
    area?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    status?: string
    isExclusive?: number
    isReserved?: number
    hasTour?: number
    rentalYield?: number | null
    publishedAt?: string | null
    aiSummary?: string | null
  }
}>()

const { isFavorite, toggle: toggleFav } = useFavorites()
const { has: hasCompare, toggle: toggleCompare, full: compareFull } = useCompare()
const { t } = useI18n()
const { format: formatPrice } = useCurrency()

const to = computed(() => `/property-details/${props.project.slug || props.project.id}`)
const photos = computed(() => (props.project.photos?.length ? props.project.photos : [props.project.coverImage].filter(Boolean) as string[]))

const index = ref(0)
const hovering = ref(false)
let timer: any = null
function onEnter() {
  hovering.value = true
  if (photos.value.length > 1) {
    timer = setInterval(() => (index.value = (index.value + 1) % photos.value.length), 1400)
  }
}
function onLeave() {
  hovering.value = false
  clearInterval(timer)
  index.value = 0
}
function step(d: number) {
  const n = photos.value.length
  index.value = (index.value + d + n) % n
}
onBeforeUnmount(() => clearInterval(timer))

const fav = computed(() => isFavorite(props.project.id))
function onFav() {
  toggleFav(props.project.id)
}
const inCompare = computed(() => hasCompare(props.project.id))
function onCompare() {
  if (!inCompare.value && compareFull.value) return
  toggleCompare({
    id: props.project.id,
    slug: props.project.slug,
    name: props.project.name,
    cover: props.project.coverImage,
    price: props.project.price,
  })
}

const shared = ref(false)
async function onShare() {
  const url = `${location.origin}${to.value}`
  try {
    if (navigator.share) await navigator.share({ title: props.project.name, url })
    else await navigator.clipboard.writeText(url)
    shared.value = true
    setTimeout(() => (shared.value = false), 1600)
  } catch {
    /* cancelled */
  }
}

const priceDrop = computed(() => {
  const o = props.project.priceOld
  const p = props.project.price
  if (o && p && o > p) return Math.round(((o - p) / o) * 100)
  return 0
})
const pricePerM2 = computed(() => {
  if (!props.project.price || !props.project.area) return ''
  return formatPrice(Math.round(props.project.price / props.project.area))
})

const badges = computed(() => {
  const out: { text: string; cls: string }[] = []
  if (props.project.isReserved) out.push({ text: t('badge.reserved'), cls: 'badge-dark' })
  if (props.project.status === 'new') out.push({ text: t('badge.new'), cls: 'badge-accent' })
  if (priceDrop.value) out.push({ text: `${t('badge.priceDrop')} ${priceDrop.value}%`, cls: 'badge-green' })
  if (props.project.isExclusive) out.push({ text: t('badge.exclusive'), cls: 'badge-gold' })
  return out.slice(0, 3)
})

const publishedLabel = computed(() => {
  const d = props.project.publishedAt
  if (!d) return ''
  const days = Math.max(0, Math.floor((Date.now() - new Date(d.replace(' ', 'T') + 'Z').getTime()) / 86400000))
  if (days <= 1) return t('badge.newToday')
  if (days < 7) return `${days} d`
  if (days < 30) return `${Math.floor(days / 7)} sem.`
  return `${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? 'es' : ''}`
})
</script>

<style scoped>
.group {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.group:hover {
  transform: translateY(-4px);
}
.group:hover .aspect-\[4\/3\] {
  box-shadow: 0 22px 45px -22px rgba(0, 0, 0, 0.4);
}

.badge {
  border-radius: 9999px;
  padding: 0.3rem 0.7rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  backdrop-filter: blur(4px);
}
.badge-dark {
  background: rgba(22, 21, 15, 0.92);
  color: #fff;
}
.badge-accent {
  background: rgba(255, 255, 255, 0.95);
  color: #16150f;
}
.badge-green {
  background: #059669;
  color: #fff;
}
.badge-gold {
  background: #b08b4f;
  color: #fff;
}

.act {
  display: inline-flex;
  height: 2.1rem;
  width: 2.1rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: #16150f;
  backdrop-filter: blur(4px);
  transition: transform 0.2s, background-color 0.2s, color 0.2s;
}
.act:hover {
  transform: scale(1.08);
  background: #fff;
}
.act-on {
  background: #16150f;
  color: #fff;
}

.nav-arrow {
  position: absolute;
  top: 50%;
  z-index: 20;
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  transform: translateY(-50%);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 1.25rem;
  line-height: 1;
  color: #16150f;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
}
.group:hover .nav-arrow {
  opacity: 1;
}
.nav-arrow:hover {
  transform: translateY(-50%) scale(1.08);
}

.chip-glass {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background: rgba(22, 21, 15, 0.7);
  padding: 0.25rem 0.6rem;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #fff;
  backdrop-filter: blur(4px);
}

.cta {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #16150f;
  opacity: 0.65;
  transition: opacity 0.2s, transform 0.2s;
}
.group:hover .cta {
  opacity: 1;
  transform: translateX(2px);
}
</style>
