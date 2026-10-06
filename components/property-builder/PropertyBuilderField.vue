<template>
  <!-- A plain div, not a <label> — this wraps complex multi-control fields
  (payment-plan, video) too, and a <label> wrapping more than one focusable
  element makes browsers compute an overbroad accessible name (the whole
  wrapper's text) for controls inside it instead of their own label. Simple
  fields keep working the same: `.label` is styling only, not an HTML
  <label>, and checkbox already supplies its own explicit inline <label>. -->
  <AgentPickerField
    v-if="spec.type === 'agent'"
    :data-field="spec.key"
    :label="spec.label"
    :model-value="modelValue"
    :span="spec.span"
    @update:model-value="emitUpdate"
  />
  <StepperField
    v-else-if="spec.type === 'stepper'"
    :data-field="spec.key"
    :label="spec.label"
    :model-value="modelValue"
    :span="spec.span"
    @update:model-value="emitUpdate"
  />
  <div v-else class="block" :class="spec.span === 2 ? 'sm:col-span-2' : ''" :data-field="spec.key">
    <span v-if="spec.type !== 'checkbox'" class="pe-label">
      {{ spec.label }} <span v-if="spec.required" class="text-red-500">*</span>
    </span>

    <!-- `aria-label` en cada control y no un <label for>: el envoltorio no
         puede ser un <label> (arriba se explica por qué), y sin esto los
         campos llegaban al lector de pantalla sin nombre accesible. -->
    <select v-if="spec.type === 'select'" :value="modelValue ?? ''" :aria-label="spec.label" :class="inputCls" @change="emitUpdate(($event.target as HTMLSelectElement).value)">
      <option value="">—</option>
      <option v-for="opt in spec.options" :key="opt" :value="opt">{{ spec.optionLabels?.[opt] || opt }}</option>
    </select>

    <select v-else-if="spec.type === 'relation'" :value="modelValue ?? ''" :aria-label="spec.label" :class="inputCls" @change="emitUpdate(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)">
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ opt.name || opt.label || `#${opt.id}` }}</option>
    </select>

    <textarea
      v-else-if="spec.type === 'textarea' || spec.type === 'json'"
      :value="modelValue ?? ''"
      :aria-label="spec.label"
      :class="inputCls"
      rows="4"
      @input="emitUpdate(($event.target as HTMLTextAreaElement).value)"
    />

    <RichTextField v-else-if="spec.type === 'rich-text'" :model-value="modelValue" @update:model-value="emitUpdate" />

    <div v-else-if="spec.type === 'image'">
      <div v-if="modelValue" class="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5">
        <img :src="mediaUrl(String(modelValue))" class="h-16 w-16 shrink-0 rounded-lg object-cover" >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[12px] text-stone-500">Imagen seleccionada</p>
          <div class="mt-1 flex gap-3">
            <label class="cursor-pointer text-[12px] font-semibold text-stone-600 hover:text-ink hover:underline">
              Sustituir
              <input type="file" accept="image/*" class="sr-only" @change="onUpload($event)" >
            </label>
            <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="emitUpdate(null)">Quitar</button>
          </div>
        </div>
      </div>
      <label v-else class="pe-drop cursor-pointer">
        <span class="text-[14px] font-medium text-ink">Arrastra una imagen o selecciónala</span>
        <span class="mt-1 text-[12px] text-stone-450">JPG, PNG o WebP · Recomendado 1600 × 1000 px</span>
        <input type="file" accept="image/*" class="sr-only" @change="onUpload($event)" >
      </label>
      <p v-if="uploading" class="mt-1.5 text-[11px] text-stone-400">Subiendo…</p>
      <p v-if="uploadError" class="mt-1.5 text-[11px] text-red-500">{{ uploadError }}</p>
    </div>

    <button
      v-else-if="spec.type === 'checkbox'"
      type="button"
      class="pe-chip"
      :class="modelValue ? 'pe-chip-on' : 'pe-chip-off'"
      :aria-pressed="!!modelValue"
      @click="emitUpdate(!modelValue)"
    >
      <svg v-if="modelValue" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
      {{ spec.label }}
    </button>

    <PaymentPlanEditor v-else-if="spec.type === 'payment-plan'" :model-value="modelValue" @update:model-value="emitUpdate" />
    <VideoField v-else-if="spec.type === 'video'" :model-value="modelValue" :upload-folder="uploadFolder" @update:model-value="emitUpdate" />

    <input v-else-if="spec.type === 'number'" :value="modelValue ?? ''" type="number" step="any" :aria-label="spec.label" :class="inputCls" @input="emitUpdate(numOrNull(($event.target as HTMLInputElement).value))" >
    <input
      v-else-if="spec.type === 'date'"
      :value="dateInputValue"
      type="date"
      :aria-label="spec.label"
      :class="inputCls"
      :data-testid="`field-date-${spec.key}`"
      @input="emitUpdate(($event.target as HTMLInputElement).value || null)"
    >
    <!-- Valor calculado (precio por m²…): se enseña, nunca se edita ni se guarda. -->
    <p v-else-if="spec.type === 'computed'" class="pe-input bg-stone-50 text-stone-600" :aria-label="spec.label" data-computed="true">{{ modelValue }}</p>
    <input v-else-if="spec.type === 'url'" :value="modelValue ?? ''" type="url" placeholder="https://…" :aria-label="spec.label" :class="inputCls" @input="emitUpdate(($event.target as HTMLInputElement).value)" >
    <input v-else :value="modelValue ?? ''" :aria-label="spec.label" :class="inputCls" @input="emitUpdate(($event.target as HTMLInputElement).value)" >

    <!-- Fecha escrita a mano antes de que fuera un selector (cierre D1p): se enseña tal cual estaba y cómo se entiende. -->
    <span v-if="legacyDateNote" class="mt-1.5 block text-[11px] text-amber-700" :data-testid="`field-legacy-date-${spec.key}`">{{ legacyDateNote }}</span>
    <span v-if="fieldError" class="mt-1.5 block text-[11px] font-medium text-red-600" role="alert" :data-testid="`field-error-${spec.key}`">{{ fieldError }}</span>
    <span v-if="spec.hint" class="mt-1.5 block text-[11px] text-stone-450">{{ spec.hint }}</span>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import PaymentPlanEditor from './PaymentPlanEditor.vue'
import VideoField from './VideoField.vue'
import AgentPickerField from './AgentPickerField.vue'
import StepperField from './StepperField.vue'
import RichTextField from './RichTextField.client.vue'
import { isStrictIsoDate, parsePropertyDate } from '~/utils/propertyDates'

const props = defineProps<{ spec: FieldSpec; modelValue: any; uploadFolder: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

/**
 * Fechas (cierre D1p): el selector enseña la fecha guardada aunque se
 * escribiera a mano en un formato antiguo («15/03/2025»), y avisa de que se
 * guardará como AAAA-MM-DD en cuanto se elija. Sin tocarla, no se reescribe.
 */
const dateInputValue = computed(() => (props.spec.type === 'date' ? parsePropertyDate(props.modelValue) || '' : ''))
const legacyDateNote = computed(() => {
  if (props.spec.type !== 'date') return ''
  const raw = props.modelValue
  if (raw === null || raw === undefined || String(raw).trim() === '' || isStrictIsoDate(String(raw).trim())) return ''
  const day = parsePropertyDate(raw)
  if (!day) return `Guardada como «${raw}», que no se entiende como fecha: elige la fecha correcta.`
  const [y, m, d] = day.split('-')
  return `Guardada como «${raw}» (formato antiguo): se lee como ${d}/${m}/${y}. Elige la fecha para guardarla en el formato nuevo.`
})

/**
 * Validación inmediata por campo (FASE 25, bloque N7a): el mismo criterio
 * que el servidor (utils/propertySheet.ts para la ficha ampliada y unos
 * límites básicos de la fila), dicho junto al campo en cuanto se escribe —
 * no al guardar. Es ayuda: el servidor vuelve a validar cada PUT.
 */
const touched = ref(false)
const fieldError = computed(() => validatePropertyField(props.spec, props.modelValue, touched.value))
const inputCls = computed(() => (fieldError.value ? 'pe-input !border-red-400' : 'pe-input'))

function numOrNull(v: string) {
  if (v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
function emitUpdate(v: any) {
  touched.value = true
  emit('update:modelValue', v)
}

const uploading = ref(false)
const uploadError = ref('')
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', props.uploadFolder)
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    emitUpdate(res.key)
  } catch (err: any) {
    uploadError.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir el archivo'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

const relationOptions = ref<any[]>([])
if (props.spec.type === 'relation' && props.spec.relationResource) {
  $fetch<{ rows: any[] }>(`/api/admin/${props.spec.relationResource}`, { query: { perPage: 100 } })
    .then((res) => (relationOptions.value = res.rows))
    .catch(() => (relationOptions.value = []))
}
</script>
