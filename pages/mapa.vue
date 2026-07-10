<template>
  <div class="flex h-[calc(100vh-73px)] flex-col lg:flex-row">
    <!-- List -->
    <div v-show="view === 'list' || isDesktop" class="flex w-full flex-col border-r border-line lg:w-[42%] xl:w-[38%]">
      <div class="border-b border-line px-6 py-4">
        <p class="text-sm text-stone-500"><span class="font-semibold text-ink">{{ items.length }}</span> {{ t('mapa.propertiesOnMap', 'propiedades en el mapa') }}</p>
      </div>
      <div ref="listEl" class="flex-1 overflow-y-auto px-4 py-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="p in items"
            :key="p.id"
            :ref="(e) => setCardRef(p.id, e)"
            class="cursor-pointer rounded-2xl border transition"
            :class="active === p.id ? 'border-ink shadow-lg' : 'border-line hover:border-stone-300'"
            @mouseenter="active = p.id"
            @mouseleave="active = null"
            @click="goTo(p)"
          >
            <div class="aspect-[4/3] overflow-hidden rounded-t-2xl bg-stone-100">
              <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover" loading="lazy" />
            </div>
            <div class="p-4">
              <p class="font-semibold">{{ formatPrice(p.price) }}</p>
              <h3 class="truncate font-serif text-lg font-medium">{{ p.name }}</h3>
              <p class="truncate text-[13px] text-stone-500">{{ p.community }}</p>
              <p class="mt-1 text-[12px] text-stone-400">
                {{ p.bedrooms || t('card.studio', 'Estudio') }}<span v-if="p.bedrooms"> {{ t('card.beds', 'hab.') }}</span> · {{ p.bathrooms }} {{ t('card.baths', 'baños') }} · {{ Math.round(p.area || 0) }} m²
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Map -->
    <div v-show="view === 'map' || isDesktop" class="relative flex-1">
      <ClientOnly>
        <MapExplorer :items="items" :active-id="active" @marker-hover="active = $event" @marker-click="onMarkerClick" />
        <template #fallback>
          <div class="flex h-full items-center justify-center bg-stone-100 text-stone-400">{{ t('mapa.loading', 'Cargando mapa…') }}</div>
        </template>
      </ClientOnly>
    </div>

    <!-- Mobile toggle -->
    <button class="fixed bottom-5 left-1/2 z-[600] -translate-x-1/2 rounded-full bg-ink px-6 py-3 text-[12px] font-semibold uppercase tracking-widest2 text-white shadow-xl lg:hidden" @click="view = view === 'map' ? 'list' : 'map'">
      {{ view === 'map' ? t('mapa.viewList', 'Ver lista') : t('mapa.viewMap', 'Ver mapa') }}
    </button>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('mapa.head.title', 'Mapa — M&M Real Estate') })
const router = useRouter()
const { format: formatPrice } = useCurrency()
const { data } = await useFetch('/api/public/properties', { query: { perPage: 48 } })
const items = computed(() => (data.value?.rows || []).filter((p: any) => p.lat && p.lng))

const active = ref<number | null>(null)
const view = ref<'list' | 'map'>('map')
const isDesktop = ref(true)
const listEl = ref<HTMLElement | null>(null)
const cardRefs: Record<number, HTMLElement> = {}
function setCardRef(id: number, e: any) {
  if (e) cardRefs[id] = e
}

function onMarkerClick(id: number) {
  active.value = id
  const card = cardRefs[id]
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function goTo(p: any) {
  router.push(`/property-details/${p.slug || p.id}`)
}

onMounted(() => {
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', () => (isDesktop.value = window.innerWidth >= 1024))
})
</script>
