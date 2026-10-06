<template>
  <img v-if="src" :src="src" :alt="name || ''" :class="[sizeClass, 'shrink-0 rounded-full object-cover']" loading="lazy" >
  <span v-else :class="[sizeClass, 'inline-flex shrink-0 items-center justify-center rounded-full bg-stone-100 font-semibold text-stone-500']" aria-hidden="true">{{ initials(name) }}</span>
</template>

<script setup lang="ts">
/** Foto de una persona (contacto, comercial) o sus iniciales si no tiene. */
const props = withDefaults(defineProps<{ photo?: string | null; name?: string | null; size?: 'sm' | 'md' | 'lg' }>(), { photo: null, name: null, size: 'sm' })
const src = computed(() => (props.photo ? mediaUrl(props.photo) : null))
const sizeClass = computed(() => ({ sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-sm' })[props.size])
</script>
