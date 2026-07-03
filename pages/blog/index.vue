<template>
  <div class="mx-auto max-w-7xl px-4 py-10">
    <h1 class="mb-6 text-3xl font-bold">Blog</h1>
    <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="b in data.rows" :key="b.id" :to="`/blog/${b.slug}`" class="card group block">
        <img :src="mediaUrl(b.image)" :alt="b.title" class="h-48 w-full object-cover" loading="lazy" />
        <div class="p-4">
          <p class="text-xs uppercase text-emerald-700">{{ b.targetAudience }}</p>
          <h3 class="mt-1 font-semibold group-hover:text-emerald-700">{{ b.title || b.slug }}</h3>
          <p v-if="b.description" class="mt-2 line-clamp-3 text-sm text-slate-600">{{ stripHtml(b.description) }}</p>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="py-16 text-center text-slate-500">No articles published yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/blogs')
useHead({ title: 'Blog — SA Inmobiliaria' })
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').slice(0, 220)
}
</script>
