<template>
  <div v-if="data">
    <section class="relative flex min-h-[55vh] items-end bg-ink">
      <img
        :src="mediaUrl(data.community.image)"
        :alt="data.community.name"
        class="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div class="relative mx-auto w-full max-w-screen-2xl px-6 pb-14 lg:px-10">
        <p v-if="data.community.location" class="eyebrow !text-white/70">{{ data.community.location }}</p>
        <h1 class="mt-3 font-serif text-5xl font-medium text-white md:text-6xl">{{ data.community.name }}</h1>
      </div>
    </section>

    <div class="mx-auto max-w-screen-2xl space-y-16 px-6 py-16 lg:px-10">
      <section v-if="data.community.description" class="max-w-3xl">
        <p class="eyebrow">About</p>
        <h2 class="heading-serif mt-3 text-3xl">The neighbourhood</h2>
        <p class="mt-6 whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">{{ data.community.description }}</p>
      </section>

      <section v-if="data.community.featureDescription" class="max-w-3xl">
        <p class="eyebrow">Features</p>
        <h2 class="heading-serif mt-3 text-3xl">What makes it special</h2>
        <p class="mt-6 whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">
          {{ data.community.featureDescription }}
        </p>
      </section>

      <section v-if="data.amenities.length">
        <p class="eyebrow">Amenities</p>
        <h2 class="heading-serif mt-3 text-3xl">Community amenities</h2>
        <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600">
            <span class="h-1 w-1 shrink-0 rounded-full bg-ink" />
            {{ a.name }}
          </li>
        </ul>
      </section>

      <section v-if="data.projects.length">
        <p class="eyebrow">Portfolio</p>
        <h2 class="heading-serif mt-3 text-3xl">Projects in {{ data.community.name }}</h2>
        <div class="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <ProjectCard v-for="p in data.projects" :key="p.id" :project="p" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(`/api/public/communities/${route.params.id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Community not found', fatal: true })
useHead({ title: `${data.value.community.name} — SA Inmobiliaria` })
</script>
