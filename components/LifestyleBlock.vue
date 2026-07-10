<template>
  <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 3" :key="i" class="skeleton h-28 rounded-2xl" />
  </div>
  <div v-else-if="categories.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="c in categories" :key="c.type" class="rounded-2xl border border-line bg-white p-5">
      <div class="flex items-center gap-2.5">
        <span class="flex h-9 w-9 items-center justify-center rounded-full" :style="{ background: meta(c.type).bg, color: meta(c.type).color }" v-html="meta(c.type).icon" />
        <div>
          <p class="text-lg font-semibold leading-none">{{ c.count }}</p>
          <p class="text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ meta(c.type).label }}</p>
        </div>
      </div>
      <p class="mt-3 text-[13px] text-stone-500">
        <span class="font-medium text-ink">{{ c.nearestName }}</span> {{ t('lifestyleBlock.distanceConnector', 'a') }} {{ formatDistance(c.nearestDistance) }}
      </p>
    </div>
  </div>
  <p v-else class="text-sm text-stone-500">{{ t('lifestyleBlock.empty', 'No hay datos de entorno disponibles para esta ubicación.') }}</p>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const { t } = useI18n()

const loading = ref(true)
const categories = ref<{ type: string; count: number; nearestName: string; nearestDistance: number }[]>([])

const META: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  transporte: { label: t('lifestyleBlock.transport', 'Transporte'), bg: '#eff6ff', color: '#2563eb', icon: ic('M4 16h16M6 16V8a2 2 0 012-2h8a2 2 0 012 2v8M8 20h.01M16 20h.01') },
  colegios: { label: t('lifestyleBlock.schools', 'Colegios'), bg: '#f0fdf4', color: '#16a34a', icon: ic('M12 3l9 4.5-9 4.5-9-4.5L12 3zM7 10.2V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-5.8') },
  hospitales: { label: t('lifestyleBlock.hospitals', 'Hospitales'), bg: '#fef2f2', color: '#dc2626', icon: ic('M12 8v8M8 12h8M5 5h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z') },
  super: { label: t('lifestyleBlock.supermarkets', 'Supermercados'), bg: '#fffbeb', color: '#d97706', icon: ic('M3 6h18M6 6l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 10v4M15 10v4') },
  playas: { label: t('lifestyleBlock.beaches', 'Playas'), bg: '#ecfeff', color: '#0891b2', icon: ic('M3 17c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M5 13V6a2 2 0 012-2h10a2 2 0 012 2v7') },
}
function meta(type: string) {
  return META[type] || { label: type, bg: '#f5f5f4', color: '#57534e', icon: '' }
}
function ic(path: string) {
  return `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`
}
function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

onMounted(async () => {
  try {
    const res = await $fetch<any>(`/api/public/properties/${props.slug}/lifestyle`)
    categories.value = res.categories || []
  } catch {
    categories.value = []
  } finally {
    loading.value = false
  }
})
</script>
