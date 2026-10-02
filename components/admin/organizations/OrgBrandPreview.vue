<template>
  <figure class="overflow-hidden rounded-2xl border border-line bg-white" data-testid="org-brand-preview" aria-label="Vista previa de la marca">
    <div class="flex items-center gap-3 px-4 py-3" :style="{ backgroundColor: color, color: textColor }">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/90">
        <img v-if="logoUrl" :src="logoUrl" alt="" class="h-full w-full object-contain">
        <span v-else class="text-sm font-bold text-ink">{{ initials }}</span>
      </div>
      <span class="truncate text-sm font-semibold">{{ displayName || 'Nombre de la empresa' }}</span>
    </div>
    <div class="space-y-3 p-4">
      <div class="h-2 w-3/4 rounded-full bg-line" />
      <div class="h-2 w-1/2 rounded-full bg-line" />
      <span class="inline-flex rounded-full px-4 py-2 text-xs font-semibold" :style="{ backgroundColor: color, color: textColor }">Contactar</span>
    </div>
    <figcaption class="border-t border-line px-4 py-2 text-[11px] text-stone-500">Vista previa aproximada</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { isHexColor, readableTextOn } from '~/utils/organizationLabels'

const props = defineProps<{ displayName: string; brandColor: string; logoUrl: string | null }>()

const color = computed(() => (isHexColor(props.brandColor) ? props.brandColor : '#1F2937'))
const textColor = computed(() => readableTextOn(color.value))
const initials = computed(
  () =>
    props.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || 'IN',
)
</script>
