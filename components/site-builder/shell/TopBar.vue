<template>
  <header class="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4">
    <!-- Left: back, title, autosave status (never the publish state — see SaveStatus.vue) -->
    <div class="flex min-w-0 items-center gap-3">
      <NuxtLink to="/admin/developer-properties" class="shrink-0 text-stone-400 transition hover:text-ink" aria-label="Volver">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
      </NuxtLink>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-ink">Constructor Web</p>
        <SaveStatus :state="saveState" />
      </div>
    </div>

    <!-- Center: device + zoom -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1 rounded-full bg-stone-100 p-1">
        <button
          v-for="d in devices"
          :key="d.key"
          type="button"
          class="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition"
          :class="device === d.key ? 'bg-white text-ink shadow' : 'text-stone-400 hover:text-ink'"
          :title="d.label"
          @click="emit('update:device', d.key)"
        >
          {{ d.short }}
        </button>
      </div>

      <div class="flex items-center gap-0.5 rounded-full bg-stone-100 p-1">
        <button type="button" class="toolbar-btn !h-6 !w-6" title="Alejar" :disabled="!canZoomOut" @click="emit('step-zoom', -1)">−</button>
        <button
          type="button"
          class="min-w-[3.2rem] rounded-full px-2 py-1 text-center text-[11px] font-semibold tabular-nums transition"
          :class="zoomIsAuto ? 'text-ink' : 'text-stone-500 hover:text-ink'"
          title="Ajustar al área disponible"
          @click="emit('zoom-auto')"
        >
          {{ zoomIsAuto ? `Ajustar · ${effectiveZoomPercent}%` : `${effectiveZoomPercent}%` }}
        </button>
        <button type="button" class="toolbar-btn !h-6 !w-6" title="Acercar" :disabled="!canZoomIn" @click="emit('step-zoom', 1)">+</button>
      </div>
    </div>

    <!-- Right: history, view, publish — "Publicar cambios" is the one CTA that stands out -->
    <div class="flex items-center gap-1.5">
      <button type="button" class="toolbar-btn" :disabled="!canUndo" title="Deshacer" @click="emit('undo')">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v6h6M3 13a9 9 0 1 0 3-6.7L3 9" /></svg>
      </button>
      <button type="button" class="toolbar-btn" :disabled="!canRedo" title="Rehacer" @click="emit('redo')">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 7v6h-6M21 13a9 9 0 1 1-3-6.7L21 9" /></svg>
      </button>
      <span class="mx-1 h-5 w-px bg-line" />
      <button
        type="button"
        class="toolbar-btn"
        :class="previewMode ? '!bg-ink !text-white' : ''"
        title="Vista previa"
        @click="emit('toggle-preview')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
      <a v-if="publishedSiteUrl" :href="publishedSiteUrl" target="_blank" rel="noopener" class="toolbar-btn" title="Abrir sitio publicado">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
      </a>
      <span v-else class="toolbar-btn cursor-not-allowed opacity-40" title="Configura un dominio para esta organización para poder abrir el sitio publicado">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
      </span>
      <button type="button" class="toolbar-btn" title="SEO de la página" @click="emit('open-seo')">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.3-4.3" /></svg>
      </button>
      <button
        type="button"
        class="btn-primary relative ml-1 !rounded-lg !px-4 !py-2 !text-[13px] !font-medium !normal-case !tracking-normal"
        :disabled="publishing"
        :title="hasUnpublishedChanges && !publishing ? 'Cambios sin publicar' : undefined"
        @click="emit('publish')"
      >
        <span v-if="hasUnpublishedChanges && !publishing" class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden="true" />
        {{ publishing ? 'Publicando…' : hasUnpublishedChanges ? 'Publicar cambios' : 'Publicado' }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import SaveStatus from './SaveStatus.vue'

defineProps<{
  devices: { key: 'desktop' | 'tablet' | 'mobile'; label: string; short: string }[]
  device: 'desktop' | 'tablet' | 'mobile'
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  effectiveZoomPercent: number
  zoomIsAuto: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  canUndo: boolean
  canRedo: boolean
  previewMode: boolean
  publishedSiteUrl: string | null
  publishing: boolean
  hasUnpublishedChanges: boolean
}>()

const emit = defineEmits<{
  'update:device': [device: 'desktop' | 'tablet' | 'mobile']
  'step-zoom': [dir: 1 | -1]
  'zoom-auto': []
  undo: []
  redo: []
  'toggle-preview': []
  'open-seo': []
  publish: []
}>()
</script>

<style scoped>
.toolbar-btn {
  @apply flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
