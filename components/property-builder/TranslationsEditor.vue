<template>
  <div class="space-y-6">
    <div v-for="tr in modelValue" :key="tr.locale">
      <p class="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink">{{ tr.locale === 'en' ? 'Inglés' : 'Árabe' }}</p>
      <label class="mb-3 block">
        <span class="label">Título</span>
        <input :value="tr.title" class="input" @input="update(tr.locale, 'title', ($event.target as HTMLInputElement).value)" >
      </label>
      <div>
        <span class="label">Descripción</span>
        <RichTextField :model-value="tr.description" @update:model-value="(v) => update(tr.locale, 'description', v)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextField from './RichTextField.client.vue'

interface Translation {
  locale: string
  title: string
  description: string
}
const props = defineProps<{ modelValue: Translation[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Translation[]] }>()

function update(locale: string, field: 'title' | 'description', value: string) {
  emit(
    'update:modelValue',
    props.modelValue.map((t) => (t.locale === locale ? { ...t, [field]: value } : t)),
  )
}
</script>
