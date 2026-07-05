<template>
  <div v-if="loading" class="skeleton h-8 w-64 rounded-full" />
  <div v-else-if="stats.length" class="flex flex-wrap items-center gap-4 text-[13px] text-stone-500">
    <span v-for="s in stats" :key="s.key" class="inline-flex items-center gap-1.5">
      <svg class="h-4 w-4 text-stone-400" v-html="s.icon" />
      <span><strong class="font-semibold text-ink">{{ s.value }}</strong> {{ s.label }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()

const loading = ref(true)
const data = ref<{ viewCount: number; favoriteCount: number; leadCount: number } | null>(null)
let poll: ReturnType<typeof setInterval> | null = null

const icons = {
  eye: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.5"/>',
  heart: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z"/>',
  chat: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
}

const stats = computed(() => {
  if (!data.value) return []
  const out: { key: string; value: number; label: string; icon: string }[] = []
  if (data.value.viewCount > 0) out.push({ key: 'views', value: data.value.viewCount, label: data.value.viewCount === 1 ? 'vista' : 'vistas', icon: icons.eye })
  if (data.value.favoriteCount > 0) out.push({ key: 'favs', value: data.value.favoriteCount, label: data.value.favoriteCount === 1 ? 'favorito' : 'favoritos', icon: icons.heart })
  if (data.value.leadCount > 0) out.push({ key: 'leads', value: data.value.leadCount, label: data.value.leadCount === 1 ? 'consulta recibida' : 'consultas recibidas', icon: icons.chat })
  return out
})

async function fetchEngagement() {
  try {
    data.value = await $fetch<any>(`/api/public/properties/${props.slug}/engagement`)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const seenKey = `sa_viewed_${props.slug}`
  if (!sessionStorage.getItem(seenKey)) {
    sessionStorage.setItem(seenKey, '1')
    $fetch(`/api/public/properties/${props.slug}/view`, { method: 'POST' }).catch(() => {})
  }
  await fetchEngagement()
  poll = setInterval(fetchEngagement, 25000)
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
})
</script>
