<template>
  <div v-if="data" class="bg-paper">
    <!-- Gallery -->
    <section id="fotos" class="mx-auto max-w-screen-2xl px-6 pt-6 lg:px-10">
      <MediaGallery
        :photos="photos"
        :name="data.project.name"
        :has-tour="!!data.project.hasTour"
        :master-plan="masterPlan"
        :video-url="data.project.videoUrl"
        :drone-photo="dronePhoto"
        :night-photo="nightPhoto"
        :before-photo="beforePhoto"
        :after-photo="afterPhoto"
        :ai-staged-photo="aiStagedPhoto"
      />
    </section>

    <!-- Sticky section nav -->
    <nav class="sticky top-[73px] z-30 mt-6 border-y border-line bg-paper/95 backdrop-blur">
      <div class="mx-auto flex max-w-screen-2xl items-center gap-6 overflow-x-auto px-6 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="whitespace-nowrap py-4 text-[12px] font-semibold uppercase tracking-widest text-stone-500 transition hover:text-ink">
          {{ s.label }}
        </a>
      </div>
    </nav>

    <div class="mx-auto max-w-screen-2xl px-6 py-10 lg:px-10">
      <div class="grid gap-14 lg:grid-cols-3">
        <div class="space-y-16 lg:col-span-2">
          <!-- Header -->
          <header>
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="border border-line bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest2 text-stone-600">{{ statusLabel }}</span>
                  <span v-if="data.project.rentalYield" class="rounded-full bg-paper px-3 py-1.5 text-[11px] font-semibold ring-1 ring-line">{{ data.project.rentalYield }}% rentabilidad</span>
                </div>
                <h1 class="heading-serif mt-4 text-4xl leading-tight md:text-5xl">{{ data.project.name }}</h1>
                <p class="mt-2 text-[15px] text-stone-500">
                  <span v-if="data.project.community">{{ data.project.community }}</span>
                  <span v-if="data.developer" class="mx-2 text-stone-300">·</span>
                  <span v-if="data.developer">{{ data.developer.name }}</span>
                </p>
              </div>
              <div class="flex gap-2">
                <button class="act2" :class="{ 'act2-on': fav }" @click="toggleFav(data.project.id)"><span v-html="heart" /></button>
                <button class="act2" :class="{ 'act2-on': inCompare }" @click="doCompare"><span v-html="scale" /></button>
                <button class="act2" @click="doShare">{{ shared ? '✓' : '↗' }}</button>
              </div>
            </div>
            <div class="hairline mt-8 flex flex-wrap gap-x-12 gap-y-4 pt-8">
              <div v-for="f in facts" :key="f.label"><p class="text-xl font-semibold">{{ f.value }}</p><p class="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ f.label }}</p></div>
            </div>
          </header>

          <!-- Datos clave -->
          <section v-if="hasQuickFacts" id="datos">
            <p class="eyebrow">A simple vista</p>
            <h2 class="heading-serif mt-3 text-3xl">Datos clave</h2>
            <div class="mt-6"><QuickFacts :project="data.project" /></div>
          </section>

          <!-- Resumen IA -->
          <section id="resumen">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">IA</span>
              <p class="eyebrow !text-stone-450">Resumen inteligente</p>
            </div>
            <h2 class="heading-serif mt-3 text-3xl">Lo que debes saber</h2>
            <p v-if="data.project.aiSummary" class="mt-5 max-w-3xl text-[15px] leading-[1.9] text-stone-600">{{ data.project.aiSummary }}</p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div class="rounded-2xl border border-line bg-white p-6">
                <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-700">Lo mejor</p>
                <ul class="space-y-2.5">
                  <li v-for="p in pros" :key="p" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{{ p }}</li>
                </ul>
              </div>
              <div class="rounded-2xl border border-line bg-white p-6">
                <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-700">A considerar</p>
                <ul class="space-y-2.5">
                  <li v-for="c in cons" :key="c" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{{ c }}</li>
                </ul>
              </div>
            </div>
          </section>

          <!-- Análisis de inversión IA -->
          <section id="analisis">
            <p class="eyebrow">Para inversores</p>
            <h2 class="heading-serif mt-3 text-3xl">Análisis de inversión</h2>
            <div class="mt-6">
              <AIAnalysis
                :slug="String(route.params.slug)"
                :price="data.project.price"
                :area="data.project.area"
                :rental-yield="data.project.rentalYield"
              />
            </div>
          </section>

          <!-- Ask AI -->
          <section>
            <AskAI :slug="String(route.params.slug)" />
          </section>

          <!-- Descripción -->
          <section v-if="data.project.description">
            <p class="eyebrow">Descripción</p>
            <h2 class="heading-serif mt-3 text-3xl">Sobre esta propiedad</h2>
            <p class="mt-5 max-w-3xl whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">{{ data.project.description }}</p>
          </section>

          <!-- Amenities -->
          <section v-if="data.amenities.length">
            <p class="eyebrow">Servicios del edificio</p>
            <h2 class="heading-serif mt-3 text-3xl">Comodidades</h2>
            <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600"><span class="h-1 w-1 rounded-full bg-ink" />{{ a.name }}</li>
            </ul>
          </section>

          <!-- Units -->
          <section v-if="data.unitTypes.length">
            <p class="eyebrow">Residencias</p>
            <h2 class="heading-serif mt-3 text-3xl">Tipologías disponibles</h2>
            <div class="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
              <table class="w-full text-left text-sm">
                <thead><tr class="border-b border-line text-[11px] uppercase tracking-widest text-stone-450"><th class="px-6 py-4 font-semibold">Tipo</th><th class="px-6 py-4 font-semibold">Unidad</th><th class="px-6 py-4 font-semibold">Superficie</th></tr></thead>
                <tbody><tr v-for="u in data.unitTypes" :key="u.id" class="border-b border-line/60 last:border-0"><td class="px-6 py-4 font-medium">{{ u.propertyType }}</td><td class="px-6 py-4 text-stone-600">{{ u.unitType }}</td><td class="px-6 py-4 text-stone-600">{{ u.size }}</td></tr></tbody>
              </table>
            </div>
          </section>

          <!-- Servicios cercanos -->
          <section id="servicios">
            <p class="eyebrow">El entorno</p>
            <h2 class="heading-serif mt-3 text-3xl">Qué hay cerca</h2>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div v-for="poi in nearby" :key="poi.name" class="flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4">
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-stone-500" v-html="poi.icon" />
                  <div><p class="text-sm font-medium">{{ poi.name }}</p><p class="text-[12px] text-stone-400">{{ poi.cat }}</p></div>
                </div>
                <div class="text-right text-[12px] text-stone-500">
                  <p>🚶 {{ poi.walk }} min</p>
                  <p>🚗 {{ poi.drive }} min</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Ubicación / mapa -->
          <section id="ubicacion">
            <p class="eyebrow">Ubicación</p>
            <h2 class="heading-serif mt-3 text-3xl">Dónde está</h2>
            <div class="relative mt-6 h-80 overflow-hidden rounded-2xl border border-line">
              <div class="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
              <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:26px 26px" />
              <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow-lg ring-4 ring-white">●</span>
              </div>
              <span class="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-[11px] uppercase tracking-widest2 text-stone-600 backdrop-blur">{{ data.project.community }} — mapa interactivo próximamente</span>
            </div>
          </section>

          <!-- Decoración / Home Staging IA -->
          <section>
            <div class="flex items-center gap-2"><span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">IA</span><p class="eyebrow !text-stone-450">Imagina tu hogar</p></div>
            <h2 class="heading-serif mt-3 text-3xl">Visualiza el potencial</h2>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div v-for="s in staging" :key="s.title" class="group relative overflow-hidden rounded-2xl border border-line bg-white">
                <div class="aspect-[16/10] overflow-hidden bg-stone-100"><img :src="photos[s.i % photos.length]" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
                <div class="flex items-center justify-between p-5">
                  <div><p class="font-serif text-lg font-medium">{{ s.title }}</p><p class="text-[13px] text-stone-500">{{ s.desc }}</p></div>
                  <NuxtLink to="/contact-us" class="shrink-0 rounded-full bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white">Generar</NuxtLink>
                </div>
              </div>
            </div>
          </section>

          <!-- Hipoteca -->
          <section id="hipoteca">
            <p class="eyebrow">Financiación</p>
            <h2 class="heading-serif mt-3 text-3xl">Hipoteca y costes</h2>
            <div class="mt-6"><MortgageCalculator :price="data.project.price || 0" :rental-yield="data.project.rentalYield" /></div>
          </section>

          <!-- Historia / timeline -->
          <section id="historia">
            <p class="eyebrow">Trayectoria</p>
            <h2 class="heading-serif mt-3 text-3xl">Historia del inmueble</h2>
            <ol class="mt-6 space-y-6 border-l border-line pl-6">
              <li v-for="(t, i) in timeline" :key="i" class="relative">
                <span class="absolute -left-[31px] top-1 flex h-3 w-3 items-center justify-center rounded-full" :class="t.done ? 'bg-ink' : 'bg-white ring-2 ring-line'" />
                <p class="text-sm font-semibold">{{ t.title }}</p>
                <p class="text-[13px] text-stone-500">{{ t.detail }}</p>
              </li>
            </ol>
          </section>
        </div>

        <!-- Sidebar -->
        <aside>
          <div class="space-y-6 lg:sticky lg:top-32">
            <div class="rounded-2xl border border-line bg-white p-8">
              <p class="eyebrow">Desde</p>
              <p class="heading-serif mt-2 text-4xl">{{ formatPrice(data.project.price) }}</p>
              <p v-if="pricePerM2" class="mt-1 text-[13px] text-stone-400">{{ pricePerM2 }} / m²</p>
              <div v-if="paymentRows.length" class="hairline mt-6 pt-5">
                <p class="eyebrow mb-4">Plan de pago</p>
                <ul class="space-y-3">
                  <li v-for="(r, i) in paymentRows" :key="i" class="flex justify-between text-sm"><span class="text-stone-500">{{ r.label }}</span><span class="font-semibold">{{ r.value }}</span></li>
                </ul>
              </div>
              <div class="mt-7 space-y-3">
                <NuxtLink to="/contact-us" class="btn-primary w-full">Solicitar información</NuxtLink>
                <NuxtLink to="/visitor" class="btn-secondary w-full">Agendar visita</NuxtLink>
              </div>
            </div>
            <AgentContactCard :property-name="data.project.name" />
            <div v-if="data.developer" class="rounded-2xl border border-line bg-white p-8">
              <p class="eyebrow mb-4">Promotora</p>
              <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 items-center justify-center border border-line bg-paper">
                  <img v-if="data.developer.logo" :src="mediaUrl(data.developer.logo)" class="max-h-10 object-contain" />
                  <span v-else class="font-serif text-xl">{{ data.developer.name.charAt(0) }}</span>
                </div>
                <p class="font-serif text-lg font-medium leading-tight">{{ data.developer.name }}</p>
              </div>
              <p v-if="data.developer.description" class="mt-4 text-[13px] leading-relaxed text-stone-500">{{ data.developer.description }}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(`/api/public/properties/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Project not found', fatal: true })
useHead({ title: `${data.value.project.name} — M&M Real Estate` })

const { format: formatPrice } = useCurrency()
const { isFavorite, toggle: toggleFav, load: loadFav } = useFavorites()
const { has: hasCompare, toggle: toggleCompare, load: loadCompare } = useCompare()
onMounted(() => { loadFav(); loadCompare() })
const fav = computed(() => isFavorite(data.value!.project.id))
const inCompare = computed(() => hasCompare(data.value!.project.id))
function doCompare() {
  const p = data.value!.project
  toggleCompare({ id: p.id, slug: p.slug, name: p.name, cover: p.coverImage, price: p.price })
}
const shared = ref(false)
async function doShare() {
  const url = location.href
  try { if (navigator.share) await navigator.share({ title: data.value!.project.name, url }); else await navigator.clipboard.writeText(url); shared.value = true; setTimeout(() => (shared.value = false), 1600) } catch {}
}

const photos = computed<string[]>(() => {
  const list = [data.value?.project.coverImage, ...(data.value?.gallery.map((g: any) => g.image) || [])]
  return [...new Set(list.filter(Boolean))].map((k: string) => mediaUrl(k))
})
const masterPlan = computed(() => (data.value?.project.masterPlanImage ? mediaUrl(data.value.project.masterPlanImage) : null))
const dronePhoto = computed(() => (data.value?.project.dronePhoto ? mediaUrl(data.value.project.dronePhoto) : null))
const nightPhoto = computed(() => (data.value?.project.nightPhoto ? mediaUrl(data.value.project.nightPhoto) : null))
const beforePhoto = computed(() => (data.value?.project.beforePhoto ? mediaUrl(data.value.project.beforePhoto) : null))
const afterPhoto = computed(() => (data.value?.project.afterPhoto ? mediaUrl(data.value.project.afterPhoto) : null))
const aiStagedPhoto = computed(() => (data.value?.project.aiStagedPhoto ? mediaUrl(data.value.project.aiStagedPhoto) : null))

const p = computed(() => data.value!.project)
const statusLabel = computed(() => ({ new: 'Obra nueva', under_construction: 'En construcción', ready: 'Listo para entrar' }[p.value.status as string] || p.value.status))

const sections = computed(() => {
  const s = [{ id: 'fotos', label: 'Fotos' }]
  if (hasQuickFacts.value) s.push({ id: 'datos', label: 'Datos clave' })
  s.push(
    { id: 'resumen', label: 'Resumen IA' },
    { id: 'analisis', label: 'Análisis' },
    { id: 'servicios', label: 'Servicios' },
    { id: 'ubicacion', label: 'Ubicación' },
    { id: 'hipoteca', label: 'Hipoteca' },
    { id: 'historia', label: 'Historia' },
  )
  return s
})

const hasQuickFacts = computed(() => {
  const q = p.value
  return !!(
    q.propertyType ||
    q.yearBuilt ||
    q.status ||
    q.street ||
    q.hasElevator ||
    q.hasGarage ||
    q.hasTerrace ||
    q.hasGarden ||
    q.hasPool ||
    q.petsAllowed ||
    q.accessible
  )
})

const facts = computed(() => {
  const out: { label: string; value: string }[] = []
  if (p.value.bedrooms != null) out.push({ label: 'Habitaciones', value: p.value.bedrooms || 'Estudio' })
  if (p.value.bathrooms != null) out.push({ label: 'Baños', value: String(p.value.bathrooms) })
  if (p.value.area) out.push({ label: 'Superficie', value: `${Math.round(p.value.area)} m²` })
  if (p.value.energyRating) out.push({ label: 'Eficiencia', value: p.value.energyRating })
  if (p.value.orientation) out.push({ label: 'Orientación', value: p.value.orientation })
  return out
})

const pricePerM2 = computed(() => (p.value.price && p.value.area ? `AED ${new Intl.NumberFormat('en-US').format(Math.round(p.value.price / p.value.area))}` : ''))

const pros = computed(() => {
  const o: string[] = []
  if (p.value.hasPool) o.push('Piscina en la comunidad')
  if (['S', 'SW', 'SE'].includes(p.value.orientation)) o.push('Muy luminoso — orientación sur')
  if (['A', 'B'].includes(p.value.energyRating)) o.push(`Alta eficiencia energética (${p.value.energyRating})`)
  if (p.value.rentalYield >= 6.5) o.push(`Rentabilidad destacada (${p.value.rentalYield}%)`)
  if (p.value.hasGarage) o.push('Plaza de garaje incluida')
  if (p.value.hasGarden) o.push('Jardín privado')
  if (p.value.status === 'ready') o.push('Listo para entrar a vivir')
  if (p.value.accessible) o.push('Vivienda accesible')
  return o.length ? o.slice(0, 6) : ['Ubicación privilegiada', 'Acabados de calidad']
})
const cons = computed(() => {
  const o: string[] = []
  if (p.value.status === 'new') o.push('Entrega sobre plano — planifica la mudanza')
  if (p.value.status === 'under_construction' && p.value.handoverDate) o.push(`Entrega prevista: ${p.value.handoverDate}`)
  if (!p.value.hasElevator && (p.value.bedrooms || 0) >= 2) o.push('Consulta disponibilidad de ascensor')
  if (['D', 'E', 'F', 'G'].includes(p.value.energyRating)) o.push('Eficiencia energética mejorable')
  if (p.value.orientation === 'N') o.push('Orientación norte — menos luz directa')
  return o.length ? o.slice(0, 4) : ['Recomendamos visita para valorar acabados']
})

// Nearby (deterministic demo POIs by project id)
const nearby = computed(() => {
  const seed = p.value.id
  const mk = (name: string, cat: string, base: number, icon: string) => ({ name, cat, walk: base + (seed % 5), drive: Math.max(2, Math.round((base + (seed % 5)) / 3)), icon })
  return [
    mk('Colegio Internacional', 'Educación', 8, iconSvg('school')),
    mk('Hospital / Clínica', 'Salud', 12, iconSvg('cross')),
    mk('Supermercado gourmet', 'Compras', 5, iconSvg('cart')),
    mk('Playa más cercana', 'Ocio', 14, iconSvg('wave')),
  ]
})

const staging = [
  { title: 'Decoración IA', desc: 'Reimagina los espacios en tu estilo', i: 1 },
  { title: 'Home Staging IA', desc: 'Amuebla virtualmente cada estancia', i: 2 },
]

const timeline = computed(() => {
  const t: { title: string; detail: string; done: boolean }[] = []
  if (p.value.publishedAt) t.push({ title: 'Publicado en M&M Real Estate', detail: new Date(p.value.publishedAt.replace(' ', 'T') + 'Z').toLocaleDateString('es-ES'), done: true })
  t.push({ title: 'Lanzamiento comercial', detail: 'Inicio de comercialización', done: true })
  if (p.value.status !== 'new') t.push({ title: 'En construcción', detail: `Avance de obra ${p.value.constructionPercentage || ''}${p.value.constructionPercentage ? '%' : ''}`, done: p.value.status !== 'new' })
  t.push({ title: 'Entrega de llaves', detail: p.value.handoverDate || 'Por confirmar', done: p.value.status === 'ready' })
  return t
})

const paymentRows = computed<{ label: string; value: string }[]>(() => {
  try {
    const parsed = JSON.parse(p.value.paymentPlan || '[]')
    if (Array.isArray(parsed) && parsed.length) return parsed.map((s: any, i: number) => ({ label: s.label || s.name || `Fase ${i + 1}`, value: s.value || s.percentage || '' }))
  } catch {}
  const r = []
  if (p.value.downPercentage) r.push({ label: 'Entrada', value: `${p.value.downPercentage}%` })
  if (p.value.constructionPercentage) r.push({ label: 'Durante obra', value: `${p.value.constructionPercentage}%` })
  if (p.value.handoverPercentage) r.push({ label: 'En entrega', value: `${p.value.handoverPercentage}%` })
  return r
})

const heart = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z"/></svg>'
const scale = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3v18M15 3v18M4 8h5M15 8h5M4 16h5M15 16h5"/></svg>'
function iconSvg(k: string) {
  const m: Record<string, string> = {
    school: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4l9 4-9 4-9-4 9-4zM6 10v5c0 1.5 6 3 6 3s6-1.5 6-3v-5"/>',
    cross: '<path stroke-linecap="round" stroke-linejoin="round" d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
    cart: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 4h2l2 12h11l2-8H7M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>',
    wave: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 14c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2M3 18c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2"/>',
  }
  return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">${m[k] || ''}</svg>`
}
</script>

<style scoped>
:global(html) {
  scroll-behavior: smooth;
}
section[id] {
  scroll-margin-top: 130px;
}
.act2 {
  display: inline-flex;
  height: 2.6rem;
  width: 2.6rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid #e7e4de;
  background: #fff;
  color: #16150f;
  transition: all 0.2s;
}
.act2:hover {
  border-color: #16150f;
}
.act2-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
</style>
