<template>
  <section ref="root" class="hero relative z-[1] flex flex-col bg-ink" :style="{ minHeight: '100svh' }">
    <!-- Fondo: bucle de imágenes (fundido + zoom lento) o imagen fija, con un parallax suave (utils/siteBuilder/heroMedia.ts).
         El recorte va aquí y no en la sección: así los desplegables del buscador nunca se cortan ni quedan detrás. -->
    <div class="absolute inset-0 overflow-hidden" aria-hidden="true">
    <div class="absolute -inset-y-[7%] inset-x-0 will-change-transform" :style="parallaxStyle" data-testid="hero-background">
      <div
        v-for="(img, i) in frames"
        :key="`${i}:${img}`"
        class="hero-slide absolute inset-0 bg-cover"
        :class="frames.length === 1 ? 'is-static' : { 'is-active': i === active, 'is-leaving': i === leaving }"
        :style="{ backgroundImage: `url(${img})`, backgroundPosition: backgroundPosition }"
        data-testid="hero-slide"
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/70" />
      <div class="absolute inset-0 bg-black/10" />
      <!-- Builder-configurable extra scrim (Diseño > Overlay), on top of the fixed gradient above — 0 by default, pixel-identical to before this existed. -->
      <div v-if="overlayOpacity > 0" class="absolute inset-0 bg-black" :style="{ opacity: overlayOpacity / 100 }" />
      <div class="pointer-events-none absolute inset-0 hero-vignette" />
    </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-6 lg:px-10">
      <div class="flex flex-1 flex-col justify-center pb-4 pt-24 md:pt-28" :class="contentAlign === 'center' ? 'items-center text-center' : ''">
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="rise eyebrow w-fit bg-white/15 !text-white/90 backdrop-blur-sm" :style="delay(0)" :text="heroEyebrow" />
        <h1
          class="rise mt-7 max-w-4xl font-serif text-[clamp(3rem,7.5vw,6.75rem)] font-medium leading-[1.01] tracking-[-0.01em] text-white"
          :style="delay(1)"
        >
          <SbText tag="span" field="title1" kind="heading" label="Título (línea 1)" :text="heroTitle1" /> <br class="hidden sm:block" ><SbText tag="span" field="title2" kind="heading" label="Título (línea 2)" class="italic" :text="heroTitle2" />
        </h1>
        <SbText tag="p" field="subtitle" label="Subtítulo" multiline class="rise mt-8 max-w-md text-base leading-relaxed text-white/80 md:text-lg" :style="delay(2)" :text="heroSubtitle" />

        <!-- Search — the protagonist. Sin botones encima: el buscador es la acción del Hero. -->
        <div ref="searchRoot" class="rise relative z-30 mt-10 w-full max-w-5xl" :style="delay(3)">
          <!-- Category tabs -->
          <div class="tabs-fade -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              v-for="tabItem in tabs"
              :key="tabItem.key"
              type="button"
              class="tab shrink-0 rounded-full px-5 py-2.5 text-[12px] font-semibold uppercase tracking-widest transition-all duration-300"
              :class="
                activeTab === tabItem.key
                  ? 'bg-white text-ink shadow-lg'
                  : 'bg-white/10 text-white/85 backdrop-blur hover:bg-white/20'
              "
              :aria-pressed="activeTab === tabItem.key"
              @click="setTab(tabItem.key)"
            >
              {{ tabItem.label }}
            </button>
          </div>

          <!-- Search bar -->
          <div
            class="search-bar relative flex flex-col gap-px overflow-visible rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-shadow duration-300 lg:flex-row lg:items-stretch lg:rounded-full"
          >
            <!-- Ubicación: sugerencias reales, varias zonas a la vez -->
            <div class="cell relative flex-[1.6]" :class="cellCls('location')">
              <button type="button" class="cell-btn" :aria-expanded="open === 'location'" data-testid="hero-cell-location" @click="toggle('location')">
                <span class="cell-label">{{ t('hero.location') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !locationLabel }">
                  {{ locationLabel || t('hero.locationPlaceholder') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'location'" class="popover left-0 w-[min(92vw,380px)]" data-testid="hero-pop-location">
                  <LocationAutocomplete ref="locAc" v-model="form.locations" variant="hero" :map-area="!!form.mapArea" @clear-map-area="form.mapArea = null" />
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Precio: rango con dos extremos y campos editables -->
            <div class="cell relative flex-1" :class="cellCls('price')">
              <button type="button" class="cell-btn" :aria-expanded="open === 'price'" data-testid="hero-cell-price" @click="toggle('price')">
                <span class="cell-label">{{ t('hero.price') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !priceLabel }">
                  {{ priceLabel || t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'price'" class="popover left-0 w-[min(92vw,380px)]" data-testid="hero-pop-price">
                  <PriceRangeSlider :min="form.minPrice" :max="form.maxPrice" :operation="operation" @update="onPrice" />
                </div>
              </transition>
            </div>

            <div v-if="bedsApply" class="divider" />

            <!-- Habitaciones (sólo si el tipo elegido las tiene: nada en locales, garajes o terrenos) -->
            <div v-if="bedsApply" class="cell relative flex-1" :class="cellCls('beds')">
              <button type="button" class="cell-btn" :aria-expanded="open === 'beds'" data-testid="hero-cell-beds" @click="toggle('beds')">
                <span class="cell-label">{{ t('hero.bedrooms') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !form.beds }">
                  {{ form.beds ? `${form.beds}+ ${t('catalog.bedroomsShort', 'habitaciones')}` : t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'beds'" class="popover left-0 w-[min(92vw,320px)]">
                  <div class="flex flex-wrap gap-2" role="group" :aria-label="t('hero.bedrooms')">
                    <button v-for="n in [0, 1, 2, 3, 4, 5]" :key="n" type="button" class="pill" :class="{ 'pill-on': form.beds === n }" :aria-pressed="form.beds === n" :data-testid="`hero-beds-${n}`" @click="pickBeds(n)">
                      {{ n ? `${n}+` : t('catalog.anyCount', 'Cualquiera') }}
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <div v-if="bedsApply" class="divider" />

            <!-- Baños -->
            <div v-if="bedsApply" class="cell relative flex-1" :class="cellCls('baths')">
              <button type="button" class="cell-btn" :aria-expanded="open === 'baths'" data-testid="hero-cell-baths" @click="toggle('baths')">
                <span class="cell-label">{{ t('hero.bathrooms') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !form.baths }">
                  {{ form.baths ? `${form.baths}+` : t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'baths'" class="popover left-0 w-[min(92vw,300px)]">
                  <div class="flex flex-wrap gap-2" role="group" :aria-label="t('hero.bathrooms')">
                    <button v-for="n in [0, 1, 2, 3, 4]" :key="n" type="button" class="pill" :class="{ 'pill-on': form.baths === n }" :aria-pressed="form.baths === n" :data-testid="`hero-baths-${n}`" @click="pickBaths(n)">
                      {{ n ? `${n}+` : t('catalog.anyCount', 'Cualquiera') }}
                    </button>
                  </div>
                </div>
              </transition>
            </div>

            <div class="divider" />

            <!-- Superficie: mínima y máxima -->
            <div class="cell relative flex-1" :class="cellCls('area')">
              <button type="button" class="cell-btn" :aria-expanded="open === 'area'" data-testid="hero-cell-area" @click="toggle('area')">
                <span class="cell-label">{{ t('hero.area') }}</span>
                <span class="cell-value" :class="{ 'cell-placeholder': !areaLabel }">
                  {{ areaLabel || t('hero.any') }}
                </span>
              </button>
              <transition name="pop">
                <div v-if="open === 'area'" class="popover right-0 w-[min(92vw,300px)]">
                  <div class="grid grid-cols-2 gap-3">
                    <label class="pop-label">
                      {{ t('catalog.min', 'Mínimo') }}
                      <input v-model.number="form.minArea" type="number" inputmode="numeric" min="0" class="pop-select" placeholder="0 m²" data-testid="hero-area-min" >
                    </label>
                    <label class="pop-label">
                      {{ t('catalog.max', 'Máximo') }}
                      <input v-model.number="form.maxArea" type="number" inputmode="numeric" min="0" class="pop-select" :placeholder="t('catalog.noLimit', 'Sin límite')" data-testid="hero-area-max" >
                    </label>
                  </div>
                  <p v-if="areaError" class="mt-2 text-[12px] text-red-700" role="alert" data-testid="hero-area-error">{{ areaError }}</p>
                </div>
              </transition>
            </div>

            <!-- Search button -->
            <div class="flex items-center justify-end p-2 lg:pr-2">
              <button type="button" class="search-btn group" :aria-label="t('hero.search')" data-testid="hero-search" @click="submit">
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
              :aria-expanded="moreOpen"
              data-testid="hero-more"
              @click="toggleMore"
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
            <div v-if="moreOpen" class="more-panel mt-3 grid gap-5 rounded-2xl bg-white/95 p-5 backdrop-blur" data-testid="hero-more-panel">
              <!-- Tipos de inmueble (los publicados): locales, garajes, terrenos, solares, naves… -->
              <div>
                <p class="pop-label">{{ t('filters.propertyType', 'Tipo de propiedad') }}</p>
                <div class="mt-2 flex flex-wrap gap-2" data-testid="hero-type">
                  <button v-for="c in typeChoices" :key="c.key" type="button" class="pill" :class="{ 'pill-on': isTypeChoiceOn(c) }" :aria-pressed="isTypeChoiceOn(c)" :data-testid="`hero-type-${c.key}`" @click="toggleTypeChoice(c)">
                    {{ c.label }}
                  </button>
                </div>
              </div>
              <div class="grid gap-4 sm:grid-cols-3">
                <label class="pop-label flex-row items-center gap-2">
                  <input v-model="form.newBuild" type="checkbox" class="h-4 w-4 accent-ink" data-testid="hero-new-build" >
                  {{ t('hero.newBuild', 'Sólo obra nueva') }}
                </label>
                <label v-if="operation === 'venta'" class="pop-label">
                  {{ t('hero.investment', 'Inversión') }}
                  <!-- Rentabilidad bruta declarada en la ficha (rentalYield), nunca estimada -->
                  <select v-model="form.minYield" class="pop-select" data-testid="hero-min-yield">
                    <option value="">{{ t('hero.any', 'Cualquiera') }}</option>
                    <option v-for="y in [3, 4, 5, 6, 8]" :key="y" :value="y">{{ t('hero.minYield', 'Rentabilidad desde {n} %').replace('{n}', String(y)) }}</option>
                  </select>
                </label>
                <label class="pop-label">
                  {{ t('sort.label', 'Ordenar por') }}
                  <select v-model="form.sort" class="pop-select" data-testid="hero-sort">
                    <option v-for="k in SORT_KEYS" :key="k || 'relevance'" :value="k">{{ t(SORT_LABELS[k][0], SORT_LABELS[k][1]) }}</option>
                  </select>
                </label>
              </div>
              <div>
                <p class="pop-label">{{ t('catalog.features', 'Características') }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button v-for="f in HERO_FEATURES" :key="f" type="button" class="pill" :class="{ 'pill-on': form.features.includes(f) }" :aria-pressed="form.features.includes(f)" :data-testid="`hero-feature-${f}`" @click="toggleFeature(f)">
                    {{ t(FEATURE_LABELS[f]![0], FEATURE_LABELS[f]![1]) }}
                  </button>
                </div>
              </div>
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
// Content props are all optional and default to the original hardcoded copy
// (via i18n) so this component keeps working standalone. They exist so the
// Website Builder's hero block editor can override the copy per tenant
// without forking this component — the search form/tabs logic below stays
// shared and untouched either way. Los textos son nodos editables cuando el
// hero lo pinta el Constructor Web (doble clic sobre el título para escribir);
// fuera de él, los mismos componentes no añaden nada. El Hero ya no lleva los
// dos botones «Ver propiedades» / «Hablar con un asesor»: un contenido guardado
// con ellos (exploreCta/advisorCta) se ignora.
import SbText from '~/components/site-builder/nodes/SbText.vue'
import { PROPERTY_TYPES } from '~/utils/propertySheet'
import {
  FEATURE_LABELS,
  LOCATION_KINDS,
  RESIDENTIAL_TYPES,
  SORT_KEYS,
  SORT_LABELS,
  bedroomsApply,
  firstString,
  orderedRange,
  parseAmount,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseOperation,
  parseSort,
  parseTypes,
  type LocationSelection,
  type Operation,
  type SortKey,
} from '~/utils/searchState'
import { HERO_SLIDE_SECONDS, heroFrames } from '~/utils/siteBuilder/heroMedia'
import LocationAutocomplete from '~/components/search/LocationAutocomplete.vue'
import PriceRangeSlider from '~/components/search/PriceRangeSlider.vue'

const props = defineProps<{
  eyebrow?: string
  title1?: string
  title2?: string
  subtitle?: string
  slides?: string[]
  /** «Bucle de imágenes» (por defecto) o «Imagen fija» — Constructor Web › Hero › Multimedia. */
  backgroundMode?: 'slideshow' | 'static'
  /** La imagen de «Imagen fija»; vacía = la primera del bucle. */
  backgroundImage?: string
  /** Website Builder-only additive options — all default to today's fixed look. */
  overlayOpacity?: number
  backgroundPosition?: string
  contentAlign?: 'left' | 'center'
}>()

const { t } = useI18n()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const defaultSlides = [
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2400&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2400&q=80',
]
const frames = computed(() => heroFrames({ mode: props.backgroundMode, image: props.backgroundImage, slides: props.slides, fallback: defaultSlides }))

// La imagen visible del bucle la marca JS (`is-active`) cada HERO_SLIDE_SECONDS,
// así rota igual con 2 imágenes que con 10. Antes era una animación CSS de 21 s
// pensada para 3: con 1 imagen el fondo se quedaba negro 14 s de cada 21, con
// 2 había huecos y con 4 o más se pisaban. `is-leaving` mantiene el zoom de la
// que se va mientras se funde, para que no dé un salto.
const active = ref(0)
const leaving = ref(-1)
let rotateTimer: ReturnType<typeof setInterval> | null = null
function stopRotation() {
  if (rotateTimer) clearInterval(rotateTimer)
  rotateTimer = null
}
function startRotation() {
  stopRotation()
  active.value = 0
  leaving.value = -1
  if (frames.value.length < 2 || reduceMotion.value) return
  rotateTimer = setInterval(() => {
    leaving.value = active.value
    active.value = (active.value + 1) % frames.value.length
  }, HERO_SLIDE_SECONDS * 1000)
}
const heroEyebrow = computed(() => props.eyebrow || t('hero.eyebrow'))
const heroTitle1 = computed(() => props.title1 || t('hero.title1'))
const heroTitle2 = computed(() => props.title2 || t('hero.title2'))
const heroSubtitle = computed(() => props.subtitle || t('hero.subtitle'))
const overlayOpacity = computed(() => props.overlayOpacity || 0)
const backgroundPosition = computed(() => props.backgroundPosition || 'center center')
const contentAlign = computed(() => props.contentAlign || 'left')

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

// La operación: sólo Comprar y Alquilar, excluyentes. Obra nueva, inversión y
// los tipos (locales, garajes, terrenos, naves…) no son operaciones: están en
// «Más filtros», cada uno con su criterio real.
const tabs = computed(() => [
  { key: 'buy', label: t('tab.buy') },
  { key: 'rent', label: t('tab.rent') },
])
const activeTab = ref<'buy' | 'rent'>('buy')
const operation = computed<Operation>(() => (activeTab.value === 'rent' ? 'alquiler' : 'venta'))
function setTab(k: string) {
  const next = k === 'rent' ? 'rent' : 'buy'
  if (next === activeTab.value) return
  activeTab.value = next
  // Venta y alquiler no comparten escala de precio; la inversión es de compra.
  form.minPrice = null
  form.maxPrice = null
  if (next === 'rent') form.minYield = ''
}

// El estado del buscador: el mismo modelo que la URL de /propiedades
// (utils/searchState.ts). Sólo se aplica al pulsar «Buscar».
const form = reactive({
  locations: [] as LocationSelection[],
  /** Zona del mapa que venía de la búsqueda anterior (se conserva o se quita, no se edita aquí). */
  mapArea: null as Record<string, string> | null,
  minPrice: null as number | null,
  maxPrice: null as number | null,
  beds: 0,
  baths: 0,
  minArea: '' as number | '',
  maxArea: '' as number | '',
  types: [] as string[],
  subtypes: [] as string[],
  newBuild: false,
  minYield: '' as number | '',
  features: [] as string[],
  sort: '' as SortKey,
})

// Características adicionales que ofrece el Hero (el resto, en el panel de Propiedades).
const HERO_FEATURES = ['terrace', 'garage', 'pool', 'elevator', 'storeroom', 'airConditioning']

// Al volver a Inicio desde Propiedades (sin recargar), el buscador recupera
// los criterios de la búsqueda que se estaba viendo.
const lastSearch = useState<Record<string, any> | null>('last-search', () => null)
function prefill(qy: Record<string, any> | null) {
  if (!qy) return
  activeTab.value = parseOperation(qy.operacion) === 'alquiler' ? 'rent' : 'buy'
  form.locations = parseLocations(qy)
  form.mapArea = ['north', 'south', 'east', 'west'].every((k) => firstString(qy[k])) ? { north: firstString(qy.north), south: firstString(qy.south), east: firstString(qy.east), west: firstString(qy.west) } : null
  ;[form.minPrice, form.maxPrice] = orderedRange(parseAmount(qy.minPrice), parseAmount(qy.maxPrice))
  form.beds = parseAmount(qy.bedrooms, 5) ?? 0
  form.baths = parseAmount(qy.bathrooms, 4) ?? 0
  form.minArea = parseAmount(qy.minArea, 1e6) ?? ''
  form.maxArea = parseAmount(qy.maxArea, 1e6) ?? ''
  const types = parseTypes(qy)
  form.types = types.types
  form.subtypes = types.subtypes
  form.newBuild = parseEstado(qy).includes('obra_nueva')
  form.minYield = parseAmount(qy.minYield, 100) ?? ''
  form.features = parseFeatures(qy).filter((f) => HERO_FEATURES.includes(f))
  form.sort = parseSort(qy.sort)
}
prefill(lastSearch.value)

const open = ref<string | null>(null)
const moreOpen = ref(false)
const searchRoot = ref<HTMLElement | null>(null)
const locAc = ref<{ focus: () => void } | null>(null)

// Un solo desplegable abierto a la vez; cambiar de campo no pierde lo elegido.
function toggle(key: string) {
  open.value = open.value === key ? null : key
  if (open.value) moreOpen.value = false
  if (open.value === 'location') nextTick(() => locAc.value?.focus())
}
function toggleMore() {
  moreOpen.value = !moreOpen.value
  if (moreOpen.value) open.value = null
}
function cellCls(key: string) {
  return open.value === key ? 'cell-active' : ''
}

// Tipos publicados por la agencia (`facets=types`), en el orden del catálogo
// común; sin respuesta, el catálogo entero.
const { data: facetData } = await useFetch<{ facets?: { types: string[] } }>('/api/public/properties', { query: { countOnly: '1', facets: 'types' } })
const typeOptions = computed<string[]>(() => (facetData.value?.facets?.types?.length ? facetData.value.facets.types : [...PROPERTY_TYPES]))
const typeLabel = usePropertyTypeLabel()

// «Más filtros» › tipo: las categorías de la fila de antes (viviendas, locales,
// garajes, terrenos, solares, naves…), cada una con su criterio real de
// Property Core. «Solares» es el subtipo «suelo urbano» de Terreno.
interface TypeChoice {
  key: string
  label: string
  types: string[]
  subtypes: string[]
}
const typeChoices = computed<TypeChoice[]>(() => {
  const has = (ty: string) => typeOptions.value.includes(ty)
  const homes = [...RESIDENTIAL_TYPES].filter(has)
  const out: TypeChoice[] = []
  if (homes.length) out.push({ key: 'homes', label: t('types.homes', 'Viviendas'), types: homes, subtypes: [] })
  for (const ty of ['Retail', 'Office', 'Garage', 'Land', 'Warehouse', 'Building', 'Development']) {
    if (!has(ty)) continue
    out.push({ key: ty, label: typeLabel(ty), types: [ty], subtypes: [] })
    if (ty === 'Land') out.push({ key: 'plots', label: t('tab.plots', 'Solares'), types: [], subtypes: ['urban'] })
  }
  return out
})
const isTypeChoiceOn = (c: TypeChoice) => (c.types.length ? c.types.every((ty) => form.types.includes(ty)) : c.subtypes.every((st) => form.subtypes.includes(st)))
const bedsApply = computed(() => bedroomsApply(form.types, form.subtypes))
function toggleTypeChoice(c: TypeChoice) {
  const on = !isTypeChoiceOn(c)
  if (c.types.length) form.types = on ? [...new Set([...form.types, ...c.types])] : form.types.filter((ty) => !c.types.includes(ty))
  else form.subtypes = on ? [...new Set([...form.subtypes, ...c.subtypes])] : form.subtypes.filter((st) => !c.subtypes.includes(st))
  // Sólo no residenciales (locales, garajes…): habitaciones y baños no aplican.
  if (!bedroomsApply(form.types, form.subtypes)) {
    form.beds = 0
    form.baths = 0
  }
}

function toggleFeature(f: string) {
  form.features = form.features.includes(f) ? form.features.filter((x) => x !== f) : [...form.features, f]
}

function onPrice([min, max]: [number | null, number | null]) {
  form.minPrice = min
  form.maxPrice = max
}
function pickBeds(n: number) {
  form.beds = n
  open.value = null
}
function pickBaths(n: number) {
  form.baths = n
  open.value = null
}

const { format: money } = useCurrency()
const locationLabel = computed(() => {
  const list = form.locations.map((l) => (l.kind === 'postalCode' ? `CP ${l.value}` : l.value))
  if (form.mapArea) list.push(t('catalog.mapArea', 'Zona del mapa'))
  if (!list.length) return ''
  return list.length === 1 ? list[0]! : `${list[0]} +${list.length - 1}`
})
const priceLabel = computed(() => {
  const { minPrice: min, maxPrice: max } = form
  if (min != null && max != null) return `${money(min)} – ${money(max)}`
  if (min != null) return `${t('catalog.since', 'Desde')} ${money(min)}`
  if (max != null) return `${t('price.upTo', 'Hasta')} ${money(max)}`
  return ''
})
const areaError = computed(() => (form.minArea !== '' && form.maxArea !== '' && Number(form.minArea) > Number(form.maxArea) ? t('area.minOverMax', 'El mínimo no puede ser mayor que el máximo.') : ''))
const areaLabel = computed(() => {
  const min = Number(form.minArea) || 0
  const max = Number(form.maxArea) || 0
  if (min && max) return `${min}–${max} m²`
  if (min) return `${min}+ m²`
  if (max) return `≤ ${max} m²`
  return ''
})

const hasFilters = computed(
  () =>
    form.locations.length > 0 ||
    !!form.mapArea ||
    form.minPrice != null ||
    form.maxPrice != null ||
    form.beds > 0 ||
    form.baths > 0 ||
    form.minArea !== '' ||
    form.maxArea !== '' ||
    form.types.length > 0 ||
    form.subtypes.length > 0 ||
    form.newBuild ||
    form.minYield !== '' ||
    form.features.length > 0 ||
    form.sort !== '',
)
function clearAll() {
  Object.assign(form, { locations: [], mapArea: null, minPrice: null, maxPrice: null, beds: 0, baths: 0, minArea: '', maxArea: '', types: [], subtypes: [], newBuild: false, minYield: '', features: [], sort: '' })
}

/** La búsqueda del Hero como URL de /propiedades: el mismo modelo que lee el catálogo. */
function searchQuery(): Record<string, string | string[]> {
  const q: Record<string, string | string[]> = { operacion: operation.value }
  for (const kind of LOCATION_KINDS) {
    const values = form.locations.filter((l) => l.kind === kind).map((l) => l.value)
    if (values.length) q[kind] = values
  }
  if (form.mapArea) Object.assign(q, form.mapArea)
  const [min, max] = orderedRange(form.minPrice, form.maxPrice)
  if (min != null) q.minPrice = String(min)
  if (max != null) q.maxPrice = String(max)
  if (form.beds) q.bedrooms = String(form.beds)
  if (form.baths) q.bathrooms = String(form.baths)
  const [minA, maxA] = orderedRange(parseAmount(form.minArea, 1e6), parseAmount(form.maxArea, 1e6))
  if (minA) q.minArea = String(minA)
  if (maxA) q.maxArea = String(maxA)
  if (form.types.length) q.type = form.types
  if (form.subtypes.length) q.subtype = form.subtypes
  if (form.newBuild) q.estado = ['obra_nueva']
  if (form.minYield !== '' && operation.value === 'venta') q.minYield = String(form.minYield)
  for (const f of form.features) q[f] = '1'
  if (form.sort) q.sort = form.sort
  return q
}
function submit() {
  // Una superficie mínima mayor que la máxima no se busca: se enseña dónde está el error.
  if (areaError.value) {
    moreOpen.value = false
    open.value = 'area'
    return
  }
  // Nada abierto sobre la página de resultados.
  open.value = null
  moreOpen.value = false
  router.push({ path: '/propiedades', query: searchQuery() })
}

// Pulsar fuera del buscador o Escape cierran el desplegable (lo elegido se queda).
function onDocClick(e: MouseEvent) {
  if (open.value && searchRoot.value && !searchRoot.value.contains(e.target as Node)) open.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = null
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduceMotion.value) window.addEventListener('scroll', onScroll, { passive: true })
  startRotation()
  // En el Constructor, cambiar las imágenes o el modo reinicia el bucle.
  watch(() => frames.value.join('\n'), startRotation)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
  if (rafId) cancelAnimationFrame(rafId)
  stopRotation()
})

function delay(i: number) {
  return { animationDelay: `${0.15 + i * 0.12}s` }
}
</script>

<style scoped>
/* Bucle: fundido cruzado + zoom lento (Ken Burns) de la imagen activa, que
   dura lo mismo que se ve (HERO_SLIDE_SECONDS); la que se va conserva el zoom
   final mientras se funde. */
.hero-slide {
  opacity: 0;
  transition: opacity 1.2s ease;
  will-change: opacity, transform;
}
.hero-slide.is-active {
  opacity: 1;
  animation: heroZoom 7s linear forwards;
}
.hero-slide.is-leaving {
  transform: scale(1.09);
}
@keyframes heroZoom {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.09);
  }
}
/* Imagen fija (o una sola imagen en el bucle): quieta, sin fundido ni zoom. */
.hero-slide.is-static {
  opacity: 1;
  transition: none;
  will-change: auto;
}

/* Soft radial vignette to keep focus on the centered content */
.hero-vignette {
  background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.35) 100%);
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
  border-color: #16150f;
}
.pop-select:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 2px;
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
  .hero-slide.is-active {
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
