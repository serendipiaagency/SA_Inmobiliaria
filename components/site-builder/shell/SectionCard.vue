<template>
  <!-- A <div> with role="button", not a nested <button> — the favorite
       toggle below is a real <button> and HTML forbids interactive
       elements inside one another. -->
  <div
    role="button"
    tabindex="0"
    class="group relative overflow-hidden rounded-xl border border-line p-2 text-left transition hover:border-ink hover:bg-paper"
    @click="emit('add', preset)"
    @keydown.enter="emit('add', preset)"
    @keydown.space.prevent="emit('add', preset)"
  >
    <SectionPreview :type="preset.type" :layout="preset.createContent().layout" />
    <span v-if="badge" class="absolute left-3 top-3 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink shadow-sm">{{ badge }}</span>
    <button
      type="button"
      class="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-stone-400 opacity-0 shadow-sm transition hover:text-ink group-hover:opacity-100"
      :class="favorite ? '!text-red-500 !opacity-100' : ''"
      :title="favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
      @click.stop="emit('toggle-favorite', preset.presetId)"
    >
      <svg class="h-3 w-3" viewBox="0 0 24 24" :fill="favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
    <p class="mt-2 truncate text-[13px] font-semibold text-ink">{{ preset.label }}</p>
    <p class="mt-0.5 line-clamp-2 text-[11px] text-stone-500">{{ preset.description }}</p>
  </div>
</template>

<script setup lang="ts">
import type { BlockPreset } from '~/composables/useSiteBuilderRegistry'
import { PRESET_BADGES } from '~/composables/useSiteBuilderRegistry'
import SectionPreview from './SectionPreview.vue'

const props = defineProps<{ preset: BlockPreset; favorite: boolean }>()
const emit = defineEmits<{ add: [preset: BlockPreset]; 'toggle-favorite': [presetId: string] }>()

const badge = computed(() => PRESET_BADGES[props.preset.presetId])
</script>
