<template>
  <select
    :value="modelValue"
    class="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] font-medium"
    :class="modelValue === 'required' ? 'text-rose-700' : modelValue === 'preferred' ? 'text-ink' : 'text-stone-400'"
    :aria-label="`Importancia: ${CRITERION_LABELS[criterion] || criterion}`"
    :data-testid="`req-imp-${criterion}`"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as Importance)"
  >
    <option v-for="i in allowedImportances(criterion)" :key="i" :value="i">{{ IMPORTANCE_LABELS[i] }}</option>
  </select>
</template>

<script setup lang="ts">
import { CRITERION_LABELS, IMPORTANCE_LABELS, allowedImportances, type Importance } from '~/utils/buyerRequirementCatalog'

/** Imprescindible / preferible / indiferente para un criterio (las opciones que ese criterio admite, del catálogo). */
defineProps<{ criterion: string; modelValue: Importance }>()
const emit = defineEmits<{ 'update:modelValue': [value: Importance] }>()
</script>
