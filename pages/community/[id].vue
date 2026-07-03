<template>
  <div v-if="data">
    <section class="relative h-64 bg-slate-800 md:h-80">
      <img :src="mediaUrl(data.community.image)" :alt="data.community.name" class="h-full w-full object-cover opacity-80" />
      <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent">
        <div class="mx-auto w-full max-w-7xl px-4 pb-8 text-white">
          <h1 class="text-3xl font-bold md:text-4xl">{{ data.community.name }}</h1>
          <p v-if="data.community.location" class="mt-1 text-slate-200">{{ data.community.location }}</p>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-7xl space-y-10 px-4 py-12">
      <section v-if="data.community.description">
        <h2 class="mb-3 text-2xl font-bold">About</h2>
        <p class="whitespace-pre-line leading-relaxed text-slate-700">{{ data.community.description }}</p>
      </section>

      <section v-if="data.community.featureDescription">
        <h2 class="mb-3 text-2xl font-bold">Features</h2>
        <p class="whitespace-pre-line leading-relaxed text-slate-700">{{ data.community.featureDescription }}</p>
      </section>

      <section v-if="data.amenities.length">
        <h2 class="mb-3 text-2xl font-bold">Amenities</h2>
        <ul class="grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="a in data.amenities" :key="a.id" class="card flex items-center gap-2 p-3">
            <img v-if="a.logo" :src="mediaUrl(a.logo)" class="h-6 w-6 object-contain" />
            <span>{{ a.name }}</span>
          </li>
        </ul>
      </section>

      <section v-if="data.projects.length">
        <h2 class="mb-3 text-2xl font-bold">Projects in {{ data.community.name }}</h2>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
