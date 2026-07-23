<template>
  <!-- CMS article -->
  <article v-if="data?.source === 'cms'" class="mx-auto max-w-3xl px-4 py-12">
    <div class="flex items-center gap-2 text-xs text-stone-450">
      <NuxtLink v-if="data.category" :to="`/blog?categoria=${data.category.slug}`" class="rounded-full bg-stone-100 px-2.5 py-1 font-semibold">{{ data.category.name }}</NuxtLink>
      <span>{{ data.article.readingTimeMinutes }} min de lectura</span>
      <span>·</span>
      <span>{{ data.article.viewCount }} vistas</span>
    </div>
    <h1 class="mt-3 heading-serif text-4xl">{{ data.article.title }}</h1>
    <p v-if="data.article.excerpt" class="mt-3 text-lg text-stone-500">{{ data.article.excerpt }}</p>

    <NuxtLink v-if="data.author" :to="`/blog/autor/${data.author.slug}`" class="mt-6 flex items-center gap-3">
      <img v-if="data.author.photo" :src="mediaUrl(data.author.photo)" class="h-10 w-10 rounded-full object-cover" />
      <span v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{{ data.author.name?.[0] }}</span>
      <span>
        <span class="block text-sm font-medium">{{ data.author.name }}</span>
        <span class="block text-xs text-stone-450">{{ data.author.specialty }}</span>
      </span>
    </NuxtLink>

    <img v-if="data.article.coverImage" :src="mediaUrl(data.article.coverImage)" :alt="data.article.title" class="mt-8 w-full rounded-xl object-cover" />

    <div class="mt-8">
      <CmsTableOfContents :blocks="blocks" />
    </div>

    <CmsBlockRenderer :blocks="blocks" />

    <div v-if="data.tags?.length" class="mt-10 flex flex-wrap gap-2">
      <span v-for="t in data.tags" :key="t.slug" class="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">#{{ t.name }}</span>
    </div>

    <!-- Comments -->
    <section class="mt-14 border-t border-line pt-8">
      <h2 class="font-serif text-2xl">Comentarios{{ commentTree.length ? ` (${comments.length})` : '' }}</h2>

      <div v-if="commentTree.length" class="mt-6 space-y-5">
        <CmsCommentThread v-for="c in commentTree" :key="c.id" :comment="c" :replying-to="replyingTo" @reply="replyingTo = $event" @submit-reply="submitComment" />
      </div>
      <p v-else class="mt-4 text-sm text-stone-450">Sé el primero en comentar.</p>

      <form v-if="!replyingTo" class="mt-8 space-y-3" @submit.prevent="submitComment(null)">
        <div class="grid gap-3 sm:grid-cols-2">
          <input v-model="commentForm.authorName" class="input" placeholder="Tu nombre" required />
          <input v-model="commentForm.authorEmail" type="email" class="input" placeholder="Email (opcional)" />
        </div>
        <textarea v-model="commentForm.content" class="input" rows="3" placeholder="Escribe tu comentario…" required />
        <button type="submit" class="btn-primary" :disabled="commentSending">{{ commentSending ? 'Enviando…' : 'Publicar comentario' }}</button>
        <p v-if="commentNotice" class="text-sm text-emerald-700">{{ commentNotice }}</p>
      </form>
    </section>
  </article>

  <!-- Legacy blog post -->
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
    />
    <div
      class="prose prose-slate mt-8 max-w-none whitespace-pre-line leading-relaxed text-stone-600"
      :dir="locale === 'ar' ? 'rtl' : 'ltr'"
    >
      {{ stripHtml(current?.description || '') }}
    </div>
  </article>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch<any>(`/api/public/blogs/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })

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

const requestUrl = useRequestURL()
const canonicalUrl = computed(() =>
  data.value?.source === 'cms' && data.value.article.seoCanonical ? data.value.article.seoCanonical : `${requestUrl.origin}/blog/${route.params.slug}`,
)
useHead(() => ({
  ...seoHead({
    title:
      data.value?.source === 'cms'
        ? `${data.value.article.seoTitle || data.value.article.title} — M&M Real Estate`
        : `${current.value?.title || 'Blog'} — M&M Real Estate`,
    description:
      data.value?.source === 'cms'
        ? data.value.article.seoDescription || data.value.article.excerpt || ''
        : stripHtml(current.value?.description || '').slice(0, 200) || 'Artículos sobre el mercado inmobiliario de Dubái.',
    image: `${requestUrl.origin}${mediaUrl(data.value?.source === 'cms' ? data.value.article.coverImage : data.value?.blog.image)}`,
    type: 'article',
    canonical: canonicalUrl.value,
    robots: data.value?.source === 'cms' ? data.value.article.seoRobots : null,
  }),
  script:
    data.value?.source === 'cms'
      ? [
          {
            type: 'application/ld+json',
            innerHTML: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: data.value.article.title,
              description: data.value.article.seoDescription || data.value.article.excerpt || '',
              image: data.value.article.coverImage ? `${requestUrl.origin}${mediaUrl(data.value.article.coverImage)}` : undefined,
              datePublished: data.value.article.publishedAt,
              dateModified: data.value.article.updatedAt,
              author: data.value.author ? { '@type': 'Person', name: data.value.author.name } : undefined,
              publisher: { '@type': 'Organization', name: 'M&M Real Estate' },
              mainEntityOfPage: canonicalUrl.value,
            }),
          },
        ]
      : [],
}))

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

onMounted(() => {
  if (data.value?.source === 'cms') {
    $fetch(`/api/public/cms/articles/${route.params.slug}/view`, { method: 'POST' }).catch(() => {})
  }
})

const { data: commentsData, refresh: refreshComments } = await useFetch<any>(
  () => (data.value?.source === 'cms' ? `/api/public/cms/articles/${route.params.slug}/comments` : null),
)
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
