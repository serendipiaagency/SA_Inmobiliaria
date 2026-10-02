<template>
  <div>
    <label :for="`${uid}-hex`" class="label">Color de marca</label>
    <div class="flex items-center gap-3">
      <input
        :id="`${uid}-picker`"
        type="color"
        class="h-12 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1"
        :value="isHexColor(text) ? text : fallback"
        aria-label="Selector de color"
        :disabled="disabled"
        data-testid="org-color-picker"
        @input="onPicker"
      >
      <input
        :id="`${uid}-hex`"
        v-model="text"
        type="text"
        class="input max-w-[11rem] font-mono uppercase"
        placeholder="#1F6F5C"
        maxlength="7"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-describedby="`${uid}-help`"
        :disabled="disabled"
        data-testid="org-color-hex"
        @blur="normalize"
      >
    </div>
    <p v-if="invalid" :id="`${uid}-help`" class="mt-1.5 text-xs font-medium text-red-600" role="alert">{{ error || 'Usa el formato #RRGGBB, por ejemplo #1F6F5C.' }}</p>
    <p v-else :id="`${uid}-help`" class="mt-1.5 text-xs text-stone-500">Se usa en botones y detalles de la web y del panel de esta empresa.</p>
  </div>
</template>

<script setup lang="ts">
import { isHexColor } from '~/utils/organizationLabels'

/** Color de marca: selector + campo HEX sincronizados; sólo emite valores válidos o vacío. */
const props = defineProps<{ modelValue: string; disabled?: boolean; error?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const fallback = '#1F2937'
const text = ref(props.modelValue || '')

watch(
  () => props.modelValue,
  (v) => {
    if ((v || '') !== text.value.toUpperCase()) text.value = v || ''
  },
)
watch(text, (v) => {
  const value = v.trim()
  const withHash = value && !value.startsWith('#') ? `#${value}` : value
  if (!value) emit('update:modelValue', '')
  else if (isHexColor(withHash)) emit('update:modelValue', withHash.toUpperCase())
  else emit('update:modelValue', value) // inválido: el padre lo ve y no deja avanzar
})

const invalid = computed(() => Boolean(props.error) || (text.value.trim() !== '' && !isHexColor(text.value.trim().startsWith('#') ? text.value.trim() : `#${text.value.trim()}`)))

function onPicker(e: Event) {
  text.value = (e.target as HTMLInputElement).value.toUpperCase()
}
function normalize() {
  const value = text.value.trim()
  const withHash = value && !value.startsWith('#') ? `#${value}` : value
  if (isHexColor(withHash)) text.value = withHash.toUpperCase()
}
</script>
