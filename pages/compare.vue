<template>
  <div class="mx-auto max-w-screen-2xl px-6 py-12 lg:px-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="eyebrow">{{ t('compare.eyebrow', 'Comparador') }}</p>
        <h1 class="heading-serif mt-3 text-4xl">{{ t('compare.title', 'Comparar propiedades') }}</h1>
      </div>
      <button v-if="items.length" class="btn-quiet" @click="clear">{{ t('compare.clear', 'Vaciar') }}</button>
    </div>

    <div v-if="!items.length" class="py-24 text-center">
      <p class="font-serif text-2xl text-stone-500">{{ t('compare.empty', 'No has añadido propiedades para comparar.') }}</p>
      <NuxtLink to="/properties" class="btn-primary mt-6">{{ t('properties.exploreCta', 'Explorar propiedades') }}</NuxtLink>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th class="w-40" />
            <th v-for="p in rows" :key="p.id" class="p-3 align-top">
              <div class="relative">
                <NuxtLink :to="`/property-details/${p.slug || p.id}`">
                  <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="aspect-[4/3] w-full rounded-xl object-cover" />
                </NuxtLink>
                <button
                  class="act-remove absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink shadow"
                  :aria-label="`${t('compare.removeAriaPrefix', 'Quitar')} ${p.name} ${t('compare.removeAriaSuffix', 'del comparador')}`"
                  @click="remove(p.id)"
                >
                  ×
                </button>
                <h3 class="mt-3 font-serif text-lg font-medium leading-tight">{{ p.name }}</h3>
                <p class="text-[12px] text-stone-500">{{ p.community }}</p>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in specs" :key="row.key" class="border-t border-line">
            <td class="py-3 pr-4 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ row.label }}</td>
            <td v-for="p in rows" :key="p.id" class="px-3 py-3 text-ink">{{ row.get(p) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead(
  seoHead({
    title: t('compare.head.title', 'Comparar — M&M Real Estate'),
    description: 'Compara propiedades lado a lado por precio, superficie y características.',
  }),
)
const { items, load, remove, clear } = useCompare()
const enriched = ref<Record<number, any>>({})
const rows = computed(() => items.value.map((i) => enriched.value[i.id] || { id: i.id, name: i.name, coverImage: i.cover, slug: i.slug, price: i.price }))
onMounted(async () => {
  load()
  if (items.value.length) {
    const res = await $fetch<any>('/api/public/properties', { query: { ids: items.value.map((i) => i.id).join(',') } })
    const byId: Record<number, any> = {}
    for (const p of res.rows || []) byId[p.id] = p
    enriched.value = byId
  }
})

const { format: fmtCur } = useCurrency()
function fmt(v: number | null | undefined) {
  return v ? fmtCur(v) : '—'
}
const specs = computed(() => [
  { key: 'price', label: t('hero.price', 'Precio'), get: (p: any) => fmt(p.price) },
  { key: 'm2', label: t('compare.spec.pricePerM2', 'Precio / m²'), get: (p: any) => (p.price && p.area ? fmt(Math.round(p.price / p.area)) : '—') },
  { key: 'type', label: t('compare.spec.type', 'Tipo'), get: (p: any) => p.propertyType || '—' },
  { key: 'beds', label: t('hero.bedrooms', 'Habitaciones'), get: (p: any) => p.bedrooms ?? '—' },
  { key: 'baths', label: t('hero.bathrooms', 'Baños'), get: (p: any) => p.bathrooms ?? '—' },
  { key: 'area', label: t('hero.area', 'Superficie'), get: (p: any) => (p.area ? `${Math.round(p.area)} m²` : '—') },
  { key: 'status', label: t('compare.spec.status', 'Estado'), get: (p: any) => ({ new: t('filters.status.new', 'Obra nueva'), under_construction: t('filters.status.underConstruction', 'En construcción'), ready: t('compare.status.ready', 'Listo') }[p.status as string] || '—') },
  { key: 'energy', label: t('compare.spec.efficiency', 'Eficiencia'), get: (p: any) => p.energyRating || '—' },
  { key: 'yield', label: t('badge.yield', 'Rentabilidad'), get: (p: any) => (p.rentalYield ? `${p.rentalYield}%` : '—') },
  { key: 'year', label: t('compare.spec.year', 'Año'), get: (p: any) => p.yearBuilt || '—' },
  { key: 'orientation', label: t('compare.spec.orientation', 'Orientación'), get: (p: any) => p.orientation || '—' },
])
</script>

<style scoped>
.act-remove {
  transition: transform 0.2s, background-color 0.2s;
}
.act-remove:hover {
  transform: scale(1.08);
  background: #fff;
}
.act-remove:active {
  transform: scale(0.92);
}
</style>
