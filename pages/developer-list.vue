<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">Partners</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">Developers</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="d in data.rows"
          :key="d.id"
          :to="{ path: '/properties', query: { developerId: d.id } }"
          class="group border border-line bg-white p-8 transition hover:border-ink"
        >
          <div class="flex h-16 w-16 items-center justify-center border border-line bg-paper">
            <img v-if="d.logo" :src="mediaUrl(d.logo)" :alt="d.name" class="max-h-12 max-w-12 object-contain" />
            <span v-else class="font-serif text-2xl text-stone-500">{{ d.name.charAt(0) }}</span>
          </div>
          <h3 class="mt-5 font-serif text-2xl font-medium group-hover:underline group-hover:underline-offset-4">
            {{ d.name }}
          </h3>
          <p class="eyebrow mt-2">{{ d.projectCount }} project(s)</p>
          <p v-if="d.description" class="mt-3 line-clamp-3 text-sm leading-relaxed text-stone-500">{{ d.description }}</p>
        </NuxtLink>
      </div>
      <p v-else class="py-24 text-center font-serif text-2xl text-stone-500">No developers published yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/developers')
useHead({ title: 'Developers — M&M Real Estate' })
</script>
