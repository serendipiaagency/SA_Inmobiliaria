<template>
  <ZoneDirectory v-if="directory" :data="directory" />
  <div v-else-if="data">
    <section class="relative flex min-h-[55vh] items-end bg-ink">
      <img
        :src="mediaUrl(data.community.image)"
        :alt="data.community.name"
        class="absolute inset-0 h-full w-full object-cover opacity-70"
      >
      <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div class="relative mx-auto w-full max-w-screen-2xl px-6 pb-14 lg:px-10">
        <p v-if="data.community.location" class="eyebrow !text-white/70">{{ data.community.location }}</p>
        <h1 class="mt-3 font-serif text-5xl font-medium text-white md:text-6xl">{{ data.community.name }}</h1>
      </div>
    </section>

    <div class="mx-auto max-w-screen-2xl space-y-16 px-6 py-16 lg:px-10">
      <section v-if="data.community.description" class="max-w-3xl">
        <p class="eyebrow">{{ t('community.about.eyebrow', 'Acerca de') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('community.about.title', 'El vecindario') }}</h2>
        <p class="mt-6 whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">{{ data.community.description }}</p>
      </section>

      <section v-if="data.community.featureDescription" class="max-w-3xl">
        <p class="eyebrow">{{ t('community.features.eyebrow', 'Características') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('community.features.title', 'Qué la hace especial') }}</h2>
        <p class="mt-6 whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">
          {{ data.community.featureDescription }}
        </p>
      </section>

      <section v-if="data.amenities.length">
        <p class="eyebrow">{{ t('community.amenities.eyebrow', 'Comodidades') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('community.amenities.title', 'Comodidades de la comunidad') }}</h2>
        <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600">
            <span class="h-1 w-1 shrink-0 rounded-full bg-ink" />
            {{ a.name }}
          </li>
        </ul>
      </section>

      <section v-if="data.projects.length">
        <p class="eyebrow">{{ t('community.portfolio.eyebrow', 'Portafolio') }}</p>
        <h2 class="heading-serif mt-3 text-3xl">{{ t('community.portfolio.title', 'Proyectos en') }} {{ data.community.name }}</h2>
        <div class="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <ProjectCard v-for="p in data.projects" :key="p.id" :project="p" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ZoneDirectory from '~/components/zones/ZoneDirectory.vue'

/**
 * /zonas/<id numérico> sigue siendo una comunidad (residencial). Un slug
 * (/zonas/asturias) es el directorio de zonas de esa región (docs/zonas.md):
 * sus municipios y localidades publicados, con buscador y recuentos reales.
 */
const { t } = useI18n()
const route = useRoute()
const id = String(route.params.id)
const isRegion = !/^\d+$/.test(id)
const requestUrl = useRequestURL()
const origin = requestUrl.origin
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const brand = computed(() => tenant.value?.companyName || tenant.value?.name || '')

const { data: directory } = await useFetch<any>('/api/public/zones', { query: { region: id }, immediate: isRegion, server: isRegion, default: () => null })
if (isRegion && !directory.value) throw createError({ statusCode: 404, statusMessage: 'Zona no encontrada', fatal: true })

const { data } = await useFetch<any>(`/api/public/communities/${id}`, { immediate: !isRegion, server: !isRegion, default: () => null })
if (!isRegion && !data.value) throw createError({ statusCode: 404, statusMessage: 'Community not found', fatal: true })

useHead(() => {
  if (directory.value) {
    const r = directory.value.region
    const base = seoHead({
      origin,
      title: r.seoTitle || `Dónde vivir en ${r.name}: descubre sus ciudades, pueblos y mejores zonas — ${brand.value}`,
      description: r.seoDescription || (r.intro ? String(r.intro).replace(/\s+/g, ' ').slice(0, 155) : `Las zonas de ${r.name} donde trabajamos: ciudades, villas y barrios, con las viviendas disponibles en cada una.`),
      image: r.image ? (mediaUrl(r.image).startsWith('http') ? mediaUrl(r.image) : `${origin}${mediaUrl(r.image)}`) : undefined,
      canonical: `${origin}${r.path}`,
    })
    return {
      ...base,
      script: [{ type: 'application/ld+json', innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Inicio', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: r.name, item: `${origin}${r.path}` }] }) }],
    }
  }
  if (!data.value) return {}
  return seoHead({
    origin,
    title: `${data.value.community.name} — ${brand.value}`,
    description: (data.value.community.description || `Descubre ${data.value.community.name}, una comunidad residencial.`).slice(0, 200),
    image: `${origin}${mediaUrl(data.value.community.image)}`,
  })
})
</script>
