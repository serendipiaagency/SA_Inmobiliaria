<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
    <div class="blog-index">
      <header class="border-b border-line bg-white">
        <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
          <p class="eyebrow">{{ t('home.blog.eyebrow', 'Journal') }}</p>
          <h1 class="heading-serif mt-3 text-4xl md:text-5xl">{{ t('blog.hero.title', 'Ideas e historias') }}</h1>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-stone-500">{{ t('blog.hero.text', 'Guías prácticas, zonas y noticias para comprar, vender o alquilar con criterio.') }}</p>
          <nav v-if="categories.length" class="mt-8 flex flex-wrap gap-2" aria-label="Categorías" data-testid="blog-categories">
            <NuxtLink to="/blog" class="blog-pill" :class="{ 'is-active': !categoria }">Todo</NuxtLink>
            <NuxtLink v-for="c in categories" :key="c.slug" :to="`/blog?categoria=${c.slug}`" class="blog-pill" :class="{ 'is-active': categoria === c.slug }">
              {{ c.name }} <span class="blog-pill-count">{{ c.count }}</span>
            </NuxtLink>
          </nav>
        </div>
      </header>

      <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
        <template v-if="rows.length">
          <!-- El primer artículo es la guía principal: ocupa todo el ancho. -->
          <NuxtLink :to="`/blog/${featured.slug}`" class="blog-featured group" data-testid="blog-featured">
            <div class="blog-featured-media">
              <img :src="mediaUrl(featured.image)" :alt="featured.title" width="1600" height="900" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" fetchpriority="high" >
            </div>
            <div class="blog-featured-body">
              <p class="eyebrow">{{ featured.category?.name || featured.targetAudience }} · {{ t('blog.featured', 'Guía principal') }}</p>
              <h2 class="heading-serif mt-3 text-3xl leading-tight md:text-4xl group-hover:underline group-hover:underline-offset-4">{{ featured.title }}</h2>
              <p v-if="featured.description" class="mt-4 line-clamp-3 text-base leading-relaxed text-stone-500">{{ stripHtml(featured.description) }}</p>
              <p class="mt-5 text-sm text-stone-450">
                <span v-if="featured.readingTime">{{ featured.readingTime }} min de lectura</span>
                <span v-if="featured.readingTime && featured.publishedAt"> · </span>
                <time v-if="featured.publishedAt" :datetime="featured.publishedAt">{{ formatDate(featured.publishedAt) }}</time>
              </p>
              <span class="mt-6 inline-block text-sm font-semibold text-ink">{{ t('blog.read', 'Leer la guía') }} →</span>
            </div>
          </NuxtLink>

          <div v-if="rest.length" class="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" data-testid="blog-grid">
            <NuxtLink v-for="b in rest" :key="b.id" :to="`/blog/${b.slug}`" class="group block" data-testid="blog-card">
              <div class="aspect-video overflow-hidden rounded-2xl bg-stone-100">
                <img :src="mediaUrl(b.image)" :alt="b.title" width="800" height="450" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" >
              </div>
              <p class="eyebrow mt-5">{{ b.category?.name || b.targetAudience }}</p>
              <h3 class="mt-2 font-serif text-2xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{{ b.title || b.slug }}</h3>
              <p v-if="b.description" class="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-500">{{ stripHtml(b.description) }}</p>
              <p class="mt-3 text-xs text-stone-450">
                <span v-if="b.readingTime">{{ b.readingTime }} min de lectura</span>
                <span v-if="b.readingTime && b.publishedAt"> · </span>
                <time v-if="b.publishedAt" :datetime="b.publishedAt">{{ formatDate(b.publishedAt) }}</time>
              </p>
            </NuxtLink>
          </div>
        </template>
        <p v-else class="py-24 text-center font-serif text-2xl text-stone-500">{{ t('blog.empty', 'Aún no hay artículos publicados.') }}</p>
      </div>
    </div>
  </SitePageLayout>
</template>

<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const categoria = computed(() => (typeof route.query.categoria === 'string' ? route.query.categoria : ''))
const { data } = await useFetch<any>('/api/public/blogs', { query: { categoria }, watch: [categoria] })
const rows = computed<any[]>(() => data.value?.rows || [])
const categories = computed<any[]>(() => data.value?.categories || [])
const featured = computed(() => rows.value[0])
const rest = computed(() => rows.value.slice(1))
// Página «Blog» del Constructor Web: el listado es su zona dinámica; con una
// versión publicada, las secciones que se le añadan van encima o debajo.
const { page: sitePage, homeData: sitePageData } = await useSitePage('blog')
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const brand = computed(() => tenant.value?.companyName || tenant.value?.name || '')
const origin = useRequestURL().origin
useHead(() =>
  seoHead({
    origin,
    title: sitePage.value?.seo?.title || `Blog${brand.value ? ` — ${brand.value}` : ''}`,
    description: sitePage.value?.seo?.description || `Guías prácticas para comprar y vender vivienda, zonas y noticias${brand.value ? ` de ${brand.value}` : ''}.`,
  }),
)
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').slice(0, 220)
}
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<style scoped>
.blog-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid #e3ddd1;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #5b574f;
  background: #fff;
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.blog-pill:hover,
.blog-pill.is-active {
  border-color: #16150f;
  color: #16150f;
}
.blog-pill.is-active {
  background: #16150f;
  color: #fff;
}
.blog-pill-count {
  font-weight: 500;
  opacity: 0.7;
}
.blog-featured {
  display: grid;
  gap: 2rem;
  align-items: center;
}
@media (min-width: 1024px) {
  .blog-featured {
    grid-template-columns: 7fr 5fr;
    gap: 3.5rem;
  }
}
.blog-featured-media {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 1.5rem;
  background: #f1ede6;
}
</style>
