<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
    <!-- La ficha (components/ficha/FichaView.vue) es la misma que enseña el lienzo del Constructor. -->
    <FichaView v-if="data" :data="data" :slug="slug" :core-options="coreOptions" />
  </SitePageLayout>
</template>

<script setup lang="ts">
import { formatDisplayPrice } from '~/utils/currency'
import { PROPERTY_TYPE_LABELS, priceSuffixFor } from '~/utils/propertySheet'
import { PAGE_CORE_TYPE } from '~/utils/siteBuilder/pages'
import { FICHA_PROPERTY_KEY } from '~/composables/useFichaProperty'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
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
// Las secciones del Constructor alrededor de la zona (p. ej. «Eficiencia energética») leen esta misma propiedad.
provide(
  FICHA_PROPERTY_KEY,
  computed(() => (data.value as any) || null),
)

// El nombre de la inmobiliaria de esta web, no uno fijo.
const { tenant } = useTenant()
const seoTitle = computed(() => [data.value?.project.name, tenant.value?.companyName || tenant.value?.name].filter(Boolean).join(' — '))
// SEO y schema.org van en la moneda en la que está guardado el precio (la de
// la agencia), nunca en la que eligió un visitante (utils/currency.ts).
const { base: baseCurrency } = useCurrency()
const seoDescription = [
  data.value.project.propertyType ? PROPERTY_TYPE_LABELS[data.value.project.propertyType] || data.value.project.propertyType : null,
  data.value.project.community ? `en ${data.value.project.community}` : null,
  data.value.project.bedrooms != null ? `${data.value.project.bedrooms || 'Estudio'} hab.` : null,
  data.value.project.area ? `${Math.round(data.value.project.area)} m²` : null,
  data.value.project.price ? `desde ${formatDisplayPrice(data.value.project.price, baseCurrency.value, baseCurrency.value)}${priceSuffixFor(data.value.project.transactionType)}` : null,
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

// La visita a la ficha se cuenta al pintarse en el navegador (#111): es lo
// que enseñan los Indicadores («visitas esta semana»). Antes sólo se llamaba
// con un enlace personal y las visitas normales no se contaban. El servidor
// no repite la misma persona en 30 minutos y limita por IP.
// Núcleo N8a (FASE 32): una ficha abierta desde el enlace personal que se le
// envió a alguien por email o por el chat (`?f=<token>`) lo registra además;
// el servidor sólo lo cuenta si el token es de esta agencia y de esta propiedad.
// Sin el consentimiento de «Analíticas» (aviso de cookies) la visita se cuenta
// igual, pero sin cookie de visitante: `anon` (server: …/view.post.ts).
const cookieConsent = useCookieConsent()
onMounted(() => {
  const f = typeof route.query.f === 'string' ? route.query.f : ''
  const body: Record<string, unknown> = f ? { f } : {}
  if (!cookieConsent.choices.value.analytics) body.anon = true
  $fetch(`/api/public/properties/${encodeURIComponent(slug.value)}/view`, { method: 'POST', body }).catch(() => {})
})
</script>
