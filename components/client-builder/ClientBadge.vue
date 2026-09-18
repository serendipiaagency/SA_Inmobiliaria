<template>
  <span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="CLIENT_BADGE_CLASSES[option.tone]">
    {{ option.label }}
  </span>
</template>

<script setup lang="ts">
import { CLIENT_BADGE_CLASSES, clientOption } from '~/composables/useClientConfig'

const props = defineProps<{ value: string | null | undefined; kind: 'type' | 'stage' }>()
const option = computed(() => clientOption(props.kind, props.value))
</script>
