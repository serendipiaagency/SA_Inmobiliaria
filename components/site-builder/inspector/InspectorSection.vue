<template>
  <div v-if="visible" class="border-b border-line py-3 first:pt-0 last:border-b-0">
    <button type="button" class="flex w-full items-center justify-between text-left" @click="open = !open">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ title }}</span>
      <svg class="h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform" :class="open ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div v-show="open" class="mt-3">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Tab-aware: `tab` places this section under one of the Inspector's three
 * tabs (Contenido/Diseño/Avanzado — see index.vue's `provide('inspectorTab', ...)`).
 * Defaults to 'content' since that's where most existing sections
 * (Contenido/Multimedia/Datos/Comportamiento) conceptually belong — only
 * design-ish sections need to opt into `tab="design"` explicitly, and only
 * the shell's own "Avanzado" (CommonBlockSettings) uses `tab="advanced"`.
 * Provide/inject (not a prop threaded through every *Inspector.vue) because
 * the active tab lives in the shell, several component layers above the
 * inspector that's currently rendered via `<component :is="...">`.
 */
const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean; tab?: 'content' | 'design' | 'advanced' }>(), {
  defaultOpen: true,
  tab: 'content',
})
const open = ref(props.defaultOpen)
const activeInspectorTab = inject<Ref<'content' | 'design' | 'advanced'>>('inspectorTab', ref('content'))
const visible = computed(() => props.tab === activeInspectorTab.value)
</script>
