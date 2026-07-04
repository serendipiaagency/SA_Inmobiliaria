<template>
  <section ref="root" class="hero relative flex flex-col overflow-hidden bg-ink" :style="{ minHeight: '100svh' }">
    <!-- Cinematic background (crossfading, Ken Burns + subtle parallax) -->
    <div class="absolute -inset-y-[7%] inset-x-0 will-change-transform" :style="parallaxStyle" aria-hidden="true">
      <div
        v-for="(img, i) in slides"
        :key="i"
        class="hero-slide absolute inset-0 bg-cover bg-center"
        :style="{ backgroundImage: `url(${img})`, animationDelay: `${i * 7}s` }"
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/70" />
      <div class="absolute inset-0 bg-black/10" />
      <div class="pointer-events-none absolute inset-0 hero-vignette" />
    </div>

    <!-- Content -->
    <div class="relative z-10 mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-6 lg:px-10">
      <div class="flex flex-1 flex-col justify-center pb-4 pt-24 md:pt-28">
        <p class="rise eyebrow !text-white/70" :style="delay(0)">{{ t('hero.eyebrow') }}</p>
        <h1
          class="rise mt-7 max-w-4xl font-serif text-[clamp(3rem,7.5vw,6.75rem)] font-medium leading-[1.01] tracking-[-0.01em] text-white"
          :style="delay(1)"
        >
          {{ t('hero.title1') }} <br class="hidden sm:block" /><span class="italic">{{ t('hero.title2') }}</span>
        </h1>
        <p class="rise mt-8 max-w-md text-base leading-relaxed text-white/80 md:text-lg" :style="delay(2)">
          {{ t('hero.subtitle') }}
        </p>

        <!-- Secondary CTAs -->
        <div class="rise mt-8 flex flex-wrap items-center gap-x-7 gap-y-3" :style="delay(2)">
          <NuxtLink to="/properties" class="hero-cta-outline group">
            {{ t('hero.exploreCta') }}
            <svg class="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
          </NuxtLink>
          <NuxtLink to="/contact-us" class="hero-cta-ghost">
            {{ t('hero.advisorCta') }}
          </NuxtLink>
        </div>

        <!-- Search — the protagonist -->
        <div class="rise mt-12 w-full max-w-5xl" :style="delay(3)">
          <!-- Category tabs -->
          <div class="tabs-fade -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              v-for="t in tabs"
              :key="t.key"
              type="button"
              class="tab shrink-0 rounded-full px-5 py-2.5 text-[12px] font-semibold uppercase tracking-widest transition-all duration-300"
              :class="
                activeTab === t.key
                  ? 'bg-white text-ink shadow-lg'
                  : 'bg-white/10 text-white/85 backdrop-blur hover:bg-white/20'
              "
              :aria-pressed="activeTab === t.key"
              @click="setTab(t.key)"
            >
              {{ t.label }}
            </button>
          </div>

          <!-- Search bar -->
          <div
            class="search-bar relative flex flex-col gap-px overflow-visible rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-shadow duration-300 lg:flex-row lg:items-stretch lg:rounded-full"
          >
            <!-- Ubicación -->
            <div class="cell relative flex-[1.6]" :class="cellCls('location')">
              <button type="button" class="cell-btn" @click="toggle('location')">
                <span class="cell-label">{{ t('hero.location') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !form.location }">
                  {{ form.location || t('hero.locationPlaceholder') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'location'" class="popover left-0 w-[min(90vw,360px)]">
                  <input
                    ref="locInput"
                    v-model="form.location"
                    class="w-full border border-line px-4 py-3 text-sm focus:border-ink focus:outline-none"
                    :placeholder="t('hero.locationPlaceholder')"
                    @keyup.enter="submit"
                  />
                  <div v-if="suggestions.length" class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="s in suggestions"
                      :key="s"
                      type="button"
                      class="chip"
                      @click="pickLocation(s)"
                    >
                      {{ s }}
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Precio -->
            <div class="cell relative flex-1" :class="cellCls('price')">
              <button type="button" class="cell-btn" @click="toggle('price')">
                <span class="cell-label">{{ t('hero.price') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !priceLabel }">
                  {{ priceLabel || t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'price'" class="popover left-0 w-[min(92vw,340px)]">
                  <div class="grid grid-cols-2 gap-3">
                    <label class="pop-label">
                      Mínimo
                      <select v-model="form.priceMin" class="pop-select">
                        <option value="">{{ t('hero.noMin') }}</option>
                        <option v-for="p in priceSteps" :key="p" :value="p">{{ money(p) }}</option>
                      </select>
                    </label>
                    <label class="pop-label">
                      Máximo
                      <select v-model="form.priceMax" class="pop-select">
                        <option value="">{{ t('hero.noMax') }}</option>
                        <option v-for="p in priceSteps" :key="p" :value="p">{{ money(p) }}</option>
                      </select>
                    </label>
                  </div>
                  <p class="mt-3 text-[11px] uppercase tracking-widest text-stone-400">
                    {{ isRent ? 'Alquiler mensual' : 'Precio de venta' }}
                  </p>
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Habitaciones -->
            <div class="cell relative flex-1" :class="cellCls('beds')">
              <button type="button" class="cell-btn" @click="toggle('beds')">
                <span class="cell-label">{{ t('hero.bedrooms') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': form.beds === '' }">
                  {{ form.beds === '' ? t('hero.any') : bedLabel(form.beds) }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'beds'" class="popover left-0 w-[min(92vw,300px)]">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="opt in bedOptions"
                      :key="opt.v"
                      type="button"
                      class="pill"
                      :class="{ 'pill-on': form.beds === opt.v }"
                      @click="form.beds = form.beds === opt.v ? '' : opt.v"
                    >
                      {{ opt.l }}
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Baños -->
            <div class="cell relative flex-1" :class="cellCls('baths')">
              <button type="button" class="cell-btn" @click="toggle('baths')">
                <span class="cell-label">{{ t('hero.bathrooms') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': form.baths === '' }">
                  {{ form.baths === '' ? t('hero.any') : `${form.baths}+` }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'baths'" class="popover left-0 w-[min(92vw,280px)]">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="n in [1, 2, 3, 4]"
                      :key="n"
                      type="button"
                      class="pill"
                      :class="{ 'pill-on': form.baths === n }"
                      @click="form.baths = form.baths === n ? '' : n"
                    >
                      {{ n }}+
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Superficie -->
            <div class="cell relative flex-1" :class="cellCls('area')">
              <button type="button" class="cell-btn" @click="toggle('area')">
                <span class="cell-label">{{ t('hero.area') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !form.areaMin }">
                  {{ form.areaMin ? `${form.areaMin}+ m²` : t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'area'" class="popover right-0 w-[min(92vw,280px)]">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="a in [50, 75, 100, 150, 200, 300, 500]"
                      :key="a"
                      type="button"
                      class="pill"
                      :class="{ 'pill-on': form.areaMin === a }"
                      @click="form.areaMin = form.areaMin === a ? '' : a"
                    >
                      {{ a }} m²
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <!-- Search button -->
            <div class="flex items-center justify-end p-2 lg:pr-2">
              <button type="button" class="search-btn group" :aria-label="t('hero.search')" @click="submit">
                <svg class="h-5 w-5 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.3-4.3m1.8-5.2a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span class="ml-2 lg:hidden">{{ t('hero.search') }}</span>
              </button>
            </div>
          </div>

          <!-- Más filtros -->
          <div class="mt-4 flex items-center justify-between">
            <button
              type="button"
              class="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-white/80 transition hover:text-white"
              @click="moreOpen = !moreOpen"
            >
              <svg class="h-4 w-4 transition-transform duration-300" :class="{ 'rotate-180': moreOpen }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {{ t('hero.more') }}
            </button>
            <button
              v-if="hasFilters"
              type="button"
              class="text-[11px] uppercase tracking-widest text-white/60 transition hover:text-white"
              @click="clearAll"
            >
              {{ t('hero.clear') }}
            </button>
          </div>

          <transition name="more">
            <div v-if="moreOpen" class="mt-3 grid gap-3 rounded-2xl bg-white/95 p-5 backdrop-blur sm:grid-cols-3">
              <label class="pop-label">
                Tipo de propiedad
                <select v-model="form.subtype" class="pop-select">
                  <option value="">Cualquiera</option>
                  <option>Apartment</option>
                  <option>Villa</option>
                  <option>Townhouse</option>
                  <option>Penthouse</option>
                  <option>Studio</option>
                </select>
              </label>
              <label class="pop-label">
                Estado
                <select v-model="form.status" class="pop-select">
                  <option value="">Cualquiera</option>
                  <option value="new">Nuevo lanzamiento</option>
                  <option value="under_construction">En construcción</option>
                  <option value="ready">Listo para entrar</option>
                </select>
              </label>
              <label class="pop-label">
                Ordenar por
                <select v-model="form.sort" class="pop-select">
                  <option value="">Recomendado</option>
                  <option value="price_asc">Precio: menor a mayor</option>
                  <option value="price_desc">Precio: mayor a menor</option>
                </select>
              </label>
            </div>
          </transition>
        </div>
      </div>

      <!-- Scroll cue -->
      <div class="rise flex flex-col items-center gap-3 pb-10" :style="delay(4)">
        <span class="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">{{ t('hero.scrollCue') }}</span>
        <span class="flex h-10 w-6 items-start justify-center rounded-full border border-white/30 p-1.5">
          <span class="scroll-dot h-1.5 w-1.5 rounded-full bg-white/70" />
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { format: money } = useCurrency()
const router = useRouter()
const root = ref<HTMLElement | null>(null)
const locInput = ref<HTMLInputElement | null>(null)

const slides = [
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2400&q=80',
]

// Subtle parallax on the background layer — capped and respects
// prefers-reduced-motion. The background wrapper is oversized (-inset-y-7%)
// so it always has room to move without exposing its edges.
const scrollY = ref(0)
const reduceMotion = ref(false)
let rafId = 0
function onScroll() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    scrollY.value = window.scrollY
    rafId = 0
  })
}
const parallaxStyle = computed(() => {
  if (reduceMotion.value) return {}
  const offset = Math.min(scrollY.value * 0.28, 60)
  return { transform: `translate3d(0, ${offset}px, 0)` }
})

const tabs = computed(() => [
  { key: 'buy', label: t('tab.buy') },
  { key: 'rent', label: t('tab.rent') },
  { key: 'new', label: t('tab.new') },
  { key: 'investment', label: t('tab.investment') },
  { key: 'commercial', label: t('tab.commercial') },
  { key: 'garage', label: t('tab.garage') },
  { key: 'plots', label: t('tab.plots') },
  { key: 'land', label: t('tab.land') },
  { key: 'warehouse', label: t('tab.warehouse') },
])
const activeTab = ref('buy')
function setTab(k: string) {
  activeTab.value = k
}
const isRent = computed(() => activeTab.value === 'rent')

const form = reactive({
  location: '',
  priceMin: '' as number | '',
  priceMax: '' as number | '',
  beds: '' as number | '',
  baths: '' as number | '',
  areaMin: '' as number | '',
  subtype: '',
  status: '',
  sort: '',
})

const open = ref<string | null>(null)
const moreOpen = ref(false)

function toggle(key: string) {
  open.value = open.value === key ? null : key
  if (open.value === 'location') nextTick(() => locInput.value?.focus())
}
function cellCls(key: string) {
  return open.value === key ? 'cell-active' : ''
}

// Location suggestions
const { data: locData } = await useFetch<{ rows: { name: string }[] }>('/api/public/locations')
const { data: commData } = await useFetch<{ rows: { name: string }[] }>('/api/public/communities')
const suggestions = computed(() => {
  const names = [
    ...(locData.value?.rows || []).map((r) => r.name),
    ...(commData.value?.rows || []).map((r) => r.name),
  ]
  return [...new Set(names)].slice(0, 8)
})
function pickLocation(s: string) {
  form.location = s
  open.value = null
}

// Price steps depend on buy/rent
const buySteps = [250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000]
const rentSteps = [30000, 60000, 90000, 120000, 180000, 250000, 400000]
const priceSteps = computed(() => (isRent.value ? rentSteps : buySteps))
const priceLabel = computed(() => {
  const min = form.priceMin
  const max = form.priceMax
  if (min && max) return `${short(+min)} – ${short(+max)}`
  if (min) return `Desde ${short(+min)}`
  if (max) return `Hasta ${short(+max)}`
  return ''
})
function short(v: number) {
  if (v >= 1000000) return `${v / 1000000}M`
  return `${v / 1000}k`
}

const bedOptions = [
  { v: 0, l: 'Estudio' },
  { v: 1, l: '1' },
  { v: 2, l: '2' },
  { v: 3, l: '3' },
  { v: 4, l: '4' },
  { v: 5, l: '5+' },
]
function bedLabel(v: number | '') {
  if (v === 0) return 'Estudio'
  return `${v}${v === 5 ? '+' : ''} hab.`
}

const hasFilters = computed(
  () =>
    !!form.location ||
    form.priceMin !== '' ||
    form.priceMax !== '' ||
    form.beds !== '' ||
    form.baths !== '' ||
    form.areaMin !== '' ||
    !!form.subtype ||
    !!form.status,
)
function clearAll() {
  Object.assign(form, {
    location: '',
    priceMin: '',
    priceMax: '',
    beds: '',
    baths: '',
    areaMin: '',
    subtype: '',
    status: '',
    sort: '',
  })
}

function submit() {
  open.value = null
  const q: Record<string, string> = { mode: activeTab.value }
  if (form.location) q.q = form.location
  if (form.priceMin !== '') q.minPrice = String(form.priceMin)
  if (form.priceMax !== '') q.maxPrice = String(form.priceMax)
  if (form.beds !== '') q.bedrooms = String(form.beds)
  if (form.baths !== '') q.bathrooms = String(form.baths)
  if (form.areaMin !== '') q.minArea = String(form.areaMin)
  if (form.subtype) q.type = form.subtype
  if (form.status) q.status = form.status
  if (form.sort) q.sort = form.sort
  router.push({ path: '/properties', query: q })
}

// Close popovers on outside click / escape
function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = null
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduceMotion.value) window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
  if (rafId) cancelAnimationFrame(rafId)
})

function delay(i: number) {
  return { animationDelay: `${0.15 + i * 0.12}s` }
}
</script>

<style scoped>
/* Cinematic crossfade + Ken Burns */
.hero-slide {
  opacity: 0;
  animation: heroFade 21s infinite;
  will-change: opacity, transform;
}
@keyframes heroFade {
  0% {
    opacity: 0;
    transform: scale(1);
  }
  4% {
    opacity: 1;
  }
  28% {
    opacity: 1;
  }
  33% {
    opacity: 0;
    transform: scale(1.09);
  }
  100% {
    opacity: 0;
    transform: scale(1.09);
  }
}

/* Soft radial vignette to keep focus on the centered content */
.hero-vignette {
  background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.35) 100%);
}

/* Secondary CTAs */
.hero-cta-outline {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  padding-bottom: 3px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #fff;
  transition: border-color 0.25s, opacity 0.25s;
}
.hero-cta-outline:hover {
  border-color: #fff;
  opacity: 0.85;
}
.hero-cta-ghost {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
  transition: color 0.25s;
}
.hero-cta-ghost:hover {
  color: #fff;
}

/* Fade the edges of the horizontally-scrolling tab list on small screens */
.tabs-fade {
  mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 28px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 28px), transparent);
}

/* Entrance */
.rise {
  opacity: 0;
  transform: translateY(22px);
  animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes rise {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Search cells */
.cell {
  transition: background-color 0.25s;
  border-radius: 1rem;
}
.cell-btn {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 0.85rem 1.5rem;
  text-align: left;
}
.cell-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #16150f;
}
.cell-value {
  font-size: 14px;
  color: #57534e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-placeholder {
  color: #a8a29e;
}
.cell:hover {
  background-color: #f7f5f1;
}
.cell-active {
  background-color: #f2efe9;
}
.divider {
  display: none;
}
@media (min-width: 1024px) {
  .divider {
    display: block;
    width: 1px;
    align-self: center;
    height: 2.4rem;
    background: #e7e4de;
  }
  .cell {
    border-radius: 9999px;
  }
}
/* On mobile, stack: dividers become full-width hairlines */
@media (max-width: 1023px) {
  .search-bar > .cell + .divider,
  .search-bar > .divider {
    display: block;
    height: 1px;
    width: auto;
    margin: 0 1.5rem;
    background: #efece6;
  }
}

.search-bar:focus-within,
.search-bar:hover {
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.45);
}

.search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border-radius: 9999px;
  background: #16150f;
  padding: 0.9rem 1.4rem;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transition: background-color 0.25s, transform 0.2s;
}
.search-btn:hover {
  background: #000;
  transform: translateY(-1px);
}
@media (min-width: 1024px) {
  .search-btn {
    width: 3.4rem;
    height: 3.4rem;
    padding: 0;
  }
}

/* Popover */
.popover {
  position: absolute;
  top: calc(100% + 12px);
  z-index: 30;
  background: #fff;
  border: 1px solid #e7e4de;
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
}
@media (max-width: 1023px) {
  .popover {
    top: calc(100% - 4px);
  }
}
.chip {
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.4rem 0.9rem;
  font-size: 13px;
  color: #44403c;
  transition: all 0.2s;
}
.chip:hover {
  border-color: #16150f;
  color: #16150f;
}
.pill {
  min-width: 3rem;
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 14px;
  color: #44403c;
  transition: all 0.2s;
}
.pill:hover {
  border-color: #16150f;
}
.pill-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
.pop-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #78716c;
}
.pop-select {
  border: 1px solid #e7e4de;
  border-radius: 0.6rem;
  padding: 0.6rem 0.7rem;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: #16150f;
  background: #fff;
}
.pop-select:focus {
  outline: none;
  border-color: #16150f;
}

/* Popover transition */
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.more-enter-active,
.more-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.more-enter-from,
.more-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Scroll cue — mouse-wheel style indicator with a bouncing dot */
.scroll-dot {
  animation: scrollDot 1.8s ease-in-out infinite;
}
@keyframes scrollDot {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  70% {
    transform: translateY(14px);
    opacity: 0;
  }
  71% {
    transform: translateY(0);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-slide,
  .rise,
  .scroll-dot {
    animation: none;
  }
  .hero-slide:first-child {
    opacity: 1;
  }
  .rise {
    opacity: 1;
    transform: none;
  }
}
</style>
