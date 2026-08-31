<template>
  <div class="group relative overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md">
    <NuxtLink :to="`/admin/properties/${property.id}`" class="block">
      <div class="relative flex h-40 items-center justify-center bg-stone-50">
        <img v-if="property.mainImage" :src="mediaUrl(property.mainImage)" class="h-full w-full object-cover" loading="lazy" >
        <span v-else class="text-3xl">🏠</span>
        <span
          class="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          :class="property.status === 'sold' ? 'bg-stone-800 text-white' : 'bg-emerald-100 text-emerald-700'"
        >
          {{ STATUS_LABELS[property.status] || property.status }}
        </span>
      </div>
      <div class="p-4">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span v-if="property.transactionType" class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            {{ property.transactionType === 'rent' ? 'Alquiler' : 'Venta' }}
          </span>
          <span class="text-[11px] text-stone-400">Ref. #{{ property.id }}</span>
        </div>
        <p class="line-clamp-1 font-medium text-ink">{{ property.propertyType || 'Vivienda' }}</p>
        <p class="mt-0.5 line-clamp-1 text-[12px] text-stone-450">
          {{ [property.district, property.city, property.country].filter(Boolean).join(' · ') || property.location || 'Sin ubicación' }}
        </p>
        <div class="mt-2 flex items-center justify-between">
          <p class="font-semibold text-ink">{{ formatPrice(property.price) }}</p>
          <p class="text-[11px] text-stone-400">{{ formatDate(property.updatedAt) }}</p>
        </div>
        <div class="mt-2 flex gap-3 text-[12px] text-stone-500">
          <span v-if="property.bedrooms != null">🛏 {{ property.bedrooms }}</span>
          <span v-if="property.bathrooms != null">🛁 {{ property.bathrooms }}</span>
          <span v-if="property.area != null">📐 {{ property.area }} m²</span>
        </div>
      </div>
    </NuxtLink>

    <div class="flex items-center gap-1 border-t border-line px-3 py-2">
      <NuxtLink :to="`/admin/properties/${property.id}`" class="text-[12px] font-medium text-stone-600 hover:text-ink hover:underline">Editar</NuxtLink>
      <div ref="menuRoot" class="relative ml-auto">
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-ink" @click.stop="menuOpen = !menuOpen">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        <div v-if="menuOpen" class="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-line bg-white py-1 text-[13px] shadow-lg">
          <button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-stone-50" @click="act('toggle-sold')">{{ property.status === 'sold' ? 'Marcar disponible' : 'Marcar vendida' }}</button>
          <button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-stone-50" @click="act('duplicate')">Duplicar</button>
          <button type="button" class="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50" @click="act('delete')">Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ property: Record<string, any> }>()
const emit = defineEmits<{ 'toggle-sold': [id: number]; duplicate: [id: number]; delete: [id: number] }>()

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (!menuRoot.value?.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const STATUS_LABELS: Record<string, string> = { available: 'Disponible', sold: 'Vendida' }

function act(action: 'toggle-sold' | 'duplicate' | 'delete') {
  menuOpen.value = false
  emit(action as any, props.property.id)
}

function formatPrice(v: number | null | undefined) {
  return typeof v === 'number' ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v) + ' €' : '—'
}
function formatDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString('es-ES') : '—'
}
</script>
