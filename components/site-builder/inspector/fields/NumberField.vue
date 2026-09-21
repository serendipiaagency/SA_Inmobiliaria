<template>
  <label class="mb-3 block">
    <span class="label flex items-center justify-between">
      <span>{{ label }}<span v-if="overridden" class="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" title="Tiene un valor propio" /></span>
      <button v-if="overridden" type="button" class="text-[10px] font-semibold normal-case tracking-normal text-stone-400 hover:text-ink" @click.prevent="$emit('update:modelValue', undefined)">Restablecer</button>
    </span>
    <div class="flex items-center gap-2">
      <input type="range" class="min-w-0 flex-1 accent-ink" :min="min" :max="max" :step="step" :value="modelValue ?? inherited ?? min" @input="onInput" >
      <input
        type="number"
        class="input !w-20 !py-1.5 !text-[12px] tabular-nums"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue ?? ''"
        :placeholder="inherited !== undefined ? String(inherited) : '—'"
        :data-testid="testId"
        @change="onInput"
      >
      <span class="w-6 shrink-0 text-[11px] text-stone-400">{{ unit }}</span>
    </div>
  </label>
</template>

<script setup lang="ts">
/**
 * Número con deslizador y campo, para tamaños, espaciados y radios. Vacío
 * significa "heredado" (no se guarda nada); el placeholder enseña el valor
 * que se hereda cuando se conoce.
 */
withDefaults(
  defineProps<{
    label: string
    modelValue: number | undefined
    min: number
    max: number
    step?: number
    unit?: string
    inherited?: number
    overridden?: boolean
    testId?: string
  }>(),
  { step: 1, unit: 'px', inherited: undefined, overridden: false, testId: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: number | undefined] }>()

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') return emit('update:modelValue', undefined)
  const n = Number(raw)
  emit('update:modelValue', Number.isFinite(n) ? n : undefined)
}
</script>
