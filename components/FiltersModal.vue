<template>
  <transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" @click.self="close">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <transition name="sheet" appear>
        <div
          class="relative flex max-h-[92vh] w-full flex-col bg-white sm:max-h-[86vh] sm:w-[560px] sm:rounded-2xl"
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 class="font-serif text-xl font-medium">{{ t('filters.button', 'Filtros') }}</h2>
            <button class="text-stone-400 transition hover:text-ink" :aria-label="t('filters.close', 'Cerrar')" @click="close">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 space-y-8 overflow-y-auto px-6 py-6">
            <!-- Precio -->
            <section>
              <h3 class="filter-title">{{ t('hero.price', 'Precio') }} (AED)</h3>
              <div class="grid grid-cols-2 gap-3">
                <label class="ff">{{ t('filters.min', 'Mínimo') }}
                  <select v-model.number="f.minPrice" class="fs">
                    <option :value="0">{{ t('hero.noMin', 'Sin mín.') }}</option>
                    <option v-for="p in priceSteps" :key="p" :value="p">{{ money(p) }}</option>
                  </select>
                </label>
                <label class="ff">{{ t('filters.max', 'Máximo') }}
                  <select v-model.number="f.maxPrice" class="fs">
                    <option :value="0">{{ t('hero.noMax', 'Sin máx.') }}</option>
                    <option v-for="p in priceSteps" :key="p" :value="p">{{ money(p) }}</option>
                  </select>
                </label>
              </div>
            </section>

            <!-- Superficie -->
            <section>
              <h3 class="filter-title">{{ t('hero.area', 'Superficie') }} (m²)</h3>
              <div class="grid grid-cols-2 gap-3">
                <label class="ff">{{ t('filters.from', 'Desde') }}
                  <select v-model.number="f.minArea" class="fs">
                    <option :value="0">{{ t('hero.noMin', 'Sin mín.') }}</option>
                    <option v-for="a in areaSteps" :key="a" :value="a">{{ a }} m²</option>
                  </select>
                </label>
                <label class="ff">{{ t('filters.to', 'Hasta') }}
                  <select v-model.number="f.maxArea" class="fs">
                    <option :value="0">{{ t('hero.noMax', 'Sin máx.') }}</option>
                    <option v-for="a in areaSteps" :key="a" :value="a">{{ a }} m²</option>
                  </select>
                </label>
              </div>
            </section>

            <!-- Habitaciones / Baños -->
            <section class="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 class="filter-title">{{ t('hero.bedrooms', 'Habitaciones') }}</h3>
                <div class="flex flex-wrap gap-2">
                  <button v-for="o in bedOpts" :key="o.v" type="button" class="pill" :class="{ 'pill-on': f.bedrooms === o.v }" @click="f.bedrooms = f.bedrooms === o.v ? 0 : o.v">{{ o.l }}</button>
                </div>
              </div>
              <div>
                <h3 class="filter-title">{{ t('hero.bathrooms', 'Baños') }}</h3>
                <div class="flex flex-wrap gap-2">
                  <button v-for="n in [1,2,3,4]" :key="n" type="button" class="pill" :class="{ 'pill-on': f.bathrooms === n }" @click="f.bathrooms = f.bathrooms === n ? 0 : n">{{ n }}+</button>
                </div>
              </div>
            </section>

            <!-- Tipo -->
            <section>
              <h3 class="filter-title">{{ t('filters.propertyType', 'Tipo de propiedad') }}</h3>
              <div class="flex flex-wrap gap-2">
                <button v-for="ty in types" :key="ty" type="button" class="pill" :class="{ 'pill-on': f.type === ty }" @click="f.type = f.type === ty ? '' : ty">{{ typeLabel(ty) }}</button>
              </div>
            </section>

            <!-- Estado -->
            <section>
              <h3 class="filter-title">{{ t('compare.spec.status', 'Estado') }}</h3>
              <div class="flex flex-wrap gap-2">
                <button v-for="s in statuses" :key="s.v" type="button" class="pill" :class="{ 'pill-on': f.status === s.v }" @click="f.status = f.status === s.v ? '' : s.v">{{ s.l }}</button>
              </div>
            </section>

            <!-- Características -->
            <section>
              <h3 class="filter-title">{{ t('filters.features', 'Características') }}</h3>
              <div class="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                <label v-for="feat in features" :key="feat.k" class="toggle">
                  <input v-model="f[feat.k]" type="checkbox" class="sr-only peer" />
                  <span class="tg-box peer-checked:border-ink peer-checked:bg-ink">
                    <svg class="h-3 w-3 text-white opacity-0 peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                  </span>
                  <span class="text-sm text-ink">{{ feat.l }}</span>
                </label>
              </div>
            </section>

            <!-- Orientación -->
            <section>
              <h3 class="filter-title">{{ t('compare.spec.orientation', 'Orientación') }}</h3>
              <div class="flex flex-wrap gap-2">
                <button v-for="o in orientations" :key="o.v" type="button" class="pill" :class="{ 'pill-on': f.orientation === o.v }" @click="f.orientation = f.orientation === o.v ? '' : o.v">{{ o.l }}</button>
              </div>
            </section>

            <!-- Año / Eficiencia -->
            <section class="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 class="filter-title">{{ t('filters.yearBuiltFrom', 'Año de construcción (desde)') }}</h3>
                <label class="ff">
                  <select v-model.number="f.minYear" class="fs">
                    <option :value="0">{{ t('hero.any', 'Cualquiera') }}</option>
                    <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
                  </select>
                </label>
              </div>
              <div>
                <h3 class="filter-title">{{ t('filters.energyMin', 'Eficiencia energética (mín.)') }}</h3>
                <div class="flex flex-wrap gap-2">
                  <button v-for="e in energies" :key="e" type="button" class="chip-e" :class="{ 'chip-e-on': f.energy === e }" @click="f.energy = f.energy === e ? '' : e">{{ e }}</button>
                </div>
              </div>
            </section>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-4 border-t border-line px-6 py-4">
            <button type="button" class="text-sm font-semibold uppercase tracking-widest text-stone-500 underline-offset-4 hover:text-ink hover:underline" @click="clearAll">
              {{ t('filters.clearAll', 'Limpiar todo') }}
            </button>
            <button type="button" class="btn-primary min-w-[11rem]" @click="apply">
              <span v-if="counting" class="count-dot" /> {{ t('filters.viewResultsPrefix', 'Ver') }} {{ count }} {{ count === 1 ? t('filters.result', 'resultado') : t('filters.results', 'resultados') }}
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ open: boolean; modelValue: Record<string, any>; q?: string }>()
const emit = defineEmits<{ close: []; apply: [Record<string, any>] }>()

const blank = () => ({
  minPrice: 0, maxPrice: 0, minArea: 0, maxArea: 0, bedrooms: 0, bathrooms: 0,
  type: '', status: '', orientation: '', minYear: 0, energy: '',
  elevator: false, pool: false, garage: false, terrace: false, garden: false, pets: false, accessible: false,
})
const f = reactive<Record<string, any>>(blank())

watch(
  () => props.open,
  (o) => {
    if (o) Object.assign(f, blank(), props.modelValue)
  },
)

const priceSteps = [250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000, 8000000]
const areaSteps = [50, 75, 100, 150, 200, 300, 500, 800]
const bedOpts = computed(() => [
  { v: 0, l: t('hero.any', 'Cualquiera') }, { v: 1, l: '1+' }, { v: 2, l: '2+' }, { v: 3, l: '3+' }, { v: 4, l: '4+' }, { v: 5, l: '5+' },
])
const types = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']
const statuses = computed(() => [
  { v: 'new', l: t('filters.status.new', 'Obra nueva') },
  { v: 'under_construction', l: t('filters.status.underConstruction', 'En construcción') },
  { v: 'ready', l: t('filters.status.ready', 'Listo para entrar') },
])
const features = computed(() => [
  { k: 'elevator', l: t('filters.feature.elevator', 'Ascensor') }, { k: 'pool', l: t('filters.feature.pool', 'Piscina') }, { k: 'garage', l: t('filters.feature.garage', 'Garaje') },
  { k: 'terrace', l: t('filters.feature.terrace', 'Terraza') }, { k: 'garden', l: t('filters.feature.garden', 'Jardín') }, { k: 'pets', l: t('filters.feature.pets', 'Mascotas') },
  { k: 'accessible', l: t('filters.feature.accessible', 'Accesible') },
])
const orientations = computed(() => [
  { v: 'N', l: t('filters.orientation.north', 'Norte') }, { v: 'S', l: t('filters.orientation.south', 'Sur') }, { v: 'E', l: t('filters.orientation.east', 'Este') }, { v: 'W', l: t('filters.orientation.west', 'Oeste') },
  { v: 'SE', l: t('filters.orientation.southeast', 'Sureste') }, { v: 'SW', l: t('filters.orientation.southwest', 'Suroeste') }, { v: 'NE', l: t('filters.orientation.northeast', 'Noreste') }, { v: 'NW', l: t('filters.orientation.northwest', 'Noroeste') },
])
const energies = ['A', 'B', 'C', 'D', 'E']
const years = [2020, 2022, 2024, 2025, 2026, 2027, 2028]

function typeLabel(ty: string) {
  return {
    Apartment: t('filters.type.apartment', 'Apartamento'),
    Villa: t('filters.type.villa', 'Villa'),
    Townhouse: t('filters.type.townhouse', 'Adosado'),
    Penthouse: t('filters.type.penthouse', 'Ático'),
    Studio: t('card.studio', 'Estudio'),
  }[ty] || ty
}
function money(v: number) {
  return `AED ${new Intl.NumberFormat('en-US').format(v)}`
}

// Build query for count / apply
function toQuery() {
  const q: Record<string, string> = {}
  if (props.q) q.q = props.q
  if (f.minPrice) q.minPrice = String(f.minPrice)
  if (f.maxPrice) q.maxPrice = String(f.maxPrice)
  if (f.minArea) q.minArea = String(f.minArea)
  if (f.maxArea) q.maxArea = String(f.maxArea)
  if (f.bedrooms) q.bedrooms = String(f.bedrooms)
  if (f.bathrooms) q.bathrooms = String(f.bathrooms)
  if (f.type) q.type = f.type
  if (f.status) q.status = f.status
  if (f.orientation) q.orientation = f.orientation
  if (f.minYear) q.minYear = String(f.minYear)
  if (f.energy) q.energy = f.energy
  for (const feat of features) if (f[feat.k]) q[feat.k] = '1'
  return q
}

// Live count (debounced), with a short count-up tween so the number feels
// alive rather than flickering — respects prefers-reduced-motion.
const count = ref(0)
const counting = ref(false)
let debounceTimer: any = null
let countRaf = 0
function animateCountTo(target: number) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    count.value = target
    return
  }
  cancelAnimationFrame(countRaf)
  const from = count.value
  const diff = target - from
  if (!diff) return
  const duration = 320
  const start = performance.now()
  function step(now: number) {
    const p = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - p, 3)
    count.value = Math.round(from + diff * eased)
    if (p < 1) countRaf = requestAnimationFrame(step)
  }
  countRaf = requestAnimationFrame(step)
}
async function refreshCount() {
  counting.value = true
  try {
    const res = await $fetch<{ total: number }>('/api/public/properties', {
      query: { ...toQuery(), countOnly: '1' },
    })
    animateCountTo(res.total)
  } catch {
    /* keep last */
  } finally {
    counting.value = false
  }
}
watch(
  () => JSON.stringify(f),
  () => {
    if (!props.open) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(refreshCount, 220)
  },
)
watch(() => props.open, (o) => { if (o) refreshCount() })

function clearAll() {
  Object.assign(f, blank())
}
function close() {
  emit('close')
}
function apply() {
  emit('apply', toQuery())
}
</script>

<style scoped>
.filter-title {
  margin-bottom: 0.75rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #78716c;
}
.ff {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #a8a29e;
}
.fs {
  border: 1px solid #e7e4de;
  border-radius: 0.6rem;
  padding: 0.7rem;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: #16150f;
  background: #fff;
}
.fs:focus {
  border-color: #16150f;
}
.fs:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 2px;
}
.pill {
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 14px;
  color: #44403c;
  transition: all 0.18s;
}
.pill:hover {
  border-color: #16150f;
}
.pill:active {
  transform: scale(0.95);
}
.pill-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  cursor: pointer;
}
.tg-box {
  display: inline-flex;
  height: 1.25rem;
  width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  border: 1px solid #d6d3d1;
  transition: all 0.18s;
}
.toggle:active .tg-box {
  transform: scale(0.88);
}
.chip-e {
  height: 2.25rem;
  width: 2.25rem;
  border-radius: 9999px;
  border: 1px solid #e7e4de;
  font-size: 14px;
  font-weight: 600;
  color: #44403c;
  transition: all 0.18s;
}
.chip-e:active {
  transform: scale(0.9);
}
.chip-e-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
.count-dot {
  display: inline-block;
  height: 0.5rem;
  width: 0.5rem;
  margin-right: 0.4rem;
  border-radius: 9999px;
  background: currentColor;
  animation: pulse 0.9s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active { transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.32s; }
.sheet-enter-from { transform: translateY(24px); opacity: 0; }
@media (min-width: 640px) {
  .sheet-enter-from { transform: translateY(12px) scale(0.98); }
}
</style>
