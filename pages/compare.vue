<template>
  <div class="mx-auto max-w-screen-2xl px-6 py-12 lg:px-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="eyebrow">Comparador</p>
        <h1 class="heading-serif mt-3 text-4xl">Comparar propiedades</h1>
      </div>
      <button v-if="items.length" class="btn-quiet" @click="clear">Vaciar</button>
    </div>

    <div v-if="!items.length" class="py-24 text-center">
      <p class="font-serif text-2xl text-stone-500">No has añadido propiedades para comparar.</p>
      <NuxtLink to="/properties" class="btn-primary mt-6">Explorar propiedades</NuxtLink>
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
                <button class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink shadow" @click="remove(p.id)">×</button>
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
useHead({ title: 'Comparar — SA Inmobiliaria' })
const { items, load, remove, clear } = useCompare()
const { data } = await useFetch('/api/public/properties', { query: { perPage: 48 } })
onMounted(load)

const rows = computed(() => {
  const byId: Record<number, any> = {}
  for (const p of data.value?.rows || []) byId[p.id] = p
  return items.value.map((i) => byId[i.id] || { id: i.id, name: i.name, coverImage: i.cover, slug: i.slug, price: i.price })
})

function fmt(v: number | null | undefined) {
  return v ? `AED ${new Intl.NumberFormat('en-US').format(v)}` : '—'
}
const specs = [
  { key: 'price', label: 'Precio', get: (p: any) => fmt(p.price) },
  { key: 'm2', label: 'Precio / m²', get: (p: any) => (p.price && p.area ? fmt(Math.round(p.price / p.area)) : '—') },
  { key: 'type', label: 'Tipo', get: (p: any) => p.propertyType || '—' },
  { key: 'beds', label: 'Habitaciones', get: (p: any) => p.bedrooms ?? '—' },
  { key: 'baths', label: 'Baños', get: (p: any) => p.bathrooms ?? '—' },
  { key: 'area', label: 'Superficie', get: (p: any) => (p.area ? `${Math.round(p.area)} m²` : '—') },
  { key: 'status', label: 'Estado', get: (p: any) => ({ new: 'Obra nueva', under_construction: 'En construcción', ready: 'Listo' }[p.status as string] || '—') },
  { key: 'energy', label: 'Eficiencia', get: (p: any) => p.energyRating || '—' },
  { key: 'yield', label: 'Rentabilidad', get: (p: any) => (p.rentalYield ? `${p.rentalYield}%` : '—') },
  { key: 'year', label: 'Año', get: (p: any) => p.yearBuilt || '—' },
  { key: 'orientation', label: 'Orientación', get: (p: any) => p.orientation || '—' },
]
</script>
