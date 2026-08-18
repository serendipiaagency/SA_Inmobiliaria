<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título (línea 1)"><input v-model="content.title1" :class="inputCls" /></EditorField>
    <EditorField label="Título (línea 2, cursiva)"><input v-model="content.title2" :class="inputCls" /></EditorField>
    <EditorField label="Subtítulo"><textarea v-model="content.subtitle" :class="inputCls" rows="3" /></EditorField>

    <EditorField label="Imágenes de fondo" hint="Se rotan en bucle. Pega una URL y pulsa Añadir.">
      <div v-for="(slide, i) in slides" :key="i" class="mb-1.5 flex items-center gap-1.5">
        <input :value="slide" :class="inputCls" class="flex-1" @input="setSlide(i, ($event.target as HTMLInputElement).value)" />
        <button type="button" class="shrink-0 text-stone-300 hover:text-red-500" @click="removeSlide(i)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <button type="button" class="mt-1 text-[12px] font-semibold text-ink underline" @click="addSlide">+ Añadir imagen</button>
    </EditorField>

    <EditorField label="Botón principal"><input v-model="content.exploreCta" :class="inputCls" placeholder="Texto" /></EditorField>
    <EditorField label="Enlace del botón principal"><input v-model="content.exploreCtaTo" :class="inputCls" placeholder="/demo/properties" /></EditorField>
    <EditorField label="Botón secundario"><input v-model="content.advisorCta" :class="inputCls" placeholder="Texto" /></EditorField>
    <EditorField label="Enlace del botón secundario"><input v-model="content.advisorCtaTo" :class="inputCls" placeholder="/demo/contact-us" /></EditorField>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
const slides = computed<string[]>(() => (Array.isArray(content.value.slides) ? content.value.slides : []))

function addSlide() {
  if (!Array.isArray(content.value.slides)) content.value.slides = []
  content.value.slides.push('')
}
function setSlide(i: number, value: string) {
  content.value.slides[i] = value
}
function removeSlide(i: number) {
  content.value.slides.splice(i, 1)
}
</script>
