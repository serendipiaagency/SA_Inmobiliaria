<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>

    <EditorField label="Diseño">
      <select v-model="content.layout" :class="inputCls">
        <option value="row">Fila con tarjetas</option>
        <option value="dark-grid">Destacado (fondo oscuro)</option>
        <option value="ai-grid">Cuadrícula con insignia</option>
      </select>
    </EditorField>

    <EditorField label="Qué propiedades mostrar" hint="Siempre en vivo: si cambias una propiedad en Propiedades (web), se refleja aquí solo.">
      <select v-model="content.dynamicFilter" :class="inputCls">
        <option value="latest">Más recientes</option>
        <option value="featured">Destacadas (exclusivas)</option>
        <option value="premium">Precio más alto</option>
        <option value="recommended">Mejor rentabilidad</option>
      </select>
    </EditorField>

    <EditorField label="Nº de propiedades">
      <input v-model.number="content.limit" type="number" min="1" max="12" :class="inputCls" />
    </EditorField>

    <EditorField v-if="content.layout === 'ai-grid'" label="Insignia"><input v-model="content.badge" :class="inputCls" placeholder="IA" /></EditorField>

    <EditorField label="Botón"><input v-model="content.cta" :class="inputCls" placeholder="Texto (vacío = sin botón)" /></EditorField>
    <EditorField label="Enlace del botón"><input v-model="content.ctaTo" :class="inputCls" placeholder="/demo/properties" /></EditorField>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
</script>
