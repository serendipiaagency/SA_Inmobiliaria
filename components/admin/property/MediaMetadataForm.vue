<template>
  <!-- eslint-disable vue/no-mutating-props -- `model` es un reactive() del padre pensado para editarse aquí. -->
  <div class="grid gap-3 rounded-lg border border-line bg-stone-50/60 p-3 sm:grid-cols-2" data-testid="media-metadata-form">
    <label class="block"><span class="pe-label">Título</span><input v-model="model.title" class="pe-input" :maxlength="MEDIA_TEXT_LIMITS.title" data-testid="media-metadata-title" ></label>
    <label class="block"><span class="pe-label">Texto alternativo (alt)</span><input v-model="model.alt" class="pe-input" :maxlength="MEDIA_TEXT_LIMITS.alt" data-testid="media-metadata-alt" ></label>
    <label class="block sm:col-span-2"><span class="pe-label">Pie de foto</span><textarea v-model="model.caption" rows="2" class="pe-input" :maxlength="MEDIA_TEXT_LIMITS.caption" /></label>
    <label class="block"><span class="pe-label">Idioma</span>
      <select v-model="model.language" class="pe-input"><option value="">—</option><option v-for="l in MEDIA_LANGUAGES" :key="l" :value="l">{{ MEDIA_LANGUAGE_LABELS[l] }}</option></select>
    </label>
    <div class="flex flex-wrap items-end gap-3 text-[12px] text-stone-600">
      <label class="flex items-center gap-1.5"><input v-model="model.isPublishable" type="checkbox" data-testid="media-metadata-publishable"> Publicable</label>
      <label class="flex items-center gap-1.5"><input v-model="model.isPrivate" type="checkbox" data-testid="media-metadata-private"> Privada</label>
      <label class="flex items-center gap-1.5"><input v-model="model.isHidden" type="checkbox" data-testid="media-metadata-hidden"> Oculta</label>
      <label v-if="showMain" class="flex items-center gap-1.5"><input v-model="model.isMain" type="checkbox"> Principal</label>
    </div>
    <p class="text-[11px] text-stone-500 sm:col-span-2">
      Sólo sale en la web y en los portales si es publicable, no es privada y no está oculta. Privada: el fichero deja de servirse sin sesión del panel.
    </p>
    <p v-if="error" class="text-[12px] font-medium text-red-600 sm:col-span-2">{{ error }}</p>
    <div class="sm:col-span-2"><button type="button" class="pe-btn-dark" :disabled="saving" data-testid="media-metadata-save" @click="$emit('save')">{{ saving ? 'Guardando…' : 'Guardar' }}</button></div>
  </div>
</template>

<script setup lang="ts">
import { MEDIA_LANGUAGES, MEDIA_LANGUAGE_LABELS, MEDIA_TEXT_LIMITS } from '~/utils/propertyMediaCatalog'

/** Formulario de metadatos de un recurso (foto de galería o multimedia): título, alt, pie, idioma y publicable / privada / oculta. */
withDefaults(defineProps<{ model: Record<string, any>; showMain?: boolean; error?: string; saving?: boolean }>(), { showMain: false, error: '', saving: false })
defineEmits<{ save: [] }>()
</script>
