<template>
  <div class="mx-auto max-w-7xl px-4 py-10">
    <h1 class="mb-6 text-3xl font-bold">Communities</h1>
    <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="c in data.rows" :key="c.id" :to="`/community/${c.id}`" class="card group block">
        <div class="h-48 overflow-hidden bg-slate-200">
          <img
            :src="mediaUrl(c.image)"
            :alt="c.name"
            class="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div class="p-4">
          <h3 class="text-lg font-semibold group-hover:text-emerald-700">{{ c.name }}</h3>
          <p v-if="c.location" class="text-sm text-slate-500">{{ c.location }}</p>
          <p v-if="c.description" class="mt-2 line-clamp-2 text-sm text-slate-600">{{ c.description }}</p>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="py-16 text-center text-slate-500">No communities published yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/communities')
useHead({ title: 'Communities — SA Inmobiliaria' })
</script>
