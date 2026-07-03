<template>
  <div>
    <!-- Hero -->
    <section class="bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 text-white">
      <div class="mx-auto max-w-7xl px-4 py-20 text-center md:py-28">
        <h1 class="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          Find your next property in the UAE
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-emerald-100">
          Off-plan projects, secondary sales and thriving communities from the region's top developers.
        </p>
        <form class="mx-auto mt-8 flex max-w-xl gap-2" @submit.prevent="search">
          <input v-model="q" class="input !py-3 text-slate-900" placeholder="Search projects or communities…" />
          <button type="submit" class="btn-primary !bg-white !text-emerald-900 hover:!bg-emerald-50">Search</button>
        </form>
      </div>
    </section>

    <!-- Latest projects -->
    <section class="mx-auto max-w-7xl px-4 py-14">
      <div class="mb-6 flex items-end justify-between">
        <h2 class="text-2xl font-bold">Latest off-plan projects</h2>
        <NuxtLink to="/properties" class="text-sm font-semibold text-emerald-700 hover:underline">View all →</NuxtLink>
      </div>
      <div v-if="data?.projects?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectCard v-for="p in data.projects" :key="p.id" :project="p" />
      </div>
      <p v-else class="text-slate-500">No projects published yet.</p>
    </section>

    <!-- Communities -->
    <section class="bg-white py-14">
      <div class="mx-auto max-w-7xl px-4">
        <div class="mb-6 flex items-end justify-between">
          <h2 class="text-2xl font-bold">Communities</h2>
          <NuxtLink to="/project-community" class="text-sm font-semibold text-emerald-700 hover:underline">
            View all →
          </NuxtLink>
        </div>
        <div v-if="data?.communities?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="c in data.communities"
            :key="c.id"
            :to="`/community/${c.id}`"
            class="card group relative block h-44"
          >
            <img :src="mediaUrl(c.image)" :alt="c.name" class="h-full w-full object-cover" loading="lazy" />
            <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-4">
              <h3 class="text-lg font-semibold text-white">{{ c.name }}</h3>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-slate-500">No communities yet.</p>
      </div>
    </section>

    <!-- Developers -->
    <section class="mx-auto max-w-7xl px-4 py-14">
      <h2 class="mb-6 text-2xl font-bold">Trusted developers</h2>
      <div v-if="data?.developers?.length" class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div v-for="d in data.developers" :key="d.id" class="card flex items-center justify-center p-4">
          <img v-if="d.logo" :src="mediaUrl(d.logo)" :alt="d.name" class="max-h-14 object-contain" loading="lazy" />
          <span v-else class="text-center text-sm font-semibold text-slate-600">{{ d.name }}</span>
        </div>
      </div>
      <p v-else class="text-slate-500">No developers yet.</p>
    </section>

    <!-- Blog -->
    <section class="bg-white py-14">
      <div class="mx-auto max-w-7xl px-4">
        <div class="mb-6 flex items-end justify-between">
          <h2 class="text-2xl font-bold">From the blog</h2>
          <NuxtLink to="/blog" class="text-sm font-semibold text-emerald-700 hover:underline">All articles →</NuxtLink>
        </div>
        <div v-if="data?.blogs?.length" class="grid gap-6 md:grid-cols-3">
          <NuxtLink v-for="b in data.blogs" :key="b.id" :to="`/blog/${b.slug}`" class="card group block">
            <img :src="mediaUrl(b.image)" :alt="b.title" class="h-40 w-full object-cover" loading="lazy" />
            <div class="p-4">
              <h3 class="font-semibold group-hover:text-emerald-700">{{ b.title || b.slug }}</h3>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-slate-500">No articles yet.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/public/home')
const q = ref('')
const router = useRouter()
function search() {
  router.push({ path: '/properties', query: q.value ? { q: q.value } : {} })
}
</script>
