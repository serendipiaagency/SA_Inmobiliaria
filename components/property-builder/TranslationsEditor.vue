<template>
  <div class="space-y-6">
    <div v-for="tr in modelValue" :key="tr.locale">
      <p class="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink">{{ tr.locale === 'en' ? 'Inglés' : 'Árabe' }}</p>
      <label class="mb-3 block">
        <span class="label">Título</span>
        <input :value="tr.title" class="input" @input="update(tr.locale, 'title', ($event.target as HTMLInputElement).value)" >
      </label>
      <label class="block">
        <span class="label">Descripción</span>
        <textarea :value="tr.description" class="input" rows="4" @input="update(tr.locale, 'description', ($event.target as HTMLTextAreaElement).value)" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
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
