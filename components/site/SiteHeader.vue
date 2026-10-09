<template>
  <header
    class="no-print z-40 transition-colors duration-300"
    data-site-header
    :class="[
      overlayNav ? 'fixed inset-x-0 top-0' : 'sticky top-0 border-b border-line bg-white/95 backdrop-blur',
      overlayNav && !navLight ? 'border-b border-line bg-white/95 backdrop-blur' : '',
      overlayNav && navLight ? 'border-b border-transparent bg-transparent' : '',
    ]"
  >
    <div class="mx-auto flex max-w-screen-2xl items-center justify-between gap-8 px-6 py-5 lg:px-10">
      <NuxtLink to="/" class="shrink-0">
        <Logo size="md" :dark="navLight" :company-name="tenant?.companyName || tenant?.name" :logo-url="mediaUrl(tenant?.logo)" />
      </NuxtLink>

      <!-- Menú principal (utils/siteNav.ts): centrado entre el logo y las acciones.
           Con los textos completos sólo cabe en una fila desde 1280 px; por debajo,
           el menú del móvil, sin encoger la letra. -->
      <nav class="hidden min-w-0 flex-1 items-center justify-center gap-7 whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest2 xl:flex 2xl:gap-9" :class="navLight ? 'text-white/85' : 'text-stone-500'" data-testid="site-nav">
        <NuxtLink v-for="item in PUBLIC_NAV" :key="item.key" :to="item.to" class="transition" :class="navLight ? 'hover:text-white' : 'hover:text-ink'" :data-nav="item.key">{{ t(item.i18nKey, item.label) }}</NuxtLink>
      </nav>

      <div class="flex shrink-0 items-center gap-4">
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
        <button class="xl:hidden" :class="navLight ? 'text-white' : 'text-ink'" aria-label="Menu" :aria-expanded="open" data-testid="site-nav-toggle" @click="open = !open">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </div>

    <nav v-if="open" class="border-t border-line bg-white px-6 py-5 xl:hidden" data-testid="site-nav-mobile">
      <div class="flex flex-col gap-4 text-[11px] font-semibold uppercase tracking-widest2 text-stone-600">
        <NuxtLink v-for="item in PUBLIC_NAV" :key="item.key" :to="item.to" :data-nav="item.key" @click="open = false">{{ t(item.i18nKey, item.label) }}</NuxtLink>
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
import type { TenantBranding } from '~/composables/useTenant'
import { PUBLIC_NAV } from '~/utils/siteNav'

/**
 * `tenantOverride`: el lienzo del Constructor Web pinta esta misma cabecera
 * para la organización que se está editando, que no es necesariamente la
 * que resuelve el host del panel — le pasa la marca de esa organización en
 * vez de la del dominio. Fuera del lienzo no se usa.
 */
const props = withDefaults(
  defineProps<{
    tenantOverride?: TenantBranding | null
    /**
     * Sólo el lienzo: si la cabecera va superpuesta sobre el hero (como en la
     * portada) o fija y sólida (como en el resto de páginas). En la web lo
     * decide la página con `transparentHero`; el lienzo es una sola ruta que
     * enseña cualquier página, así que se lo dice la página que se edita.
     */
    overlay?: boolean | null
  }>(),
  { tenantOverride: null, overlay: null },
)

const open = ref(false)
const { t } = useI18n()
const { user, loaded, refresh } = useAuth()
const isStaff = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin')
const { load: loadFav, ids: favIds } = useFavorites()
const { tenant: hostTenant, load: loadTenant } = useTenant()
await loadTenant()
const tenant = computed(() => props.tenantOverride ?? hostTenant.value)

// Pages that opt in (e.g. the home page, via definePageMeta({ transparentHero: true }))
// get a nav that starts transparent over a fullscreen hero and solidifies on scroll.
const route = useRoute()
const overlayNav = computed(() => (props.overlay ?? route.meta.transparentHero) === true)
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
