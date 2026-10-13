<template>
  <div class="bg-paper">
    <section class="mx-auto max-w-screen-2xl px-6 pb-10 pt-14 lg:px-10 lg:pt-20">
      <p class="eyebrow">{{ t('offices.page.eyebrow', 'Nuestras oficinas') }}</p>
      <h1 class="heading-serif mt-4 text-4xl md:text-5xl" data-testid="offices-page-title">{{ t('offices.page.title', 'Dónde encontrarnos') }}</h1>
      <p class="mt-5 max-w-2xl text-[15px] leading-relaxed text-stone-500">{{ t('offices.page.intro', 'Visítanos en cualquiera de nuestras oficinas o llámanos: te atendemos personalmente.') }}</p>
    </section>

    <section v-if="offices.length" class="mx-auto max-w-screen-2xl px-6 pb-20 lg:px-10 lg:pb-28">
      <div v-if="withCoords.length" class="mb-12 h-[360px] overflow-hidden rounded-2xl bg-stone-100 lg:h-[440px]" data-testid="offices-page-map" :aria-label="t('offices.page.map', 'Mapa de las oficinas')">
        <ClientOnly>
          <OfficesMap :offices="withCoords" />
        </ClientOnly>
      </div>
      <div class="grid gap-8 md:grid-cols-2" :class="offices.length >= 3 ? 'lg:grid-cols-3' : ''">
        <article v-for="o in offices" :id="`oficina-${o.id}`" :key="o.id" class="flex flex-col rounded-2xl border border-line bg-white p-5" :data-testid="`offices-page-card-${o.id}`">
          <div v-if="o.photo" class="aspect-[4/3] overflow-hidden rounded-xl bg-stone-100">
            <img :src="mediaUrl(o.photo)" :alt="o.name" width="800" height="600" loading="lazy" class="h-full w-full object-cover" >
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <h2 class="font-serif text-xl font-medium">{{ o.name }}</h2>
            <span v-if="o.isMain" class="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 text-accent-700">{{ t('offices.block.main', 'Oficina principal') }}</span>
          </div>
          <p v-if="o.description" class="mt-2 text-[14px] leading-relaxed text-stone-500">{{ o.description }}</p>
          <dl class="mt-4 space-y-2 text-[14px] text-stone-600">
            <div v-if="addressOf(o)"><dt class="text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.address', 'Dirección') }}</dt><dd class="whitespace-pre-line">{{ addressOf(o) }}</dd></div>
            <div v-if="o.openingHours"><dt class="text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.hours', 'Horario') }}</dt><dd class="whitespace-pre-line">{{ o.openingHours }}</dd></div>
            <div v-if="o.phone"><dt class="text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.phone', 'Teléfono') }}</dt><dd><a :href="telHref(o.phone) || undefined" class="hover:underline">{{ o.phone }}</a></dd></div>
            <div v-if="o.email"><dt class="text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.email', 'Email') }}</dt><dd><a :href="`mailto:${o.email}`" class="break-all hover:underline">{{ o.email }}</a></dd></div>
          </dl>
          <div class="mt-auto flex flex-wrap gap-3 pt-5">
            <a v-if="o.mapsUrl" :href="o.mapsUrl" target="_blank" rel="noopener" class="btn-quiet" data-testid="offices-page-directions">{{ t('offices.block.directions', 'Cómo llegar') }} →</a>
            <NuxtLink to="/contacto" class="link-underline self-center text-[13px] font-semibold">{{ t('offices.page.cta', 'Contactar') }}</NuxtLink>
          </div>
        </article>
      </div>
    </section>

    <section v-else class="mx-auto max-w-screen-2xl px-6 pb-24 lg:px-10">
      <p class="text-stone-500" data-testid="offices-page-empty">{{ t('offices.page.empty', 'Todavía no hay oficinas publicadas.') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { telHref } from '~/utils/siteFooter'
import { realEstateAgentJsonLd } from '~/utils/corporateSchema'

/**
 * /oficinas: las oficinas publicadas de la inmobiliaria del host con su
 * foto, presentación, dirección, horario, contacto y mapa, y los datos
 * estructurados RealEstateAgent (empresa + oficinas) para el SEO local
 * (docs/home-corporativa.md). Sólo se enseña lo que existe.
 */
const { t } = useI18n()
const origin = useRequestURL().origin
const { tenant, load: loadTenant } = useTenant()
const [{ data }] = await Promise.all([useFetch<{ offices: any[]; company: any }>('/api/public/offices', { default: () => ({ offices: [], company: null }) }), loadTenant()])
const offices = computed<any[]>(() => data.value?.offices || [])
const withCoords = computed(() => offices.value.filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number'))
const brand = computed(() => data.value?.company?.companyName || tenant.value?.companyName || tenant.value?.name || '')

function addressOf(o: any): string {
  const line1 = String(o?.address || '').trim()
  const line2 = [o?.postalCode, o?.city].filter(Boolean).join(' ')
  const line3 = o?.province && o.province !== o.city ? String(o.province) : ''
  return [line1, [line2, line3].filter(Boolean).join(', ')].filter(Boolean).join('\n')
}

useHead(() => {
  const cities = Array.from(new Set(offices.value.map((o) => o.city).filter(Boolean)))
  const company = data.value?.company
  const jsonLd = company?.companyName
    ? realEstateAgentJsonLd(
        origin,
        { companyName: company.companyName, logoUrl: company.logo ? `${origin}${mediaUrl(company.logo)}` : null, phone: company.phone, email: company.email, social: company.social },
        offices.value.map((o) => ({ ...o, photoUrl: o.photo ? `${origin}${mediaUrl(o.photo)}` : null })),
      )
    : null
  return {
    ...seoHead({
      origin,
      title: `${t('offices.page.eyebrow', 'Nuestras oficinas')}${cities.length ? ` en ${cities.join(', ')}` : ''} — ${brand.value}`,
      description: `${t('offices.page.intro', 'Visítanos en cualquiera de nuestras oficinas o llámanos: te atendemos personalmente.')}${cities.length ? ` ${brand.value}: ${cities.join(', ')}.` : ''}`.slice(0, 160),
      canonical: `${origin}/oficinas`,
      image: offices.value[0]?.photo ? `${origin}${mediaUrl(offices.value[0].photo)}` : undefined,
    }),
    ...(jsonLd ? { script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }] } : {}),
  }
})
</script>
