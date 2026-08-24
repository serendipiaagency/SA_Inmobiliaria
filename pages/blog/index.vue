<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">{{ t('home.blog.eyebrow', 'Journal') }}</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">{{ t('blog.hero.title', 'Ideas e historias') }}</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="b in data.rows" :key="b.id" :to="`/blog/${b.slug}`" class="group block">
          <div class="aspect-[3/2] overflow-hidden bg-stone-100">
            <img
              :src="mediaUrl(b.image)"
              :alt="b.title"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <p class="eyebrow mt-5">{{ b.targetAudience }}</p>
          <h3 class="mt-2 font-serif text-2xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">
            {{ b.title || b.slug }}
          </h3>
          <p v-if="b.description" class="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-500">
            {{ stripHtml(b.description) }}
          </p>
        </NuxtLink>
      </div>
      <p v-else class="py-24 text-center font-serif text-2xl text-stone-500">{{ t('blog.empty', 'Aún no hay artículos publicados.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { data } = await useFetch('/api/public/blogs')
useHead(
  seoHead({
    title: 'Journal — M&M Real Estate',
    description: 'Artículos y guías sobre el mercado inmobiliario de Dubái: comunidades, tendencias e inversión.',
  }),
)
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').slice(0, 220)
}
</script>
