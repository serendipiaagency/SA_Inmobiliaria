<template>
  <div class="zone-directory" data-testid="zone-directory">
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-12 pt-10 lg:px-10">
        <nav class="flex flex-wrap gap-2 text-xs text-stone-450" aria-label="Migas de pan" data-testid="zone-breadcrumbs">
          <NuxtLink to="/" class="hover:text-ink hover:underline">{{ t('zones.crumb.home', 'Inicio') }}</NuxtLink>
          <span aria-hidden="true">/</span>
          <span class="text-ink">{{ data.region.name }}</span>
        </nav>
        <p class="eyebrow mt-8">{{ t('zones.directory.eyebrow', 'Zonas') }}</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl lg:text-[3.4rem]" data-testid="zone-directory-title">{{ t('zones.directory.title', 'Descubre las mejores zonas para vivir en') }} {{ data.region.name }}</h1>
        <p v-if="data.region.intro" class="mt-5 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-stone-500">{{ data.region.intro }}</p>
        <p class="mt-6 text-sm text-stone-450" data-testid="zone-directory-total">
          {{ data.total }} {{ data.total === 1 ? t('zones.count.one', 'vivienda publicada') : t('zones.count.many', 'viviendas publicadas') }} · {{ allZones.length }} {{ t('zones.directory.zonesLabel', 'zonas') }}
        </p>

        <div class="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
          <label class="relative block w-full md:max-w-sm">
            <span class="sr-only">{{ t('zones.directory.search', 'Buscar una zona') }}</span>
            <input v-model="q" type="search" class="input w-full pl-10" :placeholder="t('zones.directory.search', 'Buscar una zona')" data-testid="zone-search" >
            <svg class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </label>
          <div class="flex flex-wrap gap-2" data-testid="zone-area-filter">
            <button type="button" class="zone-pill" :class="{ 'is-active': !area }" @click="area = ''">{{ t('zones.directory.all', 'Todas') }}</button>
            <button v-for="g in data.groups" :key="String(g.area)" type="button" class="zone-pill" :class="{ 'is-active': area === (g.area || '') }" @click="area = g.area || ''">{{ g.label || t('zones.directory.other', 'Otras') }}</button>
          </div>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-screen-2xl px-6 py-12 lg:px-10">
      <template v-if="visibleGroups.length">
        <section v-for="g in visibleGroups" :key="String(g.area)" class="zone-group" :data-testid="`zone-group-${g.area || 'otras'}`">
          <div class="flex items-end justify-between gap-4">
            <h2 class="heading-serif text-2xl md:text-3xl">{{ g.label || t('zones.directory.other', 'Otras') }}</h2>
            <span class="text-sm text-stone-450">{{ g.zones.length }} {{ t('zones.directory.zonesLabel', 'zonas') }}</span>
          </div>
          <div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink v-for="z in g.zones" :key="z.id" :to="z.hasGuide ? z.path : z.catalogUrl" class="zone-card group" :data-testid="`zone-card-${z.slug}`">
              <img v-if="z.image" :src="mediaUrl(z.image)" :alt="z.name" width="800" height="533" loading="lazy" class="zone-card-img" >
              <div v-else class="zone-card-img zone-card-img--empty" aria-hidden="true" />
              <div class="zone-card-overlay">
                <span class="zone-card-line" aria-hidden="true" />
                <h3 class="zone-card-name">{{ z.name }}</h3>
                <p class="zone-card-meta">
                  <span v-if="z.count">{{ z.count }} {{ z.count === 1 ? t('zones.count.one', 'vivienda publicada') : t('zones.count.many', 'viviendas publicadas') }}</span>
                  <span v-else>{{ t('zones.count.none', 'Sin viviendas publicadas ahora') }}</span>
                  <span v-if="!z.hasGuide" class="opacity-80"> · {{ t('zones.directory.catalogOnly', 'Ver en el catálogo') }}</span>
                </p>
              </div>
            </NuxtLink>
          </div>
        </section>
      </template>
      <div v-else class="py-20 text-center" data-testid="zone-empty">
        <p class="font-serif text-2xl text-stone-500">{{ t('zones.directory.empty', 'No hay zonas que coincidan con tu búsqueda.') }}</p>
        <button type="button" class="btn-quiet mt-6" @click="q = ''; area = ''">{{ t('zones.directory.reset', 'Ver todas las zonas') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Directorio de zonas de una región (/zonas/<región>): secciones por área
 * con tarjetas fotográficas, buscador y filtro por área en el cliente, y el
 * número real de propiedades de cada zona (del índice del catálogo). Una
 * zona sin guía enlaza directamente al catálogo filtrado.
 */
const props = defineProps<{ data: any }>()
const { t } = useI18n()
const q = ref('')
const area = ref('')
const allZones = computed<any[]>(() => props.data.groups.flatMap((g: any) => g.zones))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const visibleGroups = computed(() => {
  const needle = norm(q.value)
  return props.data.groups
    .filter((g: any) => !area.value || (g.area || '') === area.value)
    .map((g: any) => ({ ...g, zones: g.zones.filter((z: any) => !needle || norm(z.name).includes(needle) || norm(z.subtitle || '').includes(needle)) }))
    .filter((g: any) => g.zones.length)
})
</script>

<style scoped>
.zone-pill {
  padding: 0.4rem 0.9rem;
  border: 1px solid #e3ddd1;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #5b574f;
  background: #fff;
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.zone-pill:hover,
.zone-pill.is-active {
  border-color: #16150f;
  color: #16150f;
}
.zone-pill.is-active {
  background: #16150f;
  color: #fff;
}
.zone-group + .zone-group {
  margin-top: 4rem;
}
.zone-card {
  position: relative;
  display: block;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border-radius: 1.25rem;
  background: #e9e4da;
}
.zone-card-img {
  height: 100%;
  width: 100%;
  object-fit: cover;
  transition: transform 0.7s ease;
}
.zone-card-img--empty {
  background: linear-gradient(135deg, #d8d2c6, #b9b2a4);
}
.zone-card:hover .zone-card-img {
  transform: scale(1.04);
}
.zone-card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 1.5rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.08) 55%, transparent);
}
.zone-card-line {
  display: block;
  width: 2rem;
  height: 2px;
  margin-bottom: 0.75rem;
  background: #fff;
  opacity: 0.85;
}
.zone-card-name {
  font-family: var(--font-serif, inherit);
  font-size: 1.75rem;
  font-weight: 500;
  line-height: 1.1;
  color: #fff;
}
.zone-card-meta {
  margin-top: 0.4rem;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.85);
}
@media (prefers-reduced-motion: reduce) {
  .zone-card-img {
    transition: none;
  }
}
</style>
