<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">People</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">Our team</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="m in data.rows" :key="m.id" :to="`/leadership/${m.slug}`" class="group block">
          <div class="aspect-[3/4] overflow-hidden bg-stone-100">
            <img
              :src="mediaUrl(m.image)"
              :alt="m.name"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <h3 class="mt-4 font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">
            {{ m.name }}
          </h3>
          <p class="eyebrow mt-1.5">{{ m.position }}</p>
        </NuxtLink>
      </div>
      <p v-else class="py-24 text-center font-serif text-2xl text-stone-500">Team coming soon.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/team')
useHead({ title: 'Our team — M&M Real Estate' })
</script>
