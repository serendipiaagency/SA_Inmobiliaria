<template>
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4">
        <NuxtLink to="/" class="text-xl font-bold tracking-tight text-emerald-800">
          SA <span class="text-slate-800">Inmobiliaria</span>
        </NuxtLink>
        <nav class="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <NuxtLink to="/properties" class="hover:text-emerald-700">Off-plan</NuxtLink>
          <NuxtLink to="/project-community" class="hover:text-emerald-700">Communities</NuxtLink>
          <NuxtLink to="/developer-list" class="hover:text-emerald-700">Developers</NuxtLink>
          <NuxtLink to="/leadership" class="hover:text-emerald-700">Team</NuxtLink>
          <NuxtLink to="/blog" class="hover:text-emerald-700">Blog</NuxtLink>
          <NuxtLink to="/contact-us" class="hover:text-emerald-700">Contact</NuxtLink>
        </nav>
        <div class="flex items-center gap-3">
          <NuxtLink v-if="user?.role === 'admin'" to="/admin" class="btn-secondary !py-2">Admin</NuxtLink>
          <NuxtLink v-else to="/login" class="btn-secondary !py-2">Sign in</NuxtLink>
          <button class="md:hidden" aria-label="Menu" @click="open = !open">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
      <nav v-if="open" class="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
        <div class="flex flex-col gap-3 text-sm font-medium text-slate-700">
          <NuxtLink to="/properties" @click="open = false">Off-plan</NuxtLink>
          <NuxtLink to="/project-community" @click="open = false">Communities</NuxtLink>
          <NuxtLink to="/developer-list" @click="open = false">Developers</NuxtLink>
          <NuxtLink to="/leadership" @click="open = false">Team</NuxtLink>
          <NuxtLink to="/blog" @click="open = false">Blog</NuxtLink>
          <NuxtLink to="/contact-us" @click="open = false">Contact</NuxtLink>
        </div>
      </nav>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-slate-600 md:grid-cols-4">
        <div>
          <p class="mb-2 text-base font-bold text-emerald-800">SA Inmobiliaria</p>
          <p>Property marketplace for off-plan projects, secondary sales and communities.</p>
        </div>
        <div>
          <p class="mb-2 font-semibold text-slate-800">Explore</p>
          <ul class="space-y-1">
            <li><NuxtLink to="/properties">Off-plan projects</NuxtLink></li>
            <li><NuxtLink to="/project-community">Communities</NuxtLink></li>
            <li><NuxtLink to="/developer-list">Developers</NuxtLink></li>
          </ul>
        </div>
        <div>
          <p class="mb-2 font-semibold text-slate-800">Company</p>
          <ul class="space-y-1">
            <li><NuxtLink to="/about-us">About us</NuxtLink></li>
            <li><NuxtLink to="/leadership">Our team</NuxtLink></li>
            <li><NuxtLink to="/blog">Blog</NuxtLink></li>
          </ul>
        </div>
        <div>
          <p class="mb-2 font-semibold text-slate-800">Forms</p>
          <ul class="space-y-1">
            <li><NuxtLink to="/visitor">Visitor form</NuxtLink></li>
            <li><NuxtLink to="/vendors/registration">Vendor registration</NuxtLink></li>
            <li><NuxtLink to="/complain">Complaints</NuxtLink></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {{ new Date().getFullYear() }} SA Inmobiliaria. All rights reserved.
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const open = ref(false)
const { user, loaded, refresh } = useAuth()
onMounted(() => {
  if (!loaded.value) refresh()
})
</script>
