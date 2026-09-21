<template>
  <div class="mb-3">
    <span class="label flex items-center justify-between">
      <span>{{ label }}<span v-if="overridden" class="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" title="Tiene un valor propio" /></span>
      <button v-if="overridden" type="button" class="text-[10px] font-semibold normal-case tracking-normal text-stone-400 hover:text-ink" @click="set(undefined)">Restablecer</button>
    </span>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
        :class="!modelValue ? 'border-ink' : 'border-transparent hover:border-line'"
        title="Heredado"
        @click="set(undefined)"
      >
        <span class="h-5 w-5 rounded-full bg-white bg-[linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%),linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%)] bg-[length:6px_6px] bg-[position:0_0,3px_3px] ring-1 ring-inset ring-black/10" />
      </button>
      <template v-if="brandSwatches.length">
        <button
          v-for="c in brandSwatches"
          :key="`brand-${c.value}`"
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
          :class="modelValue === c.value ? 'border-ink' : 'border-transparent hover:border-line'"
          :title="`${c.label} (marca)`"
          :data-testid="`color-brand-${c.value.slice(1)}`"
          @click="set(c.value)"
        >
          <span class="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10" :style="{ backgroundColor: c.value }" />
        </button>
        <span class="mx-0.5 h-4 w-px bg-line" />
      </template>
      <button
        v-for="c in PALETTE"
        :key="c.value"
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
        :class="modelValue === c.value ? 'border-ink' : 'border-transparent hover:border-line'"
        :title="c.label"
        @click="set(c.value)"
      >
        <span class="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10" :style="{ backgroundColor: c.value }" />
      </button>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <input type="color" class="h-7 w-9 cursor-pointer rounded border border-line bg-white p-0.5" :value="pickerValue" title="Color personalizado" @input="onPicker" >
      <input
        :value="modelValue || ''"
        class="input !w-32 !py-1.5 font-mono !text-[12px]"
        :placeholder="inherited || 'heredado'"
        maxlength="9"
        :data-testid="testId"
        @change="onHex"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { normalizeColor } from '~/utils/siteBuilder/nodes'

/**
 * Selector de color: "heredado" primero, luego los colores del Brand Kit
 * como accesos rápidos, luego la paleta del sitio, y por último un color
 * personalizado (selector nativo o hex escrito). Sólo emite hex válidos.
 */
const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string | undefined
    brandColors?: { label: string; value: string }[]
    /** Lo que se hereda, como pista en el campo hex. */
    inherited?: string
    overridden?: boolean
    testId?: string
  }>(),
  { brandColors: () => [], inherited: undefined, overridden: false, testId: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()

const PALETTE = [
  { label: 'Tinta', value: '#16150f' },
  { label: 'Papel', value: '#fdfcfa' },
  { label: 'Blanco', value: '#ffffff' },
  { label: 'Superficie', value: '#f5f2ee' },
  { label: 'Piedra', value: '#78716c' },
  { label: 'Piedra clara', value: '#a8a29e' },
  { label: 'Acento', value: '#c07a54' },
  { label: 'Acento oscuro', value: '#7a3f26' },
  { label: 'Verde', value: '#059669' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Azul', value: '#2563eb' },
]

const brandSwatches = computed(() => {
  const seen = new Set<string>()
  const out: { label: string; value: string }[] = []
  for (const c of props.brandColors) {
    const v = normalizeColor(c.value)
    if (!v || v === 'transparent' || seen.has(v)) continue
    seen.add(v)
    out.push({ label: c.label, value: v })
  }
  return out
})

const pickerValue = computed(() => {
  const v = props.modelValue
  // <input type="color"> sólo entiende #rrggbb.
  if (v && /^#[0-9a-f]{6}$/i.test(v)) return v
  if (v && /^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return '#16150f'
})

function set(value: string | undefined) {
  emit('update:modelValue', value)
}
function onPicker(e: Event) {
  set((e.target as HTMLInputElement).value)
}
function onHex(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.trim()
  if (!raw) return set(undefined)
  const v = normalizeColor(raw.startsWith('#') ? raw : `#${raw}`)
  if (v) set(v)
  else input.value = props.modelValue || ''
}
</script>
