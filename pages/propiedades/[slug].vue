<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
    <div v-if="data" class="bg-paper">
      <!-- Gallery -->
      <section id="fotos" ref="heroRef" class="mx-auto max-w-screen-2xl px-6 pt-6 lg:px-10">
        <MediaGallery
          :photos="photos"
          :photo-alts="photoAlts"
          :name="data.project.name"
          :master-plan="masterPlan"
          :video-url="data.project.videoUrl"
          :drone-photo="dronePhoto"
          :night-photo="nightPhoto"
          :before-photo="beforePhoto"
          :after-photo="afterPhoto"
          :ai-staged-photo="aiStagedPhoto"
          :social-media="socialMediaForGallery"
          :media="publicMedia"
          :virtual-tour-url="virtualTourUrl"
          :floor-plans="floorPlans"
        />
      </section>

      <!-- Sticky section nav -->
      <nav class="no-print sticky top-[73px] z-30 mt-6 border-y border-line bg-paper/95 backdrop-blur">
        <div class="mx-auto flex max-w-screen-2xl items-center gap-6 px-6 lg:px-10">
          <!-- Los enlaces se desplazan; el CTA queda fuera, siempre a la vista aunque haya muchas secciones. -->
          <div class="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <!-- CTA fijo en escritorio (#110): aparece al pasar la galería, sin tapar contenido. -->
          <div v-if="heroPassed" class="hidden shrink-0 items-center gap-4 border-l border-line py-2 pl-6 lg:flex" data-testid="ficha-desktop-cta">
            <span class="min-w-0 text-right leading-tight">
              <span class="block max-w-[240px] truncate text-[13px] font-semibold text-ink">{{ data.project.name }}</span>
              <span v-if="publicLocation" class="block max-w-[240px] truncate text-[12px] text-stone-500">{{ publicLocation }}</span>
            </span>
            <span class="whitespace-nowrap text-[15px] font-bold text-ink">{{ formatPrice(data.project.price) }}</span>
            <button type="button" class="btn-primary whitespace-nowrap !px-5 !py-2.5" data-testid="ficha-request-visit" @click="requestVisit">{{ t('propertyStickyBar.requestVisit', 'Solicitar visita') }}</button>
          </div>
        </div>
      </nav>

      <div class="mx-auto max-w-screen-2xl px-6 py-10 lg:px-10">
        <div class="grid grid-cols-1 gap-14 lg:grid-cols-3">
          <!-- Orden y visibilidad de las secciones: los del Constructor (#110, PAGE_CORE_OPTIONS.sections). La cabecera va siempre primera. -->
          <div class="flex min-w-0 flex-col gap-20 lg:col-span-2" data-testid="ficha-main">
            <!-- Header -->
            <header>
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="border border-line bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest2 text-stone-600">{{ statusLabel }}</span>
                    <span v-if="data.project.rentalYield" class="rounded-full bg-paper px-3 py-1.5 text-[11px] font-semibold ring-1 ring-line">{{ data.project.rentalYield }}% {{ t('propertyDetails.facts.profitability', 'rentabilidad') }}</span>
                  </div>
                  <h1 class="heading-serif mt-4 text-4xl leading-tight [overflow-wrap:anywhere] md:text-5xl">{{ data.project.name }}</h1>
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
              <div class="hairline mt-8 flex flex-wrap gap-x-14 gap-y-5 pt-9">
                <div v-for="f in facts" :key="f.label"><p class="text-xl font-semibold">{{ f.value }}</p><p class="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ f.label }}</p></div>
              </div>
              <!-- Móvil y tableta (#110): el precio y «Solicitar visita» justo después de la
              información principal; en escritorio están en el panel lateral. -->
              <div class="no-print mt-8 flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-4 lg:hidden" data-testid="ficha-mobile-price">
                <div class="min-w-0">
                  <p class="text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ t('propertyStickyBar.price', 'Precio') }}</p>
                  <p class="truncate text-2xl font-bold text-ink">{{ formatPrice(data.project.price) }}</p>
                </div>
                <button type="button" class="btn-primary shrink-0 !px-5 !py-2.5" data-testid="ficha-mobile-request-visit" @click="requestVisit">{{ t('propertyStickyBar.requestVisit', 'Solicitar visita') }}</button>
              </div>
            </header>

            <!-- Serendipia Score -->
            <section v-if="show('score')" id="score" :style="at('score')">
              <LazySerendipiaScore hydrate-on-visible :slug="String(route.params.slug)" />
            </section>

            <!-- Datos clave -->
            <section v-if="hasQuickFacts && show('datos')" id="datos" :style="at('datos')">
              <p class="eyebrow !text-amber-700">{{ t('propertyDetails.quickFacts.eyebrow', 'A simple vista') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.quickFacts.heading', 'Datos clave') }}</h2>
              <div class="mt-7"><QuickFacts :project="data.project" :details="data.details" /></div>
            </section>

            <!-- Resumen IA -->
            <section v-if="show('resumen')" id="resumen" :style="at('resumen')">
              <div class="flex items-center gap-2">
                <p class="eyebrow !text-indigo-600">{{ t('propertyDetails.aiSummary.eyebrow', 'Resumen inteligente') }}</p>
              </div>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.aiSummary.heading', 'Lo que debes saber') }}</h2>
              <p v-if="data.project.aiSummary" class="mt-5 max-w-3xl text-[15px] leading-[1.9] text-stone-600">{{ data.project.aiSummary }}</p>
              <div class="mt-7 grid gap-5 sm:grid-cols-2">
                <div class="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-7">
                  <p class="mb-4 text-[11px] font-semibold uppercase tracking-widest text-emerald-700">{{ t('propertyDetails.aiSummary.pros', 'Lo mejor') }}</p>
                  <ul class="space-y-3">
                    <li v-for="pro in pros" :key="pro" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{{ pro }}</li>
                  </ul>
                </div>
                <div class="rounded-2xl border border-amber-100 bg-amber-50/50 p-7">
                  <p class="mb-4 text-[11px] font-semibold uppercase tracking-widest text-amber-700">{{ t('propertyDetails.aiSummary.cons', 'A considerar') }}</p>
                  <ul class="space-y-3">
                    <li v-for="c in cons" :key="c" class="flex items-start gap-2.5 text-sm text-stone-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{{ c }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- Análisis de inversión IA -->
            <section v-if="show('analisis')" id="analisis" :style="at('analisis')">
              <p class="eyebrow !text-emerald-700">{{ t('propertyDetails.investment.eyebrow', 'Para inversores') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.investment.heading', 'Análisis de inversión') }}</h2>
              <div class="mt-7">
                <LazyAIAnalysis
                  hydrate-on-visible
                  :slug="String(route.params.slug)"
                  :price="data.project.price"
                  :area="data.project.area"
                  :rental-yield="data.project.rentalYield"
                />
              </div>
            </section>

            <!-- Evolución de precio -->
            <section v-if="show('precio')" id="precio" :style="at('precio')">
              <p class="eyebrow !text-emerald-700">{{ t('propertyDetails.priceHistory.eyebrow', 'Histórico') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.priceHistory.heading', 'Evolución de precio') }}</h2>
              <div class="mt-7"><LazyPriceChart hydrate-on-visible :slug="String(route.params.slug)" /></div>
            </section>

            <!-- Ask AI -->
            <section v-if="show('preguntar')" class="no-print" :style="at('preguntar')">
              <LazyAskAI hydrate-on-visible :slug="String(route.params.slug)" />
            </section>

            <!-- Descripción -->
            <section v-if="data.project.description && show('descripcion')" id="descripcion" :style="at('descripcion')">
              <p class="eyebrow">{{ t('propertyDetails.description.eyebrow', 'Descripción') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.description.heading', 'Sobre esta propiedad') }}</h2>
              <!-- whitespace-pre-line keeps line breaks from descriptions written before the
              rich-text editor existed (plain text, no tags); v-html renders real formatting
              for anything saved since (bold/italic/lists/links) — both read correctly here. -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                class="prose-description mt-5 max-w-3xl whitespace-pre-line text-[15px] leading-[1.9] text-stone-600 [&_a]:text-accent-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5"
                v-html="data.project.description"
              />
            </section>

            <!-- Amenities -->
            <section v-if="data.amenities.length && show('comodidades')" id="comodidades" :style="at('comodidades')">
              <p class="eyebrow">{{ t('propertyDetails.amenities.eyebrow', 'Servicios del edificio') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.amenities.heading', 'Comodidades') }}</h2>
              <ul class="mt-7 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{{ a.name }}</li>
              </ul>
            </section>

            <!-- Plano de la vivienda y Estado del inmueble (#110): los planos del
            editor (sin recortar, con visor a pantalla completa) y el estado
            real de la ficha ampliada. Lo que no hay no sale. -->
            <div v-if="(floorPlans.length || conditionFacts.length) && show('plano-estado')" class="grid grid-cols-1 items-start gap-5" :class="{ 'xl:grid-cols-[1.2fr_1fr]': floorPlans.length && conditionFacts.length }" :style="at('plano-estado')">
              <PropertyFloorPlans :plans="floorPlans" :facts="{ area: p.area, bedrooms: p.bedrooms, bathrooms: p.bathrooms, hasTerrace: p.hasTerrace }" />
              <PropertyFactsCard anchor="estado" testid="property-condition" :title="t('facts.conditionHeading', 'Estado del inmueble')" :rows="conditionFacts" />
            </div>

            <!-- El edificio (separado de la vivienda) y Documentación disponible (#110). -->
            <div v-if="(buildingFacts.length || publicDocs.length) && show('edificio-documentacion')" class="grid grid-cols-1 items-start gap-5" :class="{ 'xl:grid-cols-2': buildingFacts.length && publicDocs.length }" :style="at('edificio-documentacion')">
              <PropertyFactsCard anchor="edificio" testid="property-building" :title="t('facts.buildingHeading', 'El edificio')" :rows="buildingFacts" :columns="publicDocs.length ? 1 : 2" />
              <PropertyDocumentsCard :documents="publicDocs" />
            </div>

            <!-- Campos personalizados que la agencia marcó «visible en la web pública» (FASE 0). Los internos nunca llegan aquí. -->
            <section v-if="data.customFields?.length && show('mas-informacion')" id="mas-informacion" data-testid="property-public-custom-fields" :style="at('mas-informacion')">
              <p class="eyebrow">{{ t('propertyDetails.customFields.eyebrow', 'Más detalles') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.customFields.heading', 'Más información') }}</h2>
              <dl class="mt-7 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <div v-for="f in data.customFields" :key="f.key">
                  <dt class="text-[12px] uppercase tracking-wide text-stone-400">{{ f.label }}</dt>
                  <dd class="mt-1 text-[15px] text-stone-700">{{ f.display }}</dd>
                </div>
              </dl>
            </section>

            <!-- Units -->
            <section v-if="data.unitTypes.length && show('tipologias')" id="tipologias" :style="at('tipologias')">
              <p class="eyebrow">{{ t('propertyDetails.units.eyebrow', 'Residencias') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.units.heading', 'Tipologías disponibles') }}</h2>
              <div class="mt-7 overflow-hidden rounded-2xl border border-line bg-white">
                <table class="w-full text-left text-sm">
                  <thead><tr class="border-b border-line bg-paper text-[11px] uppercase tracking-widest text-stone-450"><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.type', 'Tipo') }}</th><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.unit', 'Unidad') }}</th><th class="px-6 py-4 font-semibold">{{ t('propertyDetails.units.size', 'Superficie') }}</th></tr></thead>
                  <tbody><tr v-for="u in data.unitTypes" :key="u.id" class="border-b border-line/60 last:border-0"><td class="px-6 py-4 font-medium">{{ u.propertyType }}</td><td class="px-6 py-4 text-stone-600">{{ u.unitType }}</td><td class="px-6 py-4 text-stone-600">{{ u.size }}</td></tr></tbody>
                </table>
              </div>
            </section>

            <!-- Servicios cercanos -->
            <section v-if="show('servicios')" id="servicios" :style="at('servicios')">
              <p class="eyebrow !text-teal-700">{{ t('propertyDetails.lifestyle.eyebrow', 'El entorno') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.lifestyle.heading', 'Estilo de vida') }}</h2>
              <p class="mt-3 max-w-2xl text-[13px] text-stone-500">{{ t('propertyDetails.lifestyle.subtitle', 'Datos reales del entorno, obtenidos de OpenStreetMap dentro de un radio de 2 km.') }}</p>
              <div class="mt-7"><LazyLifestyleBlock hydrate-on-visible :slug="String(route.params.slug)" /></div>
            </section>

            <!-- Ubicación / mapa -->
            <section v-if="show('ubicacion')" id="ubicacion" :style="at('ubicacion')">
              <p class="eyebrow !text-blue-700">{{ t('propertyDetails.location.eyebrow', 'Ubicación') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.location.heading', 'Dónde está') }}</h2>
              <div class="relative mt-7 h-80 overflow-hidden rounded-2xl border border-line">
                <ClientOnly>
                  <PropertyLocationMap v-if="hasValidCoords(data.project)" :lat="data.project.lat" :lng="data.project.lng" :label="data.project.community || data.project.name" />
                  <template v-else>
                    <div class="absolute inset-0 flex items-center justify-center bg-paper">
                      <p class="max-w-xs text-center text-[12px] text-stone-400">{{ t('propertyDetails.location.noCoords') }}</p>
                    </div>
                  </template>
                  <template #fallback>
                    <div class="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100" />
                    <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(30,64,175,0.08) 1px,transparent 1px);background-size:26px 26px" />
                    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg ring-4 ring-white">●</span>
                    </div>
                    <span class="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-[11px] uppercase tracking-widest2 text-stone-600 backdrop-blur">{{ data.project.community }}</span>
                  </template>
                </ClientOnly>
              </div>
            </section>

            <!-- Sol y orientación -->
            <section v-if="show('orientacion')" id="orientacion" :style="at('orientacion')">
              <p class="eyebrow !text-amber-700">{{ t('propertyDetails.orientation.eyebrow', 'Luz natural') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.orientation.heading', 'Sol y orientación') }}</h2>
              <div class="mt-7 rounded-2xl border border-amber-100 bg-amber-50/40 p-6 sm:p-8">
                <LazySunOrientation hydrate-on-visible :orientation="data.project.orientation" :lat="data.project.lat" :lng="data.project.lng" />
              </div>
            </section>

            <!-- Decoración / Home Staging IA -->
            <section v-if="show('staging')" class="no-print" :style="at('staging')">
              <p class="eyebrow !text-indigo-600">{{ t('propertyDetails.staging.eyebrow', 'Imagina tu hogar') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.staging.heading', 'Visualiza el potencial') }}</h2>
              <div class="mt-7 grid gap-5 sm:grid-cols-2">
                <div v-for="s in staging" :key="s.title" class="group relative overflow-hidden rounded-2xl border border-line bg-white">
                  <div class="aspect-[16/10] overflow-hidden bg-stone-100"><img :src="photos[s.i % photos.length]" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" ></div>
                  <div class="flex items-center justify-between p-5">
                    <div><p class="font-serif text-lg font-medium">{{ s.title }}</p><p class="text-[13px] text-stone-500">{{ s.desc }}</p></div>
                    <NuxtLink to="/contacto" class="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white">{{ t('propertyDetails.staging.generate', 'Generar') }}</NuxtLink>
                  </div>
                </div>
              </div>
            </section>

            <!-- Hipoteca -->
            <section v-if="show('hipoteca')" id="hipoteca" :style="at('hipoteca')">
              <p class="eyebrow !text-emerald-700">{{ t('propertyDetails.mortgage.eyebrow', 'Financiación') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.mortgage.heading', 'Hipoteca y costes') }}</h2>
              <div class="mt-7"><LazyMortgageCalculator hydrate-on-visible :price="data.project.price || 0" :rental-yield="data.project.rentalYield" :status="data.project.status" /></div>
            </section>

            <!-- Historia / timeline -->
            <section v-if="show('historia')" id="historia" :style="at('historia')">
              <p class="eyebrow">{{ t('propertyDetails.history.eyebrow', 'Trayectoria') }}</p>
              <h2 class="heading-serif mt-3 text-3xl">{{ t('propertyDetails.history.heading', 'Historia del inmueble') }}</h2>
              <div class="mt-10">
                <LazyPropertyTimeline
                  hydrate-on-visible
                  :published-at="data.project.publishedAt"
                  :status="data.project.status"
                  :construction-percentage="data.project.constructionPercentage"
                  :handover-date="data.project.handoverDate"
                />
              </div>
            </section>
          </div>

          <!-- Sidebar -->
          <!-- No es sticky entero (#110): es más alto que la pantalla y su final quedaba
          inalcanzable. La llamada a «Solicitar visita» queda fija en la barra de secciones. -->
          <aside class="min-w-0">
            <div class="space-y-6">
              <div id="contacto" ref="contactRef">
                <PropertyDecisionPanel :slug="String(route.params.slug)" :project="data.project" :agent="data.agent" :details="(data as any).details" />
              </div>
              <div v-if="data.developer" class="rounded-2xl border border-line bg-white p-8">
                <p class="eyebrow mb-4">{{ t('propertyDetails.developer.eyebrow', 'Promotora') }}</p>
                <div class="flex items-center gap-4">
                  <div class="flex h-14 w-14 items-center justify-center border border-line bg-paper">
                    <img v-if="data.developer.logo" :src="mediaUrl(data.developer.logo)" class="max-h-10 object-contain" >
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
        <div class="mt-8"><LazySimilarProperties hydrate-on-visible :slug="String(route.params.slug)" :show-featured="coreOptions.showFeatured !== false" :featured-title="coreOptions.featuredTitle || ''" /></div>
      </div>

      <PropertyStickyBar :price="formatPrice(data.project.price)" :visible="showMobileBar" @request="requestVisit" />
    </div>
  </SitePageLayout>
</template>

<script setup lang="ts">
import { hasValidCoords } from '~/utils/maps/coords'
import { formatDisplayPrice } from '~/utils/currency'
import { PROPERTY_TYPE_LABELS } from '~/utils/propertySheet'
import { buildQuickFacts } from '~/utils/quickFacts'
import { buildingRows, conditionRows, type PublicDocument } from '~/utils/propertyFacts'
import type { PublicFloorPlan } from '~/utils/floorPlans'
import { PAGE_CORE_TYPE, fichaSectionLayout } from '~/utils/siteBuilder/pages'

const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch(`/api/public/properties/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Project not found', fatal: true })
// Página «Ficha de propiedad» del Constructor Web: la plantilla de todas las
// fichas. La ficha es su zona dinámica; con una versión publicada, las
// secciones que se le añadan van encima o debajo en todas. El SEO sigue
// siendo el de cada propiedad.
const { page: sitePage, homeData: sitePageData } = await useSitePage('ficha-propiedad')
// Lo ajustable de la zona dinámica en el Constructor (utils/siteBuilder/pages.ts,
// PAGE_CORE_OPTIONS): las propiedades destacadas y el orden y la visibilidad
// de las secciones. Sin versión publicada, lo de partida.
const coreOptions = computed<Record<string, any>>(() => (sitePage.value?.published ? sitePage.value.blocks?.find((b: any) => b.type === PAGE_CORE_TYPE)?.content : null) || {})

// property_social_media.platform is a free-form DB column; MediaGallery only
// knows how to render the two platforms it actually embeds, so narrow here
// rather than widening the component's prop type to accept every string.
const socialMediaForGallery = computed(() =>
  (data.value?.socialMedia || [])
    .filter((s): s is typeof s & { platform: 'instagram' | 'tiktok' } => s.platform === 'instagram' || s.platform === 'tiktok')
    .map((s) => ({ platform: s.platform, url: s.url, caption: s.caption })),
)

// El nombre de la inmobiliaria de esta web, no uno fijo.
const { tenant } = useTenant()
const seoTitle = computed(() => [data.value?.project.name, tenant.value?.companyName || tenant.value?.name].filter(Boolean).join(' — '))
// SEO y schema.org van en la moneda en la que está guardado el precio (la de
// la agencia), nunca en la que eligió un visitante (utils/currency.ts).
const { format: formatPrice, base: baseCurrency } = useCurrency()
const seoDescription = [
  data.value.project.propertyType ? PROPERTY_TYPE_LABELS[data.value.project.propertyType] || data.value.project.propertyType : null,
  data.value.project.community ? `en ${data.value.project.community}` : null,
  data.value.project.bedrooms != null ? `${data.value.project.bedrooms || 'Estudio'} hab.` : null,
  data.value.project.area ? `${Math.round(data.value.project.area)} m²` : null,
  data.value.project.price ? `desde ${formatDisplayPrice(data.value.project.price, baseCurrency.value, baseCurrency.value)}` : null,
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
    ? { '@type': 'Offer', price: data.value!.project.price, priceCurrency: baseCurrency.value, availability: 'https://schema.org/InStock' }
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

const { isFavorite, toggle: toggleFav, load: loadFav } = useFavorites()
const { has: hasCompare, toggle: toggleCompare, load: loadCompare } = useCompare()
onMounted(() => { loadFav(); loadCompare() })
// Núcleo N8a (FASE 32): una ficha abierta desde el enlace personal que se le
// envió a alguien por email o por el chat (`?f=<token>`) lo registra al
// pintarse en el navegador; el servidor sólo lo cuenta si el token es de esta
// agencia y de esta propiedad. Sin `f`, nada cambia.
onMounted(() => {
  const f = typeof route.query.f === 'string' ? route.query.f : ''
  if (f) $fetch(`/api/public/properties/${encodeURIComponent(String(route.params.slug))}/view`, { method: 'POST', body: { f } }).catch(() => {})
})
const fav = computed(() => isFavorite(data.value!.project.id))
const inCompare = computed(() => hasCompare(data.value!.project.id))
function doCompare() {
  const p = data.value!.project
  toggleCompare({ id: p.id, slug: p.slug, name: p.name, cover: p.coverImage, price: p.price })
}
const shared = ref(false)
async function doShare() {
  const url = location.href
  try {
    if (navigator.share) await navigator.share({ title: data.value!.project.name, url })
    else await navigator.clipboard.writeText(url)
    shared.value = true
    setTimeout(() => (shared.value = false), 1600)
  } catch {
    // Share sheet cancelled by the user, or clipboard permission denied — not an error to surface.
  }
}

// La galería ya llega filtrada del servidor: sólo fotos publicables, no
// privadas y no ocultas, en su orden (FASE 7). El alt de cada foto, si lo
// tiene; si no, el nombre de la promoción.
const galleryRows = computed<any[]>(() => {
  const rows: any[] = []
  const seen = new Set<string>()
  if (data.value?.project.coverImage) {
    seen.add(data.value.project.coverImage)
    rows.push({ image: data.value.project.coverImage, alt: null })
  }
  for (const g of (data.value?.gallery as any[]) || []) {
    if (!g.image || seen.has(g.image)) continue
    seen.add(g.image)
    rows.push(g)
  }
  return rows
})
const photos = computed<string[]>(() => galleryRows.value.map((g) => mediaUrl(g.image)))
const photoAlts = computed<string[]>(() => galleryRows.value.map((g, i) => g.alt || g.title || `${data.value?.project.name || ''} ${i + 1}`.trim()))
const publicMedia = computed<any[]>(() => ((data.value as any)?.media as any[]) || [])
const virtualTourUrl = computed<string | null>(() => ((data.value as any)?.details?.virtualTourUrl as string) || null)
// Documentación disponible (#110): los PDF publicables de la multimedia y los documentos «Público» (sin caducar).
const publicDocs = computed<PublicDocument[]>(() => [
  ...publicMedia.value.filter((m) => m.mediaType === 'pdf').map((m) => ({ key: `m${m.id}`, title: m.title || t('propertyDetails.documents.brochure', 'Folleto'), typeLabel: m.caption || null, mimeType: 'application/pdf', url: m.url })),
  ...((((data.value as any)?.documents as any[]) || []).map((d) => ({ key: `d${d.id}`, title: d.title, typeLabel: d.docTypeLabel, mimeType: d.mimeType, sizeBytes: d.sizeBytes, url: d.url, isDocument: true }))),
])
// Planos (paso «Planos» del editor), estado del inmueble y edificio (#110).
const floorPlans = computed<PublicFloorPlan[]>(() => (((data.value as any)?.floorPlans as PublicFloorPlan[]) || []).filter((f) => !!f.image))
const conditionFacts = computed(() => conditionRows(p.value, (data.value as any)?.details, t))
const buildingFacts = computed(() => buildingRows(p.value, (data.value as any)?.details, t, formatPrice))
const masterPlan = computed(() => (data.value?.project.masterPlanImage ? mediaUrl(data.value.project.masterPlanImage) : null))
const dronePhoto = computed(() => (data.value?.project.dronePhoto ? mediaUrl(data.value.project.dronePhoto) : null))
const nightPhoto = computed(() => (data.value?.project.nightPhoto ? mediaUrl(data.value.project.nightPhoto) : null))
const beforePhoto = computed(() => (data.value?.project.beforePhoto ? mediaUrl(data.value.project.beforePhoto) : null))
const afterPhoto = computed(() => (data.value?.project.afterPhoto ? mediaUrl(data.value.project.afterPhoto) : null))
const aiStagedPhoto = computed(() => (data.value?.project.aiStagedPhoto ? mediaUrl(data.value.project.aiStagedPhoto) : null))

const p = computed(() => data.value!.project)
const statusLabel = computed(() => ({ new: t('propertyDetails.status.new', 'Obra nueva'), under_construction: t('propertyDetails.status.underConstruction', 'En construcción'), ready: t('propertyDetails.status.ready', 'Listo para entrar') }[p.value.status as string] || p.value.status))

// Orden y visibilidad de las secciones que se configuran en el Constructor
// (#110). Sin configuración, el orden de partida de FICHA_SECTIONS.
const layout = computed(() => fichaSectionLayout(coreOptions.value.sections))
const show = (key: string) => !layout.value.hidden.has(key)
const at = (key: string) => ({ order: layout.value.order[key] })

// La barra de secciones sigue el mismo orden: Fotos primero y Similares al final.
const sections = computed(() => {
  const items: { id: string; key: string; label: string; when?: boolean }[] = [
    { id: 'score', key: 'score', label: t('propertyDetails.nav.score', 'Score') },
    { id: 'datos', key: 'datos', label: t('propertyDetails.nav.quickFacts', 'Datos clave'), when: hasQuickFacts.value },
    { id: 'resumen', key: 'resumen', label: t('propertyDetails.nav.aiSummary', 'Resumen IA') },
    { id: 'analisis', key: 'analisis', label: t('propertyDetails.nav.analysis', 'Análisis') },
    { id: 'precio', key: 'precio', label: t('propertyDetails.nav.price', 'Precio') },
    { id: 'plano', key: 'plano-estado', label: t('propertyDetails.nav.floorPlan', 'Plano'), when: floorPlans.value.length > 0 },
    { id: 'estado', key: 'plano-estado', label: t('propertyDetails.nav.condition', 'Estado'), when: conditionFacts.value.length > 0 },
    { id: 'edificio', key: 'edificio-documentacion', label: t('propertyDetails.nav.building', 'Edificio'), when: buildingFacts.value.length > 0 },
    { id: 'documentacion', key: 'edificio-documentacion', label: t('propertyDetails.nav.documents', 'Documentación'), when: publicDocs.value.length > 0 },
    { id: 'servicios', key: 'servicios', label: t('propertyDetails.nav.services', 'Servicios') },
    { id: 'ubicacion', key: 'ubicacion', label: t('propertyDetails.nav.location', 'Ubicación') },
    { id: 'orientacion', key: 'orientacion', label: t('propertyDetails.nav.sun', 'Sol') },
    { id: 'hipoteca', key: 'hipoteca', label: t('propertyDetails.nav.mortgage', 'Hipoteca') },
    { id: 'historia', key: 'historia', label: t('propertyDetails.nav.history', 'Historia') },
  ]
  const { order, hidden } = layout.value
  const middle = items.filter((s) => s.when !== false && !hidden.has(s.key)).sort((a, b) => (order[a.key] || 0) - (order[b.key] || 0))
  return [
    { id: 'fotos', label: t('propertyDetails.nav.photos', 'Fotos') },
    ...middle.map(({ id, label }) => ({ id, label })),
    { id: 'similares', label: t('propertyDetails.nav.similar', 'Similares') },
  ]
})

// Los mismos datos que pinta QuickFacts: sin ninguno, ni sección ni pestaña.
const typeLabel = usePropertyTypeLabel()
const hasQuickFacts = computed(() => buildQuickFacts(p.value, (data.value as any)?.details, t, typeLabel).length > 0)

const facts = computed(() => {
  const out: { label: string; value: string }[] = []
  if (p.value.bedrooms != null) out.push({ label: t('propertyDetails.facts.bedrooms', 'Habitaciones'), value: p.value.bedrooms ? String(p.value.bedrooms) : t('card.studio', 'Estudio') })
  if (p.value.bathrooms != null) out.push({ label: t('propertyDetails.facts.bathrooms', 'Baños'), value: String(p.value.bathrooms) })
  if (p.value.area) out.push({ label: t('propertyDetails.facts.area', 'Superficie'), value: `${Math.round(p.value.area)} m²` })
  if (p.value.energyRating) out.push({ label: t('propertyDetails.facts.energyRating', 'Eficiencia'), value: p.value.energyRating })
  if (p.value.orientation) out.push({ label: t('propertyDetails.facts.orientation', 'Orientación'), value: p.value.orientation })
  return out
})

const pros = computed(() => {
  const o: string[] = []
  if (p.value.hasPool) o.push(t('propertyDetails.pros.pool', 'Piscina en la comunidad'))
  if (p.value.orientation && ['S', 'SW', 'SE'].includes(p.value.orientation)) o.push(t('propertyDetails.pros.southFacing', 'Muy luminoso — orientación sur'))
  if (p.value.energyRating && ['A', 'B'].includes(p.value.energyRating)) o.push(`${t('propertyDetails.pros.energyEfficient', 'Alta eficiencia energética')} (${p.value.energyRating})`)
  if (p.value.rentalYield != null && p.value.rentalYield >= 6.5) o.push(`${t('propertyDetails.pros.yield', 'Rentabilidad destacada')} (${p.value.rentalYield}%)`)
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
  if (p.value.energyRating && ['D', 'E', 'F', 'G'].includes(p.value.energyRating)) o.push(t('propertyDetails.cons.improvableEfficiency', 'Eficiencia energética mejorable'))
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

// Barra CTA fija en móvil: visible tras pasar el hero, salvo mientras la
// tarjeta de contacto real está a la vista (antes, una vez vista, no volvía).
const heroRef = ref<HTMLElement | null>(null)
const contactRef = ref<HTMLElement | null>(null)
const heroPassed = ref(false)
const contactInView = ref(false)
let heroObserver: IntersectionObserver | null = null
let contactObserver: IntersectionObserver | null = null
const showMobileBar = computed(() => heroPassed.value && !contactInView.value)
// «Solicitar visita» (#110): con comercial y agenda, abre la reserva real de
// «Atendido por» (PropertyDecisionPanel); sin ella, lleva al formulario.
const visitRequest = useState<number>('ficha-visit-request', () => 0)
function requestVisit() {
  if ((data.value as any)?.agent?.slug) visitRequest.value++
  else document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
// Ubicación pública (la privacidad ya quitó portal, planta y número en el servidor).
const publicLocation = computed(() => [data.value?.project.community, (data.value?.project as any)?.city].filter(Boolean).join(', '))

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
    contactObserver = new IntersectionObserver(([e]) => { contactInView.value = e.isIntersecting }, { threshold: 0 })
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
