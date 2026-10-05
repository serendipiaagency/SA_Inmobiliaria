<template>
  <span v-if="tags?.length" class="inline-flex flex-wrap items-center gap-1" data-testid="tag-chips">
    <span
      v-for="t in visible"
      :key="t.id"
      class="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-indigo-700"
      :title="t.name"
      data-testid="tag-chip"
    >
      {{ t.name }}
    </span>
    <span v-if="hidden" class="text-[10px] text-stone-400" :title="tags.slice(max).map((t) => t.name).join(', ')">+{{ hidden }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * Las etiquetas de una fila (listados de propiedades, leads y contactos).
 * Sólo enseña: añadir y quitar se hace en la ficha (TagsEditor.vue).
 */
const props = withDefaults(defineProps<{ tags?: { id: number; name: string }[] | null; max?: number }>(), { tags: () => [], max: 3 })
const visible = computed(() => (props.tags || []).slice(0, props.max))
const hidden = computed(() => Math.max(0, (props.tags || []).length - props.max))
</script>
