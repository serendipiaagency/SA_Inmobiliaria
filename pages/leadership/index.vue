<template>
  <div class="mx-auto max-w-7xl px-4 py-10">
    <h1 class="mb-6 text-3xl font-bold">Our team</h1>
    <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink v-for="m in data.rows" :key="m.id" :to="`/leadership/${m.slug}`" class="card group block">
        <div class="h-56 overflow-hidden bg-slate-200">
          <img
            :src="mediaUrl(m.image)"
            :alt="m.name"
            class="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div class="p-4">
          <h3 class="font-semibold group-hover:text-emerald-700">{{ m.name }}</h3>
          <p class="text-sm text-slate-500">{{ m.position }}</p>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="py-16 text-center text-slate-500">Team coming soon.</p>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/team')
useHead({ title: 'Our team — SA Inmobiliaria' })
</script>
