<template>
  <div class="group relative overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md" :class="{ 'demo-reference-frame': property.demoReference }" :data-demo-reference="property.demoReference ? '1' : undefined">
    <NuxtLink :to="`/admin/properties/${property.id}`" class="block">
      <div class="relative flex h-40 items-center justify-center bg-stone-50">
        <img v-if="property.mainImage" :src="mediaUrl(property.mainImage)" class="h-full w-full object-cover" loading="lazy" >
        <span v-else class="text-3xl">🏠</span>
        <span v-if="property.demoReference" class="demo-reference-tag absolute bottom-2 left-2 z-[6]" :data-testid="`property-reference-tag-${property.id}`" title="Ejemplo de ficha trabajada a fondo en la demo; no es una certificación">Propiedad de referencia</span>
        <span
          class="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          :class="property.status === 'sold' ? 'bg-stone-800 text-white' : 'bg-emerald-100 text-emerald-700'"
          title="Disponibilidad"
        >
          {{ STATUS_LABELS[property.status] || property.status }}
        </span>
        <!-- Estado comercial común (cierre D1p), si está indicado. -->
        <span
          v-if="property.commercialStatus"
          class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          :class="LIST_CHIP_CLASSES[commercialStatusTone(property.commercialStatus)]"
          title="Estado comercial"
          :data-testid="`property-card-commercial-${property.id}`"
        >
          {{ commercialStatusLabel(property.commercialStatus) }}
        </span>
      </div>
      <div class="p-4">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span v-if="property.transactionType" class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            {{ property.transactionType === 'rent' ? 'Alquiler' : 'Venta' }}
          </span>
          <span class="text-[11px] text-stone-400">Ref. #{{ property.id }}</span>
        </div>
        <p class="line-clamp-1 font-medium text-ink">{{ property.propertyType ? propertyTypeLabel(property.propertyType) : 'Vivienda' }}</p>
        <p class="mt-0.5 line-clamp-1 text-[12px] text-stone-450">
          {{ [property.district, property.city, property.country].filter(Boolean).join(' · ') || property.location || 'Sin ubicación' }}
        </p>
        <div class="mt-2 flex items-center justify-between">
          <p class="font-semibold text-ink">{{ formatPrice(property.price) }}</p>
          <p class="text-[11px] text-stone-400">{{ formatDate(property.updatedAt) }}</p>
        </div>
        <div class="mt-2 flex gap-3 text-[12px] text-stone-500">
          <span v-if="property.bedrooms != null" title="Dormitorios" :aria-label="`${property.bedrooms} dormitorios`">🛏 {{ property.bedrooms }}</span>
          <span v-if="property.bathrooms != null">🛁 {{ property.bathrooms }}</span>
          <span v-if="property.area != null">📐 {{ property.area }} m²</span>
        </div>
        <TagChips v-if="property.tags?.length" class="mt-2" :tags="property.tags" />
      </div>
    </NuxtLink>

    <div class="flex items-center gap-1 border-t border-line px-3 py-2">
      <NuxtLink :to="`/admin/properties/${property.id}`" class="text-[12px] font-medium text-stone-600 hover:text-ink hover:underline">Editar</NuxtLink>
      <AdminActionsMenu
        class="ml-auto"
        :label="`Acciones de la propiedad #${property.id}`"
        trigger-class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink"
        :items="menuItems"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import TagChips from '~/components/admin/tags/TagChips.vue'
import { priceSuffixFor, propertyTypeLabel } from '~/utils/propertySheet'
import { commercialStatusLabel, commercialStatusTone } from '~/utils/propertyCommercialStatus'
import { LIST_CHIP_CLASSES } from '~/composables/usePropertyListConfig'
import type { AdminActionItem } from '~/components/admin/ActionsMenu.vue'

const props = defineProps<{ property: Record<string, any> }>()
const emit = defineEmits<{ 'toggle-sold': [id: number]; duplicate: [id: number]; delete: [id: number] }>()

const STATUS_LABELS: Record<string, string> = { available: 'Disponible', sold: 'Vendida' }

const menuItems = computed<AdminActionItem[]>(() => [
  { label: props.property.status === 'sold' ? 'Marcar disponible' : 'Marcar vendida', onClick: () => emit('toggle-sold', props.property.id) },
  { label: 'Duplicar', onClick: () => emit('duplicate', props.property.id) },
  { label: 'Eliminar', danger: true, onClick: () => emit('delete', props.property.id) },
])

// Moneda de la propiedad (o la de la agencia si no tiene), sin convertir (utils/currency.ts).
// En alquiler el precio es la renta de cada mes (cierre D1p): «1.200 € /mes».
const { format: formatAgencyMoney } = useAgencyCurrency()
function formatPrice(v: number | null | undefined) {
  if (typeof v !== 'number') return '—'
  const suffix = priceSuffixFor(props.property.transactionType)
  return `${formatAgencyMoney(v, { currency: props.property.currency })}${suffix ? ` ${suffix}` : ''}`
}
function formatDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString('es-ES') : '—'
}
</script>
