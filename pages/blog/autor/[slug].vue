<template>
  <div v-if="data" class="mx-auto max-w-4xl px-4 py-14">
    <div class="flex items-center gap-4">
      <img v-if="data.author.photo" :src="mediaUrl(data.author.photo)" class="h-20 w-20 rounded-full object-cover" />
      <span v-else class="flex h-20 w-20 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-white">{{ data.author.name?.[0] }}</span>
      <div>
        <h1 class="heading-serif text-3xl">{{ data.author.name }}</h1>
        <p v-if="data.author.specialty" class="text-stone-500">{{ data.author.specialty }}</p>
      </div>
    </div>
    <p v-if="data.author.bio" class="mt-6 max-w-2xl leading-relaxed text-stone-600">{{ data.author.bio }}</p>

    <div class="mt-4 flex gap-3 text-sm text-stone-450">
      <a v-if="data.author.linkedin" :href="data.author.linkedin" target="_blank" class="hover:underline">LinkedIn</a>
      <a v-if="data.author.instagram" :href="data.author.instagram" target="_blank" class="hover:underline">Instagram</a>
      <a v-if="data.author.twitter" :href="data.author.twitter" target="_blank" class="hover:underline">Twitter</a>
      <a v-if="data.author.facebook" :href="data.author.facebook" target="_blank" class="hover:underline">Facebook</a>
    </div>

    <h2 class="mt-12 font-serif text-2xl">Artículos de {{ data.author.name }}</h2>
    <div v-if="data.articles.length" class="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2">
      <NuxtLink v-for="a in data.articles" :key="a.id" :to="`/blog/${a.slug}`" class="group block">
        <div v-if="a.coverImage" class="aspect-[3/2] overflow-hidden rounded-lg bg-stone-100">
          <img :src="mediaUrl(a.coverImage)" :alt="a.title" class="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
        </div>
        <h3 class="mt-3 font-serif text-lg font-medium group-hover:underline">{{ a.title }}</h3>
        <p v-if="a.excerpt" class="mt-1 line-clamp-2 text-sm text-stone-500">{{ a.excerpt }}</p>
      </NuxtLink>
    </div>
    <p v-else class="mt-6 text-stone-450">Todavía no hay artículos publicados de este autor.</p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch<any>(`/api/public/cms/authors/${route.params.slug}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Author not found', fatal: true })

useHead(seoHead({ title: `${data.value.author.name} — M&M Real Estate`, description: data.value.author.bio || `Artículos de ${data.value.author.name}.` }))
</script>
