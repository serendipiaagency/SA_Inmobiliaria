<template>
  <header
    class="no-print z-40 transition-colors duration-300"
    :class="[
      overlayNav ? 'fixed inset-x-0 top-0' : 'sticky top-0 border-b border-line bg-white/95 backdrop-blur',
      overlayNav && !navLight ? 'border-b border-line bg-white/95 backdrop-blur' : '',
      overlayNav && navLight ? 'border-b border-transparent bg-transparent' : '',
    ]"
  >
    <div class="mx-auto flex max-w-screen-2xl items-center justify-between gap-8 px-6 py-5 lg:px-10">
      <NuxtLink to="/" class="shrink-0">
        <Logo size="md" :dark="navLight" :company-name="tenant?.companyName" :logo-url="mediaUrl(tenant?.logo)" />
      </NuxtLink>

      <nav class="hidden items-center gap-9 text-[11px] font-semibold uppercase tracking-widest2 lg:flex" :class="navLight ? 'text-white/85' : 'text-stone-500'">
        <NuxtLink to="/propiedades" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.offplan') }}</NuxtLink>
        <NuxtLink to="/mapa" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.map') }}</NuxtLink>
        <NuxtLink to="/zonas" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.communities') }}</NuxtLink>
        <NuxtLink to="/promotoras" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.developers') }}</NuxtLink>
        <NuxtLink to="/equipo" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.team') }}</NuxtLink>
        <NuxtLink to="/blog" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'">{{ t('nav.journal') }}</NuxtLink>
      </nav>

      <div class="flex items-center gap-4">
        <LocaleSwitcher class="hidden md:flex" :dark="navLight" />
        <NuxtLink
          to="/favoritos"
          class="relative hidden transition md:inline-flex"
          :class="navLight ? 'text-white/85 hover:text-white' : 'text-stone-500 hover:text-ink'"
          :aria-label="t('nav.favorites')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z" />
          </svg>
          <span v-if="favIds.length" class="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-white">
            {{ favIds.length }}
          </span>
        </NuxtLink>
        <NuxtLink
          to="/contacto"
          class="hidden border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 transition md:inline-flex"
          :class="navLight ? 'border-white/70 text-white hover:bg-white hover:text-ink' : 'border-ink text-ink hover:bg-ink hover:text-white'"
        >
          {{ t('nav.contact') }}
        </NuxtLink>
        <NuxtLink
          v-if="isStaff"
          to="/admin"
          class="hidden text-[11px] font-semibold uppercase tracking-widest2 transition md:inline"
          :class="navLight ? 'text-white/85 hover:text-white' : 'text-stone-500 hover:text-ink'"
        >
          {{ t('nav.admin') }}
        </NuxtLink>
        <NuxtLink
          v-else-if="user"
          to="/mi-cuenta"
          class="hidden text-[11px] font-semibold uppercase tracking-widest2 transition md:inline"
          :class="navLight ? 'text-white/85 hover:text-white' : 'text-stone-500 hover:text-ink'"
        >
          {{ t('nav.myAccount', 'Mi cuenta') }}
        </NuxtLink>
        <NuxtLink
          v-else
          to="/login"
          class="hidden text-[11px] font-semibold uppercase tracking-widest2 transition md:inline"
          :class="navLight ? 'text-white/85 hover:text-white' : 'text-stone-500 hover:text-ink'"
        >
          {{ t('nav.signin') }}
        </NuxtLink>
        <button class="lg:hidden" :class="navLight ? 'text-white' : 'text-ink'" aria-label="Menu" @click="open = !open">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </div>

    <nav v-if="open" class="border-t border-line bg-white px-6 py-5 lg:hidden">
      <div class="flex flex-col gap-4 text-[11px] font-semibold uppercase tracking-widest2 text-stone-600">
        <NuxtLink to="/propiedades" @click="open = false">{{ t('nav.offplan') }}</NuxtLink>
        <NuxtLink to="/mapa" @click="open = false">{{ t('nav.map') }}</NuxtLink>
        <NuxtLink to="/zonas" @click="open = false">{{ t('nav.communities') }}</NuxtLink>
        <NuxtLink to="/promotoras" @click="open = false">{{ t('nav.developers') }}</NuxtLink>
        <NuxtLink to="/equipo" @click="open = false">{{ t('nav.team') }}</NuxtLink>
        <NuxtLink to="/blog" @click="open = false">{{ t('nav.journal') }}</NuxtLink>
        <NuxtLink to="/contacto" @click="open = false">{{ t('nav.contact') }}</NuxtLink>
        <NuxtLink :to="isStaff ? '/admin' : user ? '/mi-cuenta' : '/login'" @click="open = false">
          {{ isStaff ? t('nav.admin') : user ? t('nav.myAccount', 'Mi cuenta') : t('nav.signin') }}
        </NuxtLink>
      </div>
      <div class="mt-5 border-t border-line pt-5"><LocaleSwitcher /></div>
    </nav>
  </header>
</template>

<script setup lang="ts">
const open = ref(false)
const { t } = useI18n()
const { user, loaded, refresh } = useAuth()
const isStaff = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin')
const { load: loadFav, ids: favIds } = useFavorites()
const { tenant, load: loadTenant } = useTenant()
await loadTenant()

// Pages that opt in (e.g. the home page, via definePageMeta({ transparentHero: true }))
// get a nav that starts transparent over a fullscreen hero and solidifies on scroll.
const route = useRoute()
const overlayNav = computed(() => route.meta.transparentHero === true)
const scrolled = ref(false)
const navLight = computed(() => overlayNav.value && !scrolled.value)
function onScroll() {
  scrolled.value = window.scrollY > 48
}

onMounted(() => {
  if (!loaded.value) refresh()
  loadFav()
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>
