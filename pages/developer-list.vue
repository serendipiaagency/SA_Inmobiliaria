<template>
  <div class="mx-auto max-w-7xl px-4 py-10">
    <h1 class="mb-6 text-3xl font-bold">Developers</h1>
    <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="d in data.rows"
        :key="d.id"
        :to="{ path: '/properties', query: { developerId: d.id } }"
        class="card group flex items-start gap-4 p-5"
      >
        <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <img v-if="d.logo" :src="mediaUrl(d.logo)" :alt="d.name" class="max-h-12 max-w-12 object-contain" />
          <span v-else class="text-xl font-bold text-slate-400">{{ d.name.charAt(0) }}</span>
        </div>
        <div>
          <h3 class="font-semibold group-hover:text-emerald-700">{{ d.name }}</h3>
          <p class="text-sm text-slate-500">{{ d.projectCount }} project(s)</p>
          <p v-if="d.description" class="mt-1 line-clamp-2 text-sm text-slate-600">{{ d.description }}</p>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="py-16 text-center text-slate-500">No developers published yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/developers')
useHead({ title: 'Developers — SA Inmobiliaria' })
</script>
