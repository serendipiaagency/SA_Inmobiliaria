<template>
  <div v-if="data" class="bg-paper">
    <!-- Gallery -->
    <section id="fotos" ref="heroRef" class="mx-auto max-w-screen-2xl px-6 pt-6 lg:px-10">
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
        :social-media="data.socialMedia"
      />
    </section>

    <!-- Sticky section nav -->
    <nav class="no-print sticky top-[73px] z-30 mt-6 border-y border-line bg-paper/95 backdrop-blur">
      <div class="mx-auto flex max-w-screen-2xl items-center gap-6 overflow-x-auto px-6 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <a
          v-for="s in sections"
          :key="s.id"
          :href="`#${s.id}`"
          class="relative whitespace-nowrap py-4 text-[12px] font-semibold uppercase tracking-widest transition"
          :class="activeSection === s.id ? 'text-ink' : 'text-stone-500 hover:text-ink'"
        >
          {{ s.label }}
          <span v-if="activeSection === s.id" class="absolute inset-x-0 -bottom-px h-[2px] bg-ink" />
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
                  <span v-if="data.project.rentalYield" class="rounded-full bg-paper px-3 py-1.5 text-[11px] font-semibold ring-1 ring-line">{{ data.project.rentalYield }}% {{ t('propertyDetails.facts.profitability', 'rentabilidad') }}</span>
                </div>
                <h1 class="heading-serif mt-4 text-4xl leading-tight md:text-5xl">{{ data.project.name }}</h1>
                <p class="mt-2 text-[15px] text-stone-500">
                  <span v-if="data.project.community">{{ data.project.community }}</span>
                  <span v-if="data.developer" class="mx-2 text-stone-300">·</span>
                  <span v-if="data.developer">{{ data.developer.name }}</span>
                </p>
              </div>
              <div class="no-print flex gap-2">
                <button class="act2" :class="{ 'act2-on': fav }" @click="toggleFav(data.project.id)"><span v-html="heart" /></button>
                <button class="act2" :class="{ 'act2-on': inCompare }" @click="doCompare"><span v-html="scale" /></button>
                <button class="act2" @click="doShare">{{ shared ? '✓' : '↗' }}</button>
              </div>
            </div>
            <div class="hairline mt-8 flex flex-wrap gap-x-12 gap-y-4 pt-8">
              <div v-for="f in facts" :key="f.label"><p class="text-xl font-semibold">{{ f.value }}</p><p class="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ f.label }}</p></div>
            </div>
          </header>

          <!-- Serendipia Score -->
          <section id="score">
            <SerendipiaScore :slug="String(route.params.slug)" />
          </section>

          <!-- Datos clave -->
          <section v-if="hasQuickFacts" id="datos">
            <p class="eyebrow">{{ t('propertyDetails.quickFacts.eyebrow', 'A simple vista') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.quickFacts.heading', 'Datos clave') }}</h2>
            <div class="mt-6"><QuickFacts :project="data.project" /></div>
          </section>

          <!-- Resumen IA -->
          <section id="resumen">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ t('propertyDetails.badge.ai', 'IA') }}</span>
              <p class="eyebrow !text-stone-450">{{ t('propertyDetails.aiSummary.eyebrow', 'Resumen inteligente') }}</p>
            </div>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.aiSummary.heading', 'Lo que debes saber') }}</h2>
            <p v-if="data.project.aiSummary" class="mt-5 max-w-3xl text-[15px] leading-[1.9] text-stone-600">{{ data.project.aiSummary }}</p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div class="rounded-2xl border border-line bg-white p-6">
                <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-700">{{ t('propertyDetails.aiSummary.pros', 'Lo mejor') }}</p>
                <ul class="space-y-2.5">
                  <li v-for="p in pros" :key="p" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{{ p }}</li>
                </ul>
              </div>
              <div class="rounded-2xl border border-line bg-white p-6">
                <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-700">{{ t('propertyDetails.aiSummary.cons', 'A considerar') }}</p>
                <ul class="space-y-2.5">
                  <li v-for="c in cons" :key="c" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{{ c }}</li>
                </ul>
              </div>
            </div>
          </section>

          <!-- Análisis de inversión IA -->
          <section id="analisis">
            <p class="eyebrow">{{ t('propertyDetails.investment.eyebrow', 'Para inversores') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.investment.heading', 'Análisis de inversión') }}</h2>
            <div class="mt-6">
              <AIAnalysis
                :slug="String(route.params.slug)"
                :price="data.project.price"
                :area="data.project.area"
                :rental-yield="data.project.rentalYield"
              />
            </div>
          </section>

          <!-- Evolución de precio -->
          <section id="precio">
            <p class="eyebrow">{{ t('propertyDetails.priceHistory.eyebrow', 'Histórico') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.priceHistory.heading', 'Evolución de precio') }}</h2>
            <div class="mt-6"><PriceChart :slug="String(route.params.slug)" /></div>
          </section>

          <!-- Ask AI -->
          <section class="no-print">
            <AskAI :slug="String(route.params.slug)" />
          </section>

          <!-- Descripción -->
          <section v-if="data.project.description">
            <p class="eyebrow">{{ t('propertyDetails.description.eyebrow', 'Descripción') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.description.heading', 'Sobre esta propiedad') }}</h2>
            <p class="mt-5 max-w-3xl whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">{{ data.project.description }}</p>
          </section>

          <!-- Amenities -->
          <section v-if="data.amenities.length">
            <p class="eyebrow">{{ t('propertyDetails.amenities.eyebrow', 'Servicios del edificio') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.amenities.heading', 'Comodidades') }}</h2>
            <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600"><span class="h-1 w-1 rounded-full bg-ink" />{{ a.name }}</li>
            </ul>
          </section>

          <!-- Units -->
          <section v-if="data.unitTypes.length">
            <p class="eyebrow">{{ t('propertyDetails.units.eyebrow', 'Residencias') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.units.heading', 'Tipologías disponibles') }}</h2>
            <div class="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
              <table class="w-full text-left text-sm">
                <thead><tr class="border-b border-line text-[11px] uppercase tracking-widest text-stone-450"><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.type', 'Tipo') }}</th><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.unit', 'Unidad') }}</th><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.size', 'Superficie') }}</th></tr></thead>
                <tbody><tr v-for="u in data.unitTypes" :key="u.id" class="border-b border-line/60 last:border-0"><td class="px-6 py-4 font-medium">{{ u.propertyType }}</td><td class="px-6 py-4 text-stone-600">{{ u.unitType }}</td><td class="px-6 py-4 text-stone-600">{{ u.size }}</td></tr></tbody>
              </table>
            </div>
          </section>

          <!-- Servicios cercanos -->
          <section id="servicios">
            <p class="eyebrow">{{ t('propertyDetails.lifestyle.eyebrow', 'El entorno') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.lifestyle.heading', 'Estilo de vida') }}</h2>
            <p class="mt-3 max-w-2xl text-[13px] text-stone-500">{{ t('propertyDetails.lifestyle.subtitle', 'Datos reales del entorno, obtenidos de OpenStreetMap dentro de un radio de 2 km.') }}</p>
            <div class="mt-6"><LifestyleBlock :slug="String(route.params.slug)" /></div>
          </section>

          <!-- Ubicación / mapa -->
          <section id="ubicacion">
            <p class="eyebrow">{{ t('propertyDetails.location.eyebrow', 'Ubicación') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.location.heading', 'Dónde está') }}</h2>
            <div class="relative mt-6 h-80 overflow-hidden rounded-2xl border border-line">
              <div class="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
              <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:26px 26px" />
              <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow-lg ring-4 ring-white">●</span>
              </div>
              <span class="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-[11px] uppercase tracking-widest2 text-stone-600 backdrop-blur">{{ data.project.community }} — {{ t('propertyDetails.location.mapComingSoon', 'mapa interactivo próximamente') }}</span>
            </div>
          </section>

          <!-- Sol y orientación -->
          <section id="orientacion">
            <p class="eyebrow">{{ t('propertyDetails.orientation.eyebrow', 'Luz natural') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.orientation.heading', 'Sol y orientación') }}</h2>
            <div class="mt-6 rounded-2xl border border-line bg-white p-6 sm:p-8">
              <SunOrientation :orientation="data.project.orientation" :lat="data.project.lat" :lng="data.project.lng" />
            </div>
          </section>

          <!-- Decoración / Home Staging IA -->
          <section class="no-print">
            <div class="flex items-center gap-2"><span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ t('propertyDetails.badge.ai', 'IA') }}</span><p class="eyebrow !text-stone-450">{{ t('propertyDetails.staging.eyebrow', 'Imagina tu hogar') }}</p></div>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.staging.heading', 'Visualiza el potencial') }}</h2>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div v-for="s in staging" :key="s.title" class="group relative overflow-hidden rounded-2xl border border-line bg-white">
                <div class="aspect-[16/10] overflow-hidden bg-stone-100"><img :src="photos[s.i % photos.length]" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
                <div class="flex items-center justify-between p-5">
                  <div><p class="font-serif text-lg font-medium">{{ s.title }}</p><p class="text-[13px] text-stone-500">{{ s.desc }}</p></div>
                  <NuxtLink to="/contact-us" class="shrink-0 rounded-full bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white">{{ t('propertyDetails.staging.generate', 'Generar') }}</NuxtLink>
                </div>
              </div>
            </div>
          </section>

          <!-- Hipoteca -->
          <section id="hipoteca">
            <p class="eyebrow">{{ t('propertyDetails.mortgage.eyebrow', 'Financiación') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.mortgage.heading', 'Hipoteca y costes') }}</h2>
            <div class="mt-6"><MortgageCalculator :price="data.project.price || 0" :rental-yield="data.project.rentalYield" :status="data.project.status" /></div>
          </section>

          <!-- Historia / timeline -->
          <section id="historia">
            <p class="eyebrow">{{ t('propertyDetails.history.eyebrow', 'Trayectoria') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.history.heading', 'Historia del inmueble') }}</h2>
            <div class="mt-10">
              <PropertyTimeline
                :published-at="data.project.publishedAt"
                :status="data.project.status"
                :construction-percentage="data.project.constructionPercentage"
                :handover-date="data.project.handoverDate"
              />
            </div>
          </section>
        </div>

        <!-- Sidebar -->
        <aside>
          <div class="space-y-5 lg:sticky lg:top-32">
            <div id="contacto" ref="contactRef">
              <PropertyDecisionPanel :slug="String(route.params.slug)" :project="data.project" />
            </div>
            <div v-if="data.developer" class="rounded-2xl border border-line bg-white p-8">
              <p class="eyebrow mb-4">{{ t('propertyDetails.developer.eyebrow', 'Promotora') }}</p>
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

    <!-- Propiedades similares -->
    <div id="similares" class="no-print hairline mx-auto max-w-screen-2xl px-6 py-14 pt-14 lg:px-10">
      <p class="eyebrow">{{ t('propertyDetails.similar.eyebrow', 'Alternativas') }}</p>
      <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.similar.heading', 'Propiedades similares') }}</h2>
      <div class="mt-8"><SimilarProperties :slug="String(route.params.slug)" /></div>
    </div>

    <PropertyStickyBar :price="formatPrice(data.project.price)" :visible="showMobileBar" />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch(`/api/public/properties/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Project not found', fatal: true })

const seoTitle = `${data.value.project.name} — M&M Real Estate`
const seoDescription = [
  data.value.project.propertyType,
  data.value.project.community ? `en ${data.value.project.community}` : null,
  data.value.project.bedrooms != null ? `${data.value.project.bedrooms || 'Estudio'} hab.` : null,
  data.value.project.area ? `${Math.round(data.value.project.area)} m²` : null,
  data.value.project.price ? `desde AED ${new Intl.NumberFormat('en-US').format(data.value.project.price)}` : null,
]
  .filter(Boolean)
  .join(' · ')
const requestUrl = useRequestURL()
const seoImage = data.value.project.coverImage ? `${requestUrl.origin}/api/media/${data.value.project.coverImage}` : `${requestUrl.origin}/placeholder.svg`
const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: data.value!.project.name,
  description: seoDescription,
  image: seoImage,
  offers: data.value!.project.price
    ? { '@type': 'Offer', price: data.value!.project.price, priceCurrency: 'AED', availability: 'https://schema.org/InStock' }
    : undefined,
  address: data.value!.project.community ? { '@type': 'PostalAddress', addressLocality: data.value!.project.community, addressCountry: 'AE' } : undefined,
}))
useHead({
  title: seoTitle,
  meta: [
    { name: 'description', content: seoDescription },
    { property: 'og:title', content: seoTitle },
    { property: 'og:description', content: seoDescription },
    { property: 'og:image', content: seoImage },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) }],
})

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
const statusLabel = computed(() => ({ new: t('propertyDetails.status.new', 'Obra nueva'), under_construction: t('propertyDetails.status.underConstruction', 'En construcción'), ready: t('propertyDetails.status.ready', 'Listo para entrar') }[p.value.status as string] || p.value.status))

const sections = computed(() => {
  const s = [{ id: 'fotos', label: t('propertyDetails.nav.photos', 'Fotos') }, { id: 'score', label: t('propertyDetails.nav.score', 'Score') }]
  if (hasQuickFacts.value) s.push({ id: 'datos', label: t('propertyDetails.nav.quickFacts', 'Datos clave') })
  s.push(
    { id: 'resumen', label: t('propertyDetails.nav.aiSummary', 'Resumen IA') },
    { id: 'analisis', label: t('propertyDetails.nav.analysis', 'Análisis') },
    { id: 'precio', label: t('propertyDetails.nav.price', 'Precio') },
    { id: 'servicios', label: t('propertyDetails.nav.services', 'Servicios') },
    { id: 'ubicacion', label: t('propertyDetails.nav.location', 'Ubicación') },
    { id: 'orientacion', label: t('propertyDetails.nav.sun', 'Sol') },
    { id: 'hipoteca', label: t('propertyDetails.nav.mortgage', 'Hipoteca') },
    { id: 'historia', label: t('propertyDetails.nav.history', 'Historia') },
    { id: 'similares', label: t('propertyDetails.nav.similar', 'Similares') },
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
  if (p.value.bedrooms != null) out.push({ label: t('propertyDetails.facts.bedrooms', 'Habitaciones'), value: p.value.bedrooms || t('card.studio', 'Estudio') })
  if (p.value.bathrooms != null) out.push({ label: t('propertyDetails.facts.bathrooms', 'Baños'), value: String(p.value.bathrooms) })
  if (p.value.area) out.push({ label: t('propertyDetails.facts.area', 'Superficie'), value: `${Math.round(p.value.area)} m²` })
  if (p.value.energyRating) out.push({ label: t('propertyDetails.facts.energyRating', 'Eficiencia'), value: p.value.energyRating })
  if (p.value.orientation) out.push({ label: t('propertyDetails.facts.orientation', 'Orientación'), value: p.value.orientation })
  return out
})

const pros = computed(() => {
  const o: string[] = []
  if (p.value.hasPool) o.push(t('propertyDetails.pros.pool', 'Piscina en la comunidad'))
  if (['S', 'SW', 'SE'].includes(p.value.orientation)) o.push(t('propertyDetails.pros.southFacing', 'Muy luminoso — orientación sur'))
  if (['A', 'B'].includes(p.value.energyRating)) o.push(`${t('propertyDetails.pros.energyEfficient', 'Alta eficiencia energética')} (${p.value.energyRating})`)
  if (p.value.rentalYield >= 6.5) o.push(`${t('propertyDetails.pros.yield', 'Rentabilidad destacada')} (${p.value.rentalYield}%)`)
  if (p.value.hasGarage) o.push(t('propertyDetails.pros.garage', 'Plaza de garaje incluida'))
  if (p.value.hasGarden) o.push(t('propertyDetails.pros.garden', 'Jardín privado'))
  if (p.value.status === 'ready') o.push(t('propertyDetails.pros.readyToMoveIn', 'Listo para entrar a vivir'))
  if (p.value.accessible) o.push(t('propertyDetails.pros.accessible', 'Vivienda accesible'))
  return o.length ? o.slice(0, 6) : [t('propertyDetails.pros.defaultLocation', 'Ubicación privilegiada'), t('propertyDetails.pros.defaultFinishes', 'Acabados de calidad')]
})
const cons = computed(() => {
  const o: string[] = []
  if (p.value.status === 'new') o.push(t('propertyDetails.cons.offPlan', 'Entrega sobre plano — planifica la mudanza'))
  if (p.value.status === 'under_construction' && p.value.handoverDate) o.push(`${t('propertyDetails.cons.handoverExpected', 'Entrega prevista')}: ${p.value.handoverDate}`)
  if (!p.value.hasElevator && (p.value.bedrooms || 0) >= 2) o.push(t('propertyDetails.cons.checkElevator', 'Consulta disponibilidad de ascensor'))
  if (['D', 'E', 'F', 'G'].includes(p.value.energyRating)) o.push(t('propertyDetails.cons.improvableEfficiency', 'Eficiencia energética mejorable'))
  if (p.value.orientation === 'N') o.push(t('propertyDetails.cons.northFacing', 'Orientación norte — menos luz directa'))
  return o.length ? o.slice(0, 4) : [t('propertyDetails.cons.defaultVisit', 'Recomendamos visita para valorar acabados')]
})

// Nearby (deterministic demo POIs by project id)
const staging = computed(() => [
  { title: t('propertyDetails.staging.decorTitle', 'Decoración IA'), desc: t('propertyDetails.staging.decorDesc', 'Reimagina los espacios en tu estilo'), i: 1 },
  { title: t('propertyDetails.staging.homeStagingTitle', 'Home Staging IA'), desc: t('propertyDetails.staging.homeStagingDesc', 'Amuebla virtualmente cada estancia'), i: 2 },
])

const heart = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z"/></svg>'
const scale = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3v18M15 3v18M4 8h5M15 8h5M4 16h5M15 16h5"/></svg>'

// Scroll-spy: resalta la sección activa en el nav sticky
const activeSection = ref('fotos')
let sectionObserver: IntersectionObserver | null = null

// Barra CTA sticky en móvil: visible tras pasar el hero, hasta que aparece la tarjeta de contacto real
const heroRef = ref<HTMLElement | null>(null)
const contactRef = ref<HTMLElement | null>(null)
const heroPassed = ref(false)
const contactSeen = ref(false)
let heroObserver: IntersectionObserver | null = null
let contactObserver: IntersectionObserver | null = null
const showMobileBar = computed(() => heroPassed.value && !contactSeen.value)

onMounted(() => {
  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => { if (e.isIntersecting) activeSection.value = e.target.id })
    },
    { rootMargin: '-140px 0px -70% 0px', threshold: 0 },
  )
  sections.value.forEach((s) => {
    const el = document.getElementById(s.id)
    if (el) sectionObserver!.observe(el)
  })

  if (heroRef.value) {
    heroObserver = new IntersectionObserver(([e]) => { heroPassed.value = !e.isIntersecting }, { threshold: 0 })
    heroObserver.observe(heroRef.value)
  }
  if (contactRef.value) {
    contactObserver = new IntersectionObserver(([e]) => { if (e.isIntersecting) contactSeen.value = true }, { threshold: 0 })
    contactObserver.observe(contactRef.value)
  }
})
onUnmounted(() => {
  sectionObserver?.disconnect()
  heroObserver?.disconnect()
  contactObserver?.disconnect()
})
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
