<template>
  <!-- Sólo en el lienzo y en Vista previa: en la web publicada la zona
       dinámica es la página real (SiteBlockRenderer pinta ahí su slot
       `core`). Aquí se enseña con datos reales de la empresa, sin nodos
       editables: no hay nada que escribir en ella, se rellena sola. -->
  <section class="relative border-y-2 border-dashed border-stone-300 bg-white" data-testid="page-core-preview" :data-core="core">
    <div class="flex flex-wrap items-center justify-between gap-2 bg-stone-100 px-6 py-2.5 text-[12px] text-stone-600 lg:px-10">
      <p class="flex items-center gap-2 font-semibold text-ink">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path stroke-linecap="round" d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        Zona dinámica · {{ label }}
      </p>
      <p>Se rellena sola{{ source ? ` desde ${source.label}` : '' }}. Añade secciones encima o debajo.</p>
    </div>

    <!-- Listado de propiedades: la misma composición que la web (pages/propiedades/index.vue):
         barra, panel de filtros y tarjetas del catálogo con datos reales. Aquí no filtra nada. -->
    <div v-if="core === 'properties-listing'" class="bg-[#fbfaf7] px-6 py-6 lg:px-10" data-testid="page-core-catalog">
      <div class="flex items-center gap-3">
        <div class="h-[46px] flex-1 rounded-full border border-line bg-white px-5 py-3 text-sm text-stone-400">Ciudad, barrio, calle o referencia…</div>
        <span class="inline-flex h-[46px] items-center rounded-xl border border-[#e3ded6] bg-white px-4 text-sm">Recomendado</span>
        <span class="inline-flex h-[46px] items-center rounded-xl bg-[#16150f] px-4 text-sm text-white">Galería</span>
        <span class="inline-flex h-[46px] items-center rounded-xl border border-[#e3ded6] bg-white px-4 text-sm">Mapa</span>
      </div>
      <div class="mt-6 flex items-start gap-6">
        <div class="hidden w-[335px] shrink-0 lg:block">
          <CatalogFilters :query="{}" :facets="null" :total="(projects || []).length" :items="projects || []" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[15px] text-stone-500"><strong class="font-bold text-ink">{{ (projects || []).length }}</strong> propiedades</p>
          <div v-if="(projects || []).length" class="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <ProjectCard v-for="p in (projects || []).slice(0, 6)" :key="p.id" :project="p" variant="catalog" />
          </div>
          <p v-else class="py-16 text-center font-serif text-xl text-stone-400">Aquí aparecerán tus propiedades publicadas.</p>
        </div>
      </div>
    </div>

    <!-- Ficha: la de la propiedad más reciente, como ejemplo -->
    <div v-else-if="core === 'property-detail'" class="mx-auto max-w-screen-2xl px-6 py-8 lg:px-10">
      <template v-if="sample">
        <p class="text-[12px] text-stone-500">Ejemplo con «{{ sample.name }}»: cada ficha enseña su propiedad.</p>
        <!-- La composición de la ficha (#111): dos columnas desde arriba, como en la web. -->
        <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.44fr)]">
          <div class="min-w-0">
            <div class="aspect-[2.2/1] overflow-hidden rounded-[14px] bg-stone-100">
              <img v-if="sample.image" :src="mediaUrl(sample.image)" alt="" class="h-full w-full object-cover" loading="lazy" >
            </div>
            <div class="mt-2 grid grid-cols-5 gap-2" aria-hidden="true">
              <div v-for="i in 4" :key="i" class="aspect-[4/3] rounded-lg bg-stone-100" />
              <div class="aspect-[4/3] rounded-lg bg-[#1f3a30]" />
            </div>
            <div class="mt-4 rounded-xl border border-[#ece8e1] bg-white px-4 py-3 text-[12px] text-stone-500">Fotos · Score · Datos clave · Plano · … · Similares</div>
            <div class="pcard mt-4">
              <h1 class="heading-serif text-3xl">{{ sample.name }}</h1>
              <p class="mt-2 text-xl font-semibold">{{ sample.price }}</p>
              <!-- Las secciones de la ficha en el orden y con la visibilidad de la zona (#110), como saldrán en la web. -->
              <ol class="mt-5 space-y-1.5" data-testid="page-core-sections-preview">
                <li v-for="s in fichaSections.visible" :key="s.key" class="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-[12.5px] text-stone-600" :data-section="s.key">
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />{{ s.label }}
                </li>
              </ol>
              <p v-if="fichaSections.hidden" class="mt-2 text-[11.5px] text-stone-400">{{ fichaSections.hidden === 1 ? '1 sección oculta' : `${fichaSections.hidden} secciones ocultas` }} en esta web.</p>
            </div>
          </div>
          <div class="space-y-3 text-[13px] text-stone-500">
            <div class="pcard"><strong class="text-ink">Precio</strong> y próxima visita disponible</div>
            <div class="pcard"><strong class="text-ink">Atendido por</strong>, con el comercial de cada propiedad y su formulario</div>
            <div class="pcard"><strong class="text-ink">Indicadores</strong> y <strong class="text-ink">Decisión rápida</strong>, sólo con datos</div>
          </div>
        </div>
        <div class="mt-8 grid gap-3 border-t border-line pt-6 text-[12px] text-stone-500 sm:grid-cols-2">
          <p><strong class="text-ink">Propiedades similares</strong> · se calculan solas para cada ficha.</p>
          <p data-testid="page-core-featured-note">
            <strong class="text-ink">{{ content.featuredTitle || 'Propiedades destacadas' }}</strong>
            · {{ content.showFeatured === false ? 'ocultas en esta web.' : 'las marcadas como Exclusiva, debajo de las similares.' }}
          </p>
        </div>
      </template>
      <p v-else class="py-16 text-center font-serif text-xl text-stone-400">Cuando publiques una propiedad, su ficha se verá aquí.</p>
    </div>

    <!-- Blog: cabecera y artículos -->
    <div v-else-if="core === 'blog-index'" class="mx-auto max-w-screen-2xl px-6 py-8 lg:px-10">
      <p class="eyebrow">Journal</p>
      <h1 class="heading-serif mt-3 text-4xl">Ideas e historias</h1>
      <div v-if="articles.length" class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="b in articles" :key="b.id">
          <div class="aspect-[3/2] overflow-hidden bg-stone-100">
            <img v-if="b.image" :src="mediaUrl(b.image)" alt="" class="h-full w-full object-cover" loading="lazy" >
          </div>
          <p class="mt-4 font-serif text-xl leading-snug">{{ b.title || b.slug }}</p>
        </div>
      </div>
      <p v-else class="py-16 text-center font-serif text-xl text-stone-400">Aún no hay artículos publicados.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { FICHA_SECTIONS, PAGE_CORE_LABELS, PAGE_CORE_SOURCES, normalizeFichaSections, type PageCoreKind } from '~/utils/siteBuilder/pages'
import { SITE_BLOCK_KEY, type SiteBlockContext } from '~/composables/useSiteEditor'

const props = defineProps<{
  content: Record<string, any>
  projects?: any[]
  blogs?: any[]
}>()

const { format: formatPrice } = useCurrency()
// La zona entera es un solo elemento del lienzo: las tarjetas y el panel de
// muestra (los mismos componentes que la web) no exponen nodos editables.
provide(SITE_BLOCK_KEY, null as unknown as SiteBlockContext)

const core = computed(() => props.content.core as PageCoreKind)
const label = computed(() => PAGE_CORE_LABELS[core.value] || 'Contenido de la página')
const source = computed(() => PAGE_CORE_SOURCES[core.value] || null)

function card(p: any) {
  return { id: p.id, name: p.name, price: p.price ? formatPrice(p.price) : '', image: p.photos?.[0] || p.coverImage || null }
}
const sample = computed(() => (props.projects?.length ? card(props.projects[0]) : null))
const articles = computed(() => (props.blogs || []).slice(0, 3))

const SECTION_LABELS = Object.fromEntries(FICHA_SECTIONS.map((x) => [x.key, x.label]))
const fichaSections = computed(() => {
  const list = normalizeFichaSections(props.content.sections)
  return { visible: list.filter((x) => x.visible).map((x) => ({ key: x.key, label: SECTION_LABELS[x.key] })), hidden: list.filter((x) => !x.visible).length }
})
</script>
