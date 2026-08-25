<template>
  <!-- A plain div, not a <label> — this wraps complex multi-control fields
  (payment-plan, video) too, and a <label> wrapping more than one focusable
  element makes browsers compute an overbroad accessible name (the whole
  wrapper's text) for controls inside it instead of their own label. Simple
  fields keep working the same: `.label` is styling only, not an HTML
  <label>, and checkbox already supplies its own explicit inline <label>. -->
  <div class="block" :class="spec.span === 2 ? 'sm:col-span-2' : ''">
    <span v-if="spec.type !== 'checkbox'" class="label">
      {{ spec.label }} <span v-if="spec.required" class="text-red-500">*</span>
    </span>

    <select v-if="spec.type === 'select'" :value="modelValue ?? ''" :class="inputCls" @change="emitUpdate(($event.target as HTMLSelectElement).value)">
      <option value="">—</option>
      <option v-for="opt in spec.options" :key="opt" :value="opt">{{ opt }}</option>
    </select>

    <select v-else-if="spec.type === 'relation'" :value="modelValue ?? ''" :class="inputCls" @change="emitUpdate(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)">
      <option value="">—</option>
      <option v-for="opt in relationOptions" :key="opt.id" :value="opt.id">{{ opt.name || opt.label || `#${opt.id}` }}</option>
    </select>

    <textarea
      v-else-if="spec.type === 'textarea' || spec.type === 'json'"
      :value="modelValue ?? ''"
      :class="inputCls"
      rows="4"
      @input="emitUpdate(($event.target as HTMLTextAreaElement).value)"
    />

    <div v-else-if="spec.type === 'image'" class="space-y-2">
      <div v-if="modelValue" class="flex items-center gap-3">
        <img :src="mediaUrl(String(modelValue))" class="h-16 w-16 border border-line object-cover" />
        <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="emitUpdate(null)">Quitar</button>
      </div>
      <input type="file" accept="image/*" class="block w-full text-xs text-stone-500" @change="onUpload($event)" />
      <p v-if="uploading" class="text-[11px] text-stone-400">Subiendo…</p>
      <p v-if="uploadError" class="text-[11px] text-red-500">{{ uploadError }}</p>
    </div>

    <label v-else-if="spec.type === 'checkbox'" class="flex items-center gap-2 text-sm text-stone-700">
      <input type="checkbox" :checked="!!modelValue" @change="emitUpdate(($event.target as HTMLInputElement).checked)" />
      {{ spec.label }}
    </label>

    <PaymentPlanEditor v-else-if="spec.type === 'payment-plan'" :model-value="modelValue" @update:model-value="emitUpdate" />
    <VideoField v-else-if="spec.type === 'video'" :model-value="modelValue" :upload-folder="uploadFolder" @update:model-value="emitUpdate" />

    <input v-else-if="spec.type === 'number'" :value="modelValue ?? ''" type="number" step="any" :class="inputCls" @input="emitUpdate(numOrNull(($event.target as HTMLInputElement).value))" />
    <input v-else-if="spec.type === 'url'" :value="modelValue ?? ''" type="url" placeholder="https://…" :class="inputCls" @input="emitUpdate(($event.target as HTMLInputElement).value)" />
    <input v-else :value="modelValue ?? ''" :class="inputCls" @input="emitUpdate(($event.target as HTMLInputElement).value)" />

    <span v-if="spec.hint" class="mt-1 block text-[11px] text-stone-400">{{ spec.hint }}</span>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import PaymentPlanEditor from './PaymentPlanEditor.vue'
import VideoField from './VideoField.vue'

const props = defineProps<{ spec: FieldSpec; modelValue: any; uploadFolder: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

const inputCls = 'input'

function numOrNull(v: string) {
  if (v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
function emitUpdate(v: any) {
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
