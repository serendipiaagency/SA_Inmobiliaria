<template>
  <div class="no-print flex flex-wrap items-center justify-between gap-x-6 gap-y-3" data-testid="ficha-breadcrumbs">
    <nav :aria-label="t('ficha.breadcrumbs', 'Estás en')" class="min-w-0">
      <ol class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-stone-500">
        <li><NuxtLink to="/" class="hover:text-ink">{{ t('ficha.home', 'Inicio') }}</NuxtLink></li>
        <li aria-hidden="true" class="text-stone-300">›</li>
        <li><NuxtLink :to="catalogHref" class="hover:text-ink" data-testid="ficha-breadcrumb-catalog">{{ t('ficha.properties', 'Propiedades') }}</NuxtLink></li>
        <li aria-hidden="true" class="text-stone-300">›</li>
        <li class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]" aria-current="page">{{ name }}</li>
      </ol>
    </nav>

    <div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
      <button type="button" class="bc-action" data-testid="ficha-share" @click="share">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.4 13.3 7.2 4.3M15.6 6.4l-7.2 4.3" /></svg>
        <span>{{ shared ? t('ficha.copied', 'Enlace copiado') : t('ficha.share', 'Compartir') }}</span>
      </button>
      <button type="button" class="bc-action" :class="{ 'bc-action-on': inCompare }" :aria-pressed="inCompare" data-testid="ficha-compare" @click="compare">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" /></svg>
        <span>{{ inCompare ? t('ficha.inCompare', 'En el comparador') : t('ficha.compare', 'Comparar') }}</span>
      </button>

      <div class="flex items-center gap-2">
        <NuxtLink v-if="prev" :to="`/propiedades/${prev.slug}`" class="bc-pill" :title="prev.name" rel="prev" data-testid="ficha-prev" @click="keepContext">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          {{ t('ficha.previous', 'Anterior') }}
        </NuxtLink>
        <span v-else class="bc-pill bc-pill-off" aria-disabled="true" data-testid="ficha-prev-disabled">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          {{ t('ficha.previous', 'Anterior') }}
        </span>
        <NuxtLink v-if="next" :to="`/propiedades/${next.slug}`" class="bc-pill" :title="next.name" rel="next" data-testid="ficha-next" @click="keepContext">
          {{ t('ficha.next', 'Siguiente') }}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </NuxtLink>
        <span v-else class="bc-pill bc-pill-off" aria-disabled="true" data-testid="ficha-next-disabled">
          {{ t('ficha.next', 'Siguiente') }}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mergePage, neighborsInContext, nextPage, previousPage, readCatalogContext, saveCatalogContext, type CatalogContext, type CatalogContextItem } from '~/utils/catalogContext'

/**
 * Migas de la ficha (#111): «Inicio › Propiedades › Nombre» y, a la derecha,
 * Compartir, Comparar, «‹ Anterior» y «Siguiente ›».
 *
 * Anterior / Siguiente siguen la búsqueda del catálogo desde la que se llegó
 * (utils/catalogContext.ts: sus filtros, su orden y su página; al llegar al
 * borde de la página se pide la de al lado con los mismos filtros). Sin ese
 * contexto — se entró por un enlace directo —, las vecinas del orden por
 * defecto del catálogo (`/neighbors`). Sin vecina, el botón queda apagado.
 */
const props = defineProps<{
  slug: string
  name: string
  project: { id: number; slug?: string | null; name: string; coverImage?: string | null; price?: number | null }
}>()

const { t } = useI18n()
const { has: hasCompare, toggle: toggleCompare, load: loadCompare } = useCompare()

const prev = ref<CatalogContextItem | null>(null)
const next = ref<CatalogContextItem | null>(null)
const catalogHref = ref('/propiedades')
let context: CatalogContext | null = null

async function fetchPage(ctx: CatalogContext, page: number): Promise<CatalogContextItem[]> {
  try {
    const res = await $fetch<{ rows: { slug: string; name: string }[] }>('/api/public/properties', { query: { ...ctx.query, page, perPage: ctx.perPage } })
    return (res.rows || []).map((r) => ({ slug: r.slug, name: r.name }))
  } catch {
    return []
  }
}

async function resolveNeighbors() {
  let ctx = readCatalogContext()
  let found = neighborsInContext(ctx, props.slug)
  if (ctx && found) {
    catalogHref.value = ctx.href
    // En el borde de lo guardado, la página de al lado con los mismos filtros.
    if (!found.prev) {
      const page = previousPage(ctx)
      if (page) ctx = mergePage(ctx, page, await fetchPage(ctx, page))
    }
    found = neighborsInContext(ctx, props.slug)
    if (ctx && found && !found.next) {
      const page = nextPage(ctx)
      if (page) ctx = mergePage(ctx, page, await fetchPage(ctx, page))
    }
    found = neighborsInContext(ctx, props.slug)
    context = ctx
    prev.value = found?.prev || null
    next.value = found?.next || null
    return
  }
  try {
    const res = await $fetch<{ prev: CatalogContextItem | null; next: CatalogContextItem | null }>(`/api/public/properties/${encodeURIComponent(props.slug)}/neighbors`)
    prev.value = res.prev
    next.value = res.next
  } catch {
    prev.value = null
    next.value = null
  }
}

/** Al pasar a la vecina, lo guardado ya incluye las páginas que se pidieron. */
function keepContext() {
  if (context) saveCatalogContext(context)
}

onMounted(() => {
  loadCompare()
  resolveNeighbors()
})
watch(
  () => props.slug,
  () => resolveNeighbors(),
)

const inCompare = computed(() => hasCompare(props.project.id))
function compare() {
  const p = props.project
  toggleCompare({ id: p.id, slug: p.slug, name: p.name, cover: p.coverImage, price: p.price })
}

const shared = ref(false)
async function share() {
  const url = location.href.split('#')[0]
  try {
    if (navigator.share) await navigator.share({ title: props.name, url })
    else {
      await navigator.clipboard.writeText(url)
      shared.value = true
      setTimeout(() => (shared.value = false), 1600)
    }
  } catch {
    // Compartir cancelado o portapapeles sin permiso: no es un error que enseñar.
  }
}
</script>

<style scoped>
.bc-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: #57534e;
  transition: color 0.15s;
}
.bc-action:hover,
.bc-action-on {
  color: #1c1b19;
}
.bc-pill {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  border: 1px solid #ece8e1;
  border-radius: 9999px;
  background: #fff;
  padding: 0 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: #44403c;
  transition: border-color 0.15s, color 0.15s;
}
a.bc-pill:hover {
  border-color: #1c1b19;
  color: #1c1b19;
}
.bc-pill-off {
  cursor: default;
  color: #c4bfb7;
}
.bc-action:focus-visible,
.bc-pill:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
</style>
