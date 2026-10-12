<template>
  <article class="zone-guide" data-testid="zone-guide">
    <section class="zone-hero" :class="{ 'zone-hero--noimage': !zone.image }">
      <img v-if="zone.image" :src="mediaUrl(zone.image)" :alt="zone.name" width="1600" height="900" fetchpriority="high" class="zone-hero-img" >
      <div class="zone-hero-shade" />
      <div class="relative mx-auto w-full max-w-screen-2xl px-6 pb-14 pt-10 lg:px-10">
        <nav class="flex flex-wrap gap-2 text-xs text-white/70" aria-label="Migas de pan" data-testid="zone-breadcrumbs">
          <NuxtLink to="/" class="hover:text-white hover:underline">{{ t('zones.crumb.home', 'Inicio') }}</NuxtLink>
          <template v-for="(c, i) in data.breadcrumbs" :key="c.path">
            <span aria-hidden="true">/</span>
            <NuxtLink v-if="Number(i) < data.breadcrumbs.length - 1" :to="c.path" class="hover:text-white hover:underline">{{ c.name }}</NuxtLink>
            <span v-else class="text-white">{{ c.name }}</span>
          </template>
        </nav>
        <p class="eyebrow mt-16 !text-white/70">{{ kindLabel }}<span v-if="zone.parent"> · {{ zone.parent.name }}</span></p>
        <h1 class="mt-3 font-serif text-5xl font-medium text-white md:text-6xl" data-testid="zone-title">{{ zone.name }}</h1>
        <p v-if="zone.subtitle" class="mt-4 max-w-2xl text-lg leading-relaxed text-white/85" data-testid="zone-subtitle">{{ zone.subtitle }}</p>
        <div class="mt-8 flex flex-wrap items-center gap-4">
          <NuxtLink :to="data.catalogUrl" class="btn-primary" data-testid="zone-cta">{{ t('zones.guide.cta', 'Ver viviendas disponibles') }}</NuxtLink>
          <span class="text-sm text-white/80" data-testid="zone-count">
            <template v-if="zone.count">{{ zone.count }} {{ zone.count === 1 ? t('zones.count.one', 'vivienda publicada') : t('zones.count.many', 'viviendas publicadas') }}</template>
            <template v-else>{{ t('zones.count.none', 'Sin viviendas publicadas ahora') }}</template>
          </span>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <section v-if="zone.intro" class="zone-section max-w-3xl" data-testid="zone-intro">
        <p class="eyebrow">{{ t('zones.guide.discover', 'Descubre la zona') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ zone.name }}</h2>
        <p v-for="(para, i) in paragraphs(zone.intro)" :key="i" class="mt-5 text-[15px] leading-[1.9] text-stone-600">{{ para }}</p>
      </section>

      <section v-if="zone.sections?.length" class="zone-section" data-testid="zone-sections">
        <p class="eyebrow">{{ t('zones.guide.living', 'Cómo es vivir aquí') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.livingTitle', 'La vida cotidiana en') }} {{ zone.name }}</h2>
        <dl class="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
          <div v-for="(s, i) in zone.sections" :key="i" class="zone-fact">
            <dt class="font-serif text-xl font-medium text-ink">{{ s.title }}</dt>
            <dd class="mt-2 text-[15px] leading-[1.85] text-stone-600">{{ s.text }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="data.children?.length" class="zone-section" data-testid="zone-children">
        <p class="eyebrow">{{ t('zones.guide.children', 'Barrios y localidades') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.childrenTitle', 'Dónde vivir en') }} {{ zone.name }}</h2>
        <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink v-for="c in data.children" :key="c.id" :to="c.hasGuide ? c.path : c.catalogUrl" class="zone-child group" :data-testid="`zone-child-${c.slug}`">
            <div class="zone-child-media">
              <img v-if="c.image" :src="mediaUrl(c.image)" :alt="c.name" width="640" height="427" loading="lazy" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" >
              <div v-else class="h-full w-full bg-gradient-to-br from-stone-200 to-stone-300" aria-hidden="true" />
            </div>
            <div class="mt-4">
              <h3 class="font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">{{ c.name }}</h3>
              <p class="mt-1 text-sm text-stone-500">
                <span v-if="c.count">{{ c.count }} {{ c.count === 1 ? t('zones.count.one', 'vivienda publicada') : t('zones.count.many', 'viviendas publicadas') }}</span>
                <span v-else>{{ t('zones.count.none', 'Sin viviendas publicadas ahora') }}</span>
                <span v-if="!c.hasGuide"> · {{ t('zones.directory.catalogOnly', 'Ver en el catálogo') }}</span>
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="zone.kind !== 'region'" class="zone-section" data-testid="zone-properties">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="eyebrow">{{ t('zones.guide.properties', 'Viviendas disponibles') }}</p>
            <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.propertiesTitle', 'Viviendas en') }} {{ zone.name }}</h2>
          </div>
          <NuxtLink v-if="data.properties.length" :to="data.catalogUrl" class="btn-quiet">{{ t('zones.guide.allProperties', 'Ver todas') }}</NuxtLink>
        </div>
        <div v-if="data.properties.length" class="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard v-for="p in data.properties" :key="p.id" :project="p" />
        </div>
        <div v-else class="mt-8 rounded-2xl border border-dashed border-line p-8 text-center" data-testid="zone-properties-empty">
          <p class="font-serif text-xl text-stone-600">{{ t('zones.guide.noProperties', 'Ahora mismo no tenemos viviendas publicadas en esta zona.') }}</p>
          <p class="mt-2 text-sm text-stone-500">{{ t('zones.guide.noPropertiesHint', 'Guarda una búsqueda en el catálogo y te avisamos cuando entre alguna.') }}</p>
          <NuxtLink :to="data.catalogUrl" class="btn-quiet mt-6">{{ t('zones.guide.openCatalog', 'Abrir el catálogo') }}</NuxtLink>
        </div>
      </section>

      <section v-if="hasMap" class="zone-section" data-testid="zone-map">
        <p class="eyebrow">{{ t('zones.guide.map', 'Mapa') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.mapTitle', 'Dónde está') }} {{ zone.name }}</h2>
        <div class="mt-6 overflow-hidden rounded-2xl border border-line">
          <ClientOnly>
            <ZonesZoneMap :lat="zone.lat" :lng="zone.lng" :zoom="zone.zoom || defaultZoom" :name="zone.name" :pins="pins" />
            <template #fallback><div class="h-[420px] bg-stone-100" /></template>
          </ClientOnly>
        </div>
      </section>

      <section v-if="zone.faq?.length" class="zone-section max-w-3xl" data-testid="zone-faq">
        <p class="eyebrow">{{ t('zones.guide.faq', 'Preguntas frecuentes') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.faqTitle', 'Lo que suelen preguntarnos sobre') }} {{ zone.name }}</h2>
        <div class="mt-6 divide-y divide-line border-y border-line">
          <details v-for="(f, i) in zone.faq" :key="i" class="group py-4">
            <summary class="flex cursor-pointer items-center justify-between gap-4 font-medium text-ink">
              {{ f.q }}
              <span class="text-stone-400 transition group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <p class="mt-3 text-[15px] leading-[1.85] text-stone-600">{{ f.a }}</p>
          </details>
        </div>
      </section>

      <section v-if="data.nearby?.length" class="zone-section" data-testid="zone-nearby">
        <p class="eyebrow">{{ t('zones.guide.nearby', 'Zonas cercanas') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('zones.guide.nearbyTitle', 'Otras zonas que pueden interesarte') }}</h2>
        <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink v-for="n in data.nearby" :key="n.id" :to="n.hasGuide ? n.path : n.catalogUrl" class="zone-child group" :data-testid="`zone-nearby-${n.slug}`">
            <div class="zone-child-media">
              <img v-if="n.image" :src="mediaUrl(n.image)" :alt="n.name" width="640" height="427" loading="lazy" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" >
              <div v-else class="h-full w-full bg-gradient-to-br from-stone-200 to-stone-300" aria-hidden="true" />
            </div>
            <div class="mt-4">
              <h3 class="font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">{{ n.name }}</h3>
              <p v-if="n.subtitle" class="mt-1 line-clamp-2 text-sm text-stone-500">{{ n.subtitle }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="zone-final" data-testid="zone-final">
        <p class="eyebrow">{{ t('zones.guide.final', 'Tu próxima vivienda') }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('zones.guide.finalTitle', 'Encuentra tu próxima vivienda en') }} {{ zone.name }}</h2>
        <p class="mx-auto mt-4 max-w-2xl text-stone-500">{{ t('zones.guide.finalText', 'El catálogo se filtra con esta zona; guarda la búsqueda para recibir aviso de las novedades.') }}</p>
        <NuxtLink :to="data.catalogUrl" class="btn-primary mt-8">{{ t('zones.guide.cta', 'Ver viviendas disponibles') }}</NuxtLink>
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * Guía de una zona (municipio, localidad o barrio): hero, intro, vida cotidiana, hijas, viviendas reales, mapa, FAQ, cercanas y CTA.
 * El mapa (ZoneMap.client.vue) se usa por su nombre de auto-import, sin `import` explícito: importarlo a mano lo convierte en un
 * módulo normal y Leaflet se ejecutaría en el servidor (500 en SSR), como ya documenta MapTeaserBlock.vue.
 */
const props = defineProps<{ data: any }>()
const { t } = useI18n()
const zone = computed(() => props.data.zone)
const KIND: Record<string, string> = { region: 'Región', municipality: 'Municipio', locality: 'Localidad', neighborhood: 'Barrio' }
const kindLabel = computed(() => KIND[zone.value.kind] || zone.value.kind)
const paragraphs = (text: string) => String(text || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
const pins = computed(() => (props.data.properties || []).filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p: any) => ({ id: p.id, lat: p.lat, lng: p.lng, name: p.name, slug: p.slug, price: p.price })))
const hasMap = computed(() => Number.isFinite(zone.value.lat) && Number.isFinite(zone.value.lng))
const defaultZoom = computed(() => (zone.value.kind === 'municipality' ? 12 : zone.value.kind === 'region' ? 8 : 14))
</script>

<style scoped>
.zone-hero {
  position: relative;
  display: flex;
  min-height: 62vh;
  align-items: flex-end;
  background: #16150f;
}
.zone-hero--noimage {
  min-height: 46vh;
  background: linear-gradient(135deg, #23312f, #1f4e5f);
}
.zone-hero-img {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  object-fit: cover;
  opacity: 0.8;
}
.zone-hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.15) 55%, rgba(0, 0, 0, 0.25));
}
.zone-section {
  padding: 4.5rem 0 0;
}
.zone-fact {
  padding-top: 1.25rem;
  border-top: 1px solid #e6e1d6;
}
.zone-child-media {
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border-radius: 1rem;
  background: #ece8e0;
}
.zone-final {
  margin: 5rem 0 6rem;
  padding: 4rem 1.5rem;
  border-radius: 1.5rem;
  background: #f6f4ef;
  text-align: center;
}
</style>
