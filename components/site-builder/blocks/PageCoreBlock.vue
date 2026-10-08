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

    <!-- Listado de propiedades: buscador + tarjetas -->
    <div v-if="core === 'properties-listing'" class="mx-auto max-w-screen-2xl px-6 py-8 lg:px-10">
      <div class="flex flex-wrap items-center gap-2">
        <div class="h-11 min-w-[14rem] flex-1 rounded-full border border-line bg-paper px-5 py-3 text-sm text-stone-400">Ciudad, barrio, calle o referencia…</div>
        <span class="rounded-full border border-line px-4 py-2.5 text-sm text-stone-500">Filtros</span>
        <span class="rounded-full border border-line px-4 py-2.5 text-sm text-stone-500">Recomendado</span>
      </div>
      <div v-if="cards.length" class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="p in cards" :key="p.id" class="overflow-hidden rounded-2xl border border-line bg-white">
          <div class="aspect-[4/3] bg-stone-100">
            <img v-if="p.image" :src="mediaUrl(p.image)" alt="" class="h-full w-full object-cover" loading="lazy" >
          </div>
          <div class="p-4">
            <p class="text-lg font-semibold tracking-tight">{{ p.price }}</p>
            <p class="mt-1 truncate font-serif text-xl">{{ p.name }}</p>
          </div>
        </div>
      </div>
      <p v-else class="py-16 text-center font-serif text-xl text-stone-400">Aquí aparecerán tus propiedades publicadas.</p>
    </div>

    <!-- Ficha: la de la propiedad más reciente, como ejemplo -->
    <div v-else-if="core === 'property-detail'" class="mx-auto max-w-screen-2xl px-6 py-8 lg:px-10">
      <template v-if="sample">
        <p class="text-[12px] text-stone-500">Ejemplo con «{{ sample.name }}»: cada ficha enseña su propiedad.</p>
        <div class="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div class="aspect-[16/10] overflow-hidden rounded-2xl bg-stone-100">
            <img v-if="sample.image" :src="mediaUrl(sample.image)" alt="" class="h-full w-full object-cover" loading="lazy" >
          </div>
          <div class="hidden gap-3 lg:grid">
            <div class="rounded-2xl bg-stone-100" />
            <div class="rounded-2xl bg-stone-100" />
          </div>
        </div>
        <div class="mt-6 grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            <h1 class="heading-serif text-4xl">{{ sample.name }}</h1>
            <p class="mt-2 text-2xl font-semibold">{{ sample.price }}</p>
            <div class="mt-6 space-y-2">
              <div class="h-3 w-full rounded bg-stone-100" />
              <div class="h-3 w-11/12 rounded bg-stone-100" />
              <div class="h-3 w-4/5 rounded bg-stone-100" />
            </div>
          </div>
          <div class="h-40 rounded-2xl border border-line bg-paper p-5 text-sm text-stone-500">Precio, «Atendido por» con el comercial de cada propiedad y su formulario</div>
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
import { PAGE_CORE_LABELS, PAGE_CORE_SOURCES, type PageCoreKind } from '~/utils/siteBuilder/pages'

const props = defineProps<{
  content: Record<string, any>
  projects?: any[]
  blogs?: any[]
}>()

const { format: formatPrice } = useCurrency()

const core = computed(() => props.content.core as PageCoreKind)
const label = computed(() => PAGE_CORE_LABELS[core.value] || 'Contenido de la página')
const source = computed(() => PAGE_CORE_SOURCES[core.value] || null)

function card(p: any) {
  return { id: p.id, name: p.name, price: p.price ? formatPrice(p.price) : '', image: p.photos?.[0] || p.coverImage || null }
}
const cards = computed(() => (props.projects || []).slice(0, 6).map(card))
const sample = computed(() => (props.projects?.length ? card(props.projects[0]) : null))
const articles = computed(() => (props.blogs || []).slice(0, 3))
</script>
