<template>
  <div ref="wrapper" v-bind="wrapperAttrs">
    <!-- z-50: por encima de la cabecera fija del sitio (z-40), que en el
         lienzo se superpone al primer bloque igual que en la portada real. -->
    <span
      v-if="mode === 'builder'"
      class="pointer-events-none absolute left-2 top-2 z-50 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow transition-opacity"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
    >
      {{ index + 1 }}. {{ blockLabel(block.type) }}
    </span>

    <div
      v-if="mode === 'builder' && selected"
      data-block-toolbar
      class="absolute right-2 top-2 z-50 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-lg"
    >
      <button type="button" class="canvas-toolbar-btn" title="Subir" :disabled="index === 0" @click="emit('move-up', block.id)">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
      <button type="button" class="canvas-toolbar-btn" title="Bajar" :disabled="index === count - 1" @click="emit('move-down', block.id)">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12l7 7 7-7" /></svg>
      </button>
      <span class="mx-0.5 h-4 w-px bg-line" />
      <button type="button" class="canvas-toolbar-btn" title="Añadir debajo" @click="emit('add-below', block.id)">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
      </button>
      <button type="button" class="canvas-toolbar-btn" title="Duplicar" @click="emit('duplicate', block.id)">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      <button type="button" class="canvas-toolbar-btn" :title="hiddenOnDevice ? 'Mostrar' : 'Ocultar en este dispositivo'" @click="emit('toggle-hide', block.id)">
        <svg v-if="hiddenOnDevice" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
        <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
      <span class="mx-0.5 h-4 w-px bg-line" />
      <button type="button" class="canvas-toolbar-btn hover:!bg-red-50 hover:!text-red-600" title="Eliminar" @click="emit('delete', block.id)">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>
      </button>
    </div>

    <slot />
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import { blockLabel } from '~/composables/useSiteBuilderRegistry'
import { NODE_KINDS, nodeId } from '~/utils/siteBuilder/nodes'
import { SITE_BLOCK_KEY, SITE_EDITOR_KEY, nodeRefFromElement, type SiteNodeRef } from '~/composables/useSiteEditor'

/**
 * El marco de un bloque: el `<div>` envolvente que existía en
 * SiteBlockRenderer, ahora como componente propio para poder proveer a sus
 * nodos el id del bloque al que pertenecen (SITE_BLOCK_KEY).
 *
 * Aplica en los tres modos las opciones comunes de "Avanzado" (ancla,
 * fondo, espaciado) — estilo publicado real — y sólo en `builder` la
 * selección: un clic en cualquier punto del bloque se intercepta en fase de
 * captura (antes de que llegue al enlace, botón o tarjeta real) y selecciona
 * el **nodo más interno** bajo el puntero, o el bloque si no hay ninguno.
 * Así el título de una tarjeta se selecciona pulsando el título, la tarjeta
 * pulsando su espacio, y la sección pulsando el fondo — sin que ningún
 * bloque necesite su propio parche de clic.
 *
 * Doble clic: texto estático → edición inline; imagen estática → cambiar.
 */
const props = defineProps<{
  block: SiteBlock
  index: number
  count: number
  mode: 'production' | 'builder' | 'preview'
  device: 'desktop' | 'tablet' | 'mobile'
  selected: boolean
}>()

const emit = defineEmits<{
  hover: [id: string | null]
  'move-up': [id: string]
  'move-down': [id: string]
  'add-below': [id: string]
  duplicate: [id: string]
  'toggle-hide': [id: string]
  delete: [id: string]
}>()

const editor = inject(SITE_EDITOR_KEY, null)
const wrapper = ref<HTMLElement | null>(null)

provide(SITE_BLOCK_KEY, {
  get id() {
    return props.block.id
  },
  get type() {
    return props.block.type
  },
})

const hiddenOnDevice = computed(() => props.block.visibility?.[props.device] === false)

const BACKGROUND_CLASS: Record<string, string> = { paper: 'bg-paper', white: 'bg-white', surface: 'bg-surface', ink: 'bg-ink' }
const SPACING_REM: Record<string, string> = { sm: '1.5rem', lg: '3rem' }

/** El nodo bajo `target` que pertenece a ESTE bloque, o null. */
function nodeUnder(target: HTMLElement | null): { el: Element; node: SiteNodeRef } | null {
  const el = target?.closest?.('[data-sb-node]')
  if (!el || !wrapper.value?.contains(el)) return null
  const node = nodeRefFromElement(el)
  return node && node.blockId === props.block.id ? { el, node } : null
}

function onClickCapture(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest?.('[data-block-toolbar]')) return
  if (!editor) return

  // Mientras se edita un texto, los clics dentro de él sólo mueven el
  // cursor: se corta la navegación (es un <a> o un <button> real) pero no
  // se vuelve a seleccionar nada.
  const editingField = editor.editingNodeField.value
  if (editingField && editor.selectedBlockId.value === props.block.id) {
    if (target?.closest?.(`[data-sb-node="${nodeId(props.block.id, editingField)}"]`)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    editor.stopEdit()
  }

  e.preventDefault()
  e.stopPropagation()
  editor.select(props.block.id, nodeUnder(target)?.node ?? null)
}

function onDblclickCapture(e: MouseEvent) {
  if (!editor) return
  const target = e.target as HTMLElement | null
  if (target?.closest?.('[data-block-toolbar]')) return
  e.preventDefault()
  e.stopPropagation()
  const hit = nodeUnder(target)
  if (!hit) return
  const { node } = hit
  if (editor.editingNodeField.value === node.field && editor.selectedBlockId.value === node.blockId) return
  editor.select(props.block.id, node)
  if (node.kind === 'image') {
    if (!node.dynamic) editor.nodeAction(node, 'change-image')
    return
  }
  if (NODE_KINDS[node.kind].inline && !node.dynamic) editor.startEdit(node)
}

const wrapperAttrs = computed(() => {
  const style = props.block.style || {}
  const common: Record<string, any> = {}
  if (style.anchorId) common.id = style.anchorId
  const classes = ['relative', style.background ? BACKGROUND_CLASS[style.background] : '']
  const inlineStyle: Record<string, string> = {}
  if (style.paddingTop && SPACING_REM[style.paddingTop]) inlineStyle.paddingTop = SPACING_REM[style.paddingTop]
  if (style.paddingBottom && SPACING_REM[style.paddingBottom]) inlineStyle.paddingBottom = SPACING_REM[style.paddingBottom]
  if (Object.keys(inlineStyle).length) common.style = inlineStyle

  if (props.mode !== 'builder') return { ...common, class: classes }

  return {
    ...common,
    'data-site-block-id': props.block.id,
    'data-site-block-type': props.block.type,
    class: [
      ...classes,
      'group site-block-wrap outline-offset-[-2px] transition-[outline-color]',
      props.selected ? 'outline outline-2 outline-blue-500' : 'outline outline-2 outline-transparent hover:outline-blue-300',
      hiddenOnDevice.value ? 'opacity-40' : '',
    ],
    onClickCapture,
    onDblclickCapture,
    onMouseenter: () => emit('hover', props.block.id),
    onMouseleave: () => emit('hover', null),
  }
})
</script>

<style scoped>
.canvas-toolbar-btn {
  @apply flex h-6 w-6 items-center justify-center rounded text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
