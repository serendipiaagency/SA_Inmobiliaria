<template>
  <div v-if="data?.source === 'cms'" class="blog-article" :style="brandStyle">
    <ClientOnly><CmsReadingProgress target="#articulo" /></ClientOnly>

    <header class="blog-article-header">
      <div class="mx-auto max-w-5xl px-6">
        <nav class="blog-crumbs" aria-label="Migas de pan" data-testid="blog-breadcrumbs">
          <NuxtLink to="/">Inicio</NuxtLink>
          <span aria-hidden="true">/</span>
          <NuxtLink to="/blog">Blog</NuxtLink>
          <template v-if="data.category">
            <span aria-hidden="true">/</span>
            <NuxtLink :to="`/blog?categoria=${data.category.slug}`">{{ data.category.name }}</NuxtLink>
          </template>
        </nav>
        <p v-if="data.category" class="eyebrow mt-8">{{ data.category.name }}</p>
        <h1 class="heading-serif mt-3 text-4xl leading-tight md:text-5xl lg:text-[3.4rem]" data-testid="blog-title">{{ data.article.title }}</h1>
        <p v-if="data.article.excerpt" class="mt-5 max-w-3xl text-lg leading-relaxed text-stone-500 md:text-xl" data-testid="blog-subtitle">{{ data.article.excerpt }}</p>
        <div class="blog-meta" data-testid="blog-meta">
          <NuxtLink v-if="data.author" :to="`/blog/autor/${data.author.slug}`" class="blog-author">
            <img v-if="data.author.photo" :src="mediaUrl(data.author.photo)" :alt="data.author.name" width="40" height="40" class="h-10 w-10 rounded-full object-cover" >
            <span v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{{ data.author.name?.[0] }}</span>
            <span>
              <span class="block text-sm font-medium text-ink">{{ data.author.name }}</span>
              <span v-if="data.author.specialty" class="block text-xs text-stone-450">{{ data.author.specialty }}</span>
            </span>
          </NuxtLink>
          <span v-else class="blog-author">
            <span class="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{{ brand?.[0] || 'B' }}</span>
            <span class="block text-sm font-medium text-ink">{{ brand }}</span>
          </span>
          <dl class="blog-meta-facts">
            <div v-if="data.article.readingTimeMinutes"><dt>Lectura</dt><dd>{{ data.article.readingTimeMinutes }} min</dd></div>
            <div v-if="data.article.publishedAt"><dt>Publicado</dt><dd><time :datetime="data.article.publishedAt">{{ formatDate(data.article.publishedAt) }}</time></dd></div>
            <div v-if="updatedLabel"><dt>Actualizado</dt><dd><time :datetime="data.article.updatedAt">{{ updatedLabel }}</time></dd></div>
          </dl>
        </div>
      </div>
      <figure v-if="data.article.coverImage" class="blog-cover mx-auto max-w-6xl px-6">
        <img :src="mediaUrl(data.article.coverImage)" :alt="data.article.title" width="1600" height="900" fetchpriority="high" data-testid="blog-cover" >
      </figure>
    </header>

    <div class="mx-auto max-w-6xl px-6">
      <div class="blog-layout">
        <aside class="blog-aside">
          <CmsArticleToc :blocks="blocks" sticky />
        </aside>
        <article id="articulo" class="blog-body">
          <div class="blog-toc-mobile"><CmsArticleToc :blocks="blocks" /></div>
          <CmsBlockRenderer :blocks="blocks" />

          <div v-if="data.tags?.length" class="mt-10 flex flex-wrap gap-2">
            <span v-for="t in data.tags" :key="t.slug" class="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">#{{ t.name }}</span>
          </div>
        </article>
      </div>
    </div>

    <!-- Enlace interno blog → guías de zona (docs/zonas.md): sólo si la inmobiliaria tiene regiones publicadas. -->
    <section v-if="zoneRegions.length" class="mx-auto max-w-3xl px-6 pt-4" data-testid="blog-zones">
      <div class="rounded-2xl border border-line bg-surface p-6 md:p-8">
        <p class="eyebrow">{{ t('blog.zones.eyebrow', 'Guías de zona') }}</p>
        <h2 class="heading-serif mt-3 text-2xl">{{ t('blog.zones.title', 'Descubre dónde vivir') }}</h2>
        <p class="mt-2 text-[14px] text-stone-500">{{ t('blog.zones.text', 'Cómo es vivir en cada zona y qué viviendas tenemos publicadas ahora mismo.') }}</p>
        <div class="mt-5 flex flex-wrap gap-3">
          <NuxtLink v-for="r in zoneRegions" :key="r.id" :to="r.path" class="btn-quiet" :data-testid="`blog-zone-link-${r.slug}`">{{ r.name }} →</NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="data.related?.length" class="blog-related" data-testid="blog-related">
      <div class="mx-auto max-w-6xl px-6">
        <p class="eyebrow">Seguir leyendo</p>
        <h2 class="heading-serif mt-2 text-3xl">Artículos relacionados</h2>
        <div class="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink v-for="r in data.related" :key="r.id" :to="`/blog/${r.slug}`" class="group block" data-testid="blog-related-card">
            <div class="aspect-video overflow-hidden rounded-2xl bg-stone-100">
              <img :src="mediaUrl(r.coverImage)" :alt="r.title" width="800" height="450" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" >
            </div>
            <p class="eyebrow mt-4">{{ r.categoryName || 'Blog' }}</p>
            <h3 class="mt-2 font-serif text-xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{{ r.title }}</h3>
            <p v-if="r.readingTime" class="mt-2 text-xs text-stone-450">{{ r.readingTime }} min de lectura</p>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Comments -->
    <section class="mx-auto max-w-3xl px-6 pb-20 pt-14">
      <h2 class="font-serif text-2xl">Comentarios{{ commentTree.length ? ` (${comments.length})` : '' }}</h2>

      <div v-if="commentTree.length" class="mt-6 space-y-5">
        <CmsCommentThread v-for="c in commentTree" :key="c.id" :comment="c" :replying-to="replyingTo" @reply="replyingTo = $event" @submit-reply="submitComment" />
      </div>
      <p v-else class="mt-4 text-sm text-stone-450">Sé el primero en comentar.</p>

      <form v-if="!replyingTo" class="mt-8 space-y-3" @submit.prevent="submitComment(null)">
        <div class="grid gap-3 sm:grid-cols-2">
          <input v-model="commentForm.authorName" class="input" placeholder="Tu nombre" required >
          <input v-model="commentForm.authorEmail" type="email" class="input" placeholder="Email (opcional)" >
        </div>
        <textarea v-model="commentForm.content" class="input" rows="3" placeholder="Escribe tu comentario…" required />
        <button type="submit" class="btn-primary" :disabled="commentSending">{{ commentSending ? 'Enviando…' : 'Publicar comentario' }}</button>
        <p v-if="commentNotice" class="text-sm text-emerald-700">{{ commentNotice }}</p>
      </form>
    </section>
  </div>

  <article v-else-if="data?.source === 'legacy'" class="mx-auto max-w-3xl px-4 py-12">
    <p class="text-xs uppercase text-ink">{{ data.blog.targetAudience }}</p>
    <h1 class="mt-1 heading-serif text-4xl md:text-4xl">{{ current?.title || data.blog.slug }}</h1>

    <div v-if="locales.length > 1" class="mt-4 flex gap-2">
      <button
        v-for="l in locales"
        :key="l"
        class="rounded-full px-3 py-1 text-xs font-semibold"
        :class="l === locale ? 'bg-ink text-white' : 'bg-slate-100 text-stone-500'"
        @click="locale = l"
      >
        {{ l.toUpperCase() }}
      </button>
    </div>

    <img
      v-if="data.blog.image"
      :src="mediaUrl(data.blog.image)"
      :alt="current?.title"
      class="mt-6 w-full rounded-xl object-cover"
    >
    <div
      class="prose prose-slate mt-8 max-w-none whitespace-pre-line leading-relaxed text-stone-600"
      :dir="locale === 'ar' ? 'rtl' : 'ltr'"
    >
      {{ stripHtml(current?.description || '') }}
    </div>
  </article>
</template>

<script setup lang="ts">
import CmsArticleToc from '~/components/cms/ArticleToc.vue'
import CmsReadingProgress from '~/components/cms/ReadingProgress.vue'

const route = useRoute()
const { t } = useI18n()
const { data } = await useFetch<any>(`/api/public/blogs/${route.params.slug}`)
// Las regiones con guía de zona de esta inmobiliaria (/zonas/<región>), para enlazar el blog con las guías.
const { data: zonesData } = await useFetch<{ regions: any[] }>('/api/public/zones', { default: () => ({ regions: [] }) })
const zoneRegions = computed<any[]>(() => zonesData.value?.regions || [])
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })

const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const brand = computed(() => tenant.value?.companyName || tenant.value?.name || 'Blog')
// El acento editorial de los bloques (índice, calculadoras, listas) sigue el color de marca de la empresa.
const brandStyle = computed(() => (tenant.value?.brandColor ? { '--cms-accent': tenant.value.brandColor } : undefined))

const blocks = computed(() => {
  if (data.value?.source !== 'cms') return []
  try {
    const parsed = JSON.parse(data.value.article.contentJson || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

const locales = computed(() => (data.value?.source === 'legacy' ? data.value.translations.map((t: any) => t.locale) : []))
const locale = ref(locales.value.includes('en') ? 'en' : locales.value[0] || 'en')
const current = computed(() => (data.value?.source === 'legacy' ? data.value.translations.find((t: any) => t.locale === locale.value) : null))

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}
// «Actualizado» sólo si la fecha de modificación va por detrás de la de publicación (mismo día = nada que decir).
const updatedLabel = computed(() => {
  const a = data.value?.article
  if (!a?.updatedAt || !a?.publishedAt) return ''
  return a.updatedAt.slice(0, 10) > a.publishedAt.slice(0, 10) ? formatDate(a.updatedAt) : ''
})

const requestUrl = useRequestURL()
const canonicalUrl = computed(() =>
  data.value?.source === 'cms' && data.value.article.seoCanonical ? data.value.article.seoCanonical : `${requestUrl.origin}/blog/${route.params.slug}`,
)
const absolute = (key: string | null | undefined) => {
  if (!key) return undefined
  const url = mediaUrl(key)
  return url.startsWith('http') ? url : `${requestUrl.origin}${url}`
}
useHead(() => {
  const isCms = data.value?.source === 'cms'
  const article = isCms ? data.value.article : null
  const image = absolute(isCms ? article.ogImage || article.coverImage : data.value?.blog.image)
  const breadcrumb = isCms
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${requestUrl.origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${requestUrl.origin}/blog` },
          ...(data.value.category ? [{ '@type': 'ListItem', position: 3, name: data.value.category.name, item: `${requestUrl.origin}/blog?categoria=${data.value.category.slug}` }] : []),
          { '@type': 'ListItem', position: data.value.category ? 4 : 3, name: article.title, item: canonicalUrl.value },
        ],
      }
    : null
  const posting = isCms
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: article.seoDescription || article.excerpt || '',
        image: image ? [image] : undefined,
        datePublished: article.publishedAt || undefined,
        dateModified: article.updatedAt || article.publishedAt || undefined,
        inLanguage: article.language || 'es',
        author: data.value.author ? { '@type': 'Person', name: data.value.author.name, url: `${requestUrl.origin}/blog/autor/${data.value.author.slug}` } : { '@type': 'Organization', name: brand.value },
        publisher: { '@type': 'Organization', name: brand.value, ...(tenant.value?.logo ? { logo: { '@type': 'ImageObject', url: absolute(tenant.value.logo) } } : {}) },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl.value },
        ...(data.value.category ? { articleSection: data.value.category.name } : {}),
        ...(article.focusKeyword ? { keywords: article.focusKeyword } : {}),
      }
    : null
  const base = seoHead({
    origin: requestUrl.origin,
    title: isCms ? `${article.seoTitle || article.title} — ${brand.value}` : `${current.value?.title || 'Blog'} — ${brand.value}`,
    description: isCms ? article.seoDescription || article.excerpt || '' : stripHtml(current.value?.description || '').slice(0, 200) || 'Artículos del blog.',
    image,
    type: 'article',
    canonical: canonicalUrl.value,
    robots: isCms ? article.seoRobots : null,
  })
  return {
    htmlAttrs: { lang: isCms ? article.language || 'es' : 'es' },
    ...base,
    // Las etiquetas article:* y twitter:* se SUMAN a las de seoHead (description, og:*), no las sustituyen.
    meta: isCms
      ? [
          ...base.meta,
          ...(article.publishedAt ? [{ property: 'article:published_time', content: article.publishedAt }] : []),
          ...(article.updatedAt ? [{ property: 'article:modified_time', content: article.updatedAt }] : []),
          ...(data.value.category ? [{ property: 'article:section', content: data.value.category.name }] : []),
          { name: 'twitter:title', content: article.seoTitle || article.title },
          { name: 'twitter:description', content: article.seoDescription || article.excerpt || '' },
          ...(image ? [{ name: 'twitter:image', content: image }] : []),
        ]
      : base.meta,
    script: isCms
      ? [
          { type: 'application/ld+json', innerHTML: JSON.stringify(posting) },
          { type: 'application/ld+json', innerHTML: JSON.stringify(breadcrumb) },
        ]
      : [],
  }
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

onMounted(() => {
  if (data.value?.source === 'cms') {
    $fetch(`/api/public/cms/articles/${route.params.slug}/view`, { method: 'POST' }).catch(() => {})
  }
})

// See the equivalent cast in pages/admin/cms/papelera.vue for why this is
// safe: useFetch's request getter type has no "skip" case, but neither does
// its actual implementation special-case a falsy request — this only fixes
// the type, the one wasted initial fetch for non-CMS articles is pre-existing.
const commentsUrl = (() => (data.value?.source === 'cms' ? `/api/public/cms/articles/${route.params.slug}/comments` : undefined)) as () => string
const { data: commentsData, refresh: refreshComments } = await useFetch<{ rows: any[] }>(commentsUrl)
const comments = computed(() => commentsData.value?.rows || [])
const commentTree = computed(() => {
  const byId = new Map<number, any>(comments.value.map((c: any) => [c.id, { ...c, replies: [] }]))
  const roots: any[] = []
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).replies.push(c)
    else roots.push(c)
  }
  return roots
})

const commentForm = reactive({ authorName: '', authorEmail: '', content: '' })
provide('cmsCommentForm', commentForm)
const commentSending = ref(false)
const commentNotice = ref('')
const replyingTo = ref<number | null>(null)

async function submitComment(parentId: number | null) {
  commentSending.value = true
  commentNotice.value = ''
  try {
    const res = await $fetch<{ pendingApproval: boolean }>(`/api/public/cms/articles/${route.params.slug}/comments`, {
      method: 'POST',
      body: { ...commentForm, parentId },
    })
    commentNotice.value = res.pendingApproval ? 'Comentario enviado — se publicará tras moderación.' : '¡Comentario publicado!'
    commentForm.authorName = ''
    commentForm.authorEmail = ''
    commentForm.content = ''
    replyingTo.value = null
    if (!res.pendingApproval) await refreshComments()
  } catch (err: any) {
    commentNotice.value = err?.data?.statusMessage || 'No se pudo enviar el comentario.'
  } finally {
    commentSending.value = false
  }
}
</script>

<style scoped>
.blog-article {
  --cms-paper-2: #f6f4ef;
  --cms-line: #e6e1d6;
  background: #fff;
}
.blog-article-header {
  padding-top: 2.5rem;
}
.blog-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #8a8478;
}
.blog-crumbs a:hover {
  color: #16150f;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.blog-meta {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5rem 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--cms-line);
}
.blog-author {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.blog-meta-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 2rem;
  margin: 0;
}
.blog-meta-facts dt {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a39d92;
}
.blog-meta-facts dd {
  margin: 0.15rem 0 0;
  font-size: 0.9rem;
  color: #3b3934;
}
.blog-cover {
  margin-top: 2.5rem;
}
.blog-cover img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 1.5rem;
  background: #f1ede6;
}
.blog-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  padding-top: 3rem;
}
.blog-aside {
  display: none;
}
.blog-body {
  max-width: 46rem;
  margin: 0 auto;
  width: 100%;
  min-width: 0;
  font-size: 1.05rem;
}
.blog-toc-mobile {
  margin-bottom: 2.5rem;
}
@media (min-width: 1024px) {
  .blog-layout {
    grid-template-columns: 15rem minmax(0, 46rem);
    column-gap: 4rem;
    justify-content: center;
    padding-top: 4rem;
  }
  .blog-aside {
    display: block;
  }
  .blog-toc-mobile {
    display: none;
  }
  .blog-body {
    margin: 0;
  }
}
/* Bloques anchos (imágenes a sangre, calculadoras): se salen un poco de la columna de lectura en pantallas grandes. */
@media (min-width: 1280px) {
  .blog-body :deep(.cms-wide) {
    width: calc(100% + 8rem);
    margin-left: -4rem;
    max-width: none;
  }
}
.blog-body :deep(.cms-content > :first-child) {
  margin-top: 0;
}
.blog-body :deep(.cms-content p) {
  font-size: 1.05rem;
  line-height: 1.75;
}
.blog-body :deep(.cms-content h2) {
  margin-top: 3.5rem;
  font-size: 1.9rem;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.blog-body :deep(.cms-content h3) {
  margin-top: 2.25rem;
  font-size: 1.3rem;
}
.blog-body :deep(.cms-content figure img) {
  border-radius: 1.25rem;
}
.blog-body :deep(.cms-content table) {
  font-size: 0.92rem;
}
.blog-related {
  margin-top: 5rem;
  padding: 4rem 0;
  background: var(--cms-paper-2);
}
</style>
