<template>
  <article v-if="data" class="mx-auto max-w-3xl px-4 py-12">
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
const { data } = await useFetch(`/api/public/blogs/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })

const locales = computed(() => data.value?.translations.map((t: any) => t.locale) || [])
const locale = ref(locales.value.includes('en') ? 'en' : locales.value[0] || 'en')
const current = computed(() => data.value?.translations.find((t: any) => t.locale === locale.value))
useHead({ title: `${current.value?.title || 'Blog'} — M&M Real Estate` })

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}
</script>
