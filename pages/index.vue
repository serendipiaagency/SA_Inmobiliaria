<template>
  <div>
    <!-- Hero -->
    <HeroSearch />

    <!-- Latest projects -->
    <section class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10">
      <div class="mb-10 flex items-end justify-between">
        <div>
          <p class="eyebrow">New releases</p>
          <h2 class="heading-serif mt-3 text-4xl">Latest off-plan projects</h2>
        </div>
        <NuxtLink to="/properties" class="btn-quiet hidden md:inline-flex">View all</NuxtLink>
      </div>
      <div v-if="data?.projects?.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectCard v-for="p in data.projects" :key="p.id" :project="p" />
      </div>
      <p v-else class="text-stone-500">No projects published yet.</p>
      <div class="mt-10 text-center md:hidden">
        <NuxtLink to="/properties" class="btn-quiet">View all projects</NuxtLink>
      </div>
    </section>

    <!-- Communities -->
    <section class="border-y border-line bg-white py-20">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div class="mb-10 flex items-end justify-between">
          <div>
            <p class="eyebrow">Neighbourhoods</p>
            <h2 class="heading-serif mt-3 text-4xl">Communities</h2>
          </div>
          <NuxtLink to="/project-community" class="btn-quiet hidden md:inline-flex">View all</NuxtLink>
        </div>
        <div v-if="data?.communities?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="c in data.communities"
            :key="c.id"
            :to="`/community/${c.id}`"
            class="group relative block aspect-[4/3] overflow-hidden bg-stone-100"
          >
            <img
              :src="mediaUrl(c.image)"
              :alt="c.name"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
            <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-6">
              <div>
                <h3 class="font-serif text-2xl font-medium text-white">{{ c.name }}</h3>
                <p v-if="c.location" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-white/70">
                  {{ c.location }}
                </p>
              </div>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-stone-500">No communities yet.</p>
      </div>
    </section>

    <!-- Developers -->
    <section class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10">
      <p class="eyebrow text-center">Our partners</p>
      <h2 class="heading-serif mt-3 text-center text-4xl">Trusted developers</h2>
      <div v-if="data?.developers?.length" class="mt-12 flex flex-wrap justify-center gap-4">
        <NuxtLink
          v-for="d in data.developers"
          :key="d.id"
          :to="{ path: '/properties', query: { developerId: d.id } }"
          class="flex h-28 w-full items-center justify-center border border-line bg-white px-8 transition hover:border-ink sm:w-[calc(33.333%-0.7rem)] lg:w-[calc(20%-0.8rem)]"
        >
          <img v-if="d.logo" :src="mediaUrl(d.logo)" :alt="d.name" class="max-h-12 object-contain" loading="lazy" />
          <span v-else class="text-center font-serif text-lg text-stone-600">{{ d.name }}</span>
        </NuxtLink>
      </div>
      <p v-else class="mt-8 text-center text-stone-500">No developers yet.</p>
    </section>

    <!-- Journal -->
    <section class="border-t border-line bg-white py-20">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div class="mb-10 flex items-end justify-between">
          <div>
            <p class="eyebrow">Journal</p>
            <h2 class="heading-serif mt-3 text-4xl">Insights & stories</h2>
          </div>
          <NuxtLink to="/blog" class="btn-quiet hidden md:inline-flex">All articles</NuxtLink>
        </div>
        <div v-if="data?.blogs?.length" class="grid gap-x-6 gap-y-10 md:grid-cols-3">
          <NuxtLink v-for="b in data.blogs" :key="b.id" :to="`/blog/${b.slug}`" class="group block">
            <div class="aspect-[3/2] overflow-hidden bg-stone-100">
              <img
                :src="mediaUrl(b.image)"
                :alt="b.title"
                class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
            <p class="eyebrow mt-5">{{ b.targetAudience }}</p>
            <h3 class="mt-2 font-serif text-xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">
              {{ b.title || b.slug }}
            </h3>
          </NuxtLink>
        </div>
        <p v-else class="text-stone-500">No articles yet.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/home')
</script>
