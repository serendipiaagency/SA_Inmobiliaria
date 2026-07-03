<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">Neighbourhoods</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">Communities</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="c in data.rows" :key="c.id" :to="`/community/${c.id}`" class="group block">
          <div class="aspect-[4/3] overflow-hidden bg-stone-100">
            <img
              :src="mediaUrl(c.image)"
              :alt="c.name"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <p v-if="c.location" class="eyebrow mt-5">{{ c.location }}</p>
          <h3 class="mt-2 font-serif text-2xl font-medium group-hover:underline group-hover:underline-offset-4">
            {{ c.name }}
          </h3>
          <p v-if="c.description" class="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500">{{ c.description }}</p>
        </NuxtLink>
      </div>
      <p v-else class="py-24 text-center font-serif text-2xl text-stone-500">No communities published yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/communities')
useHead({ title: 'Communities — SA Inmobiliaria' })
</script>
