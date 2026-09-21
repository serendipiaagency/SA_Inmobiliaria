<template>
  <Teleport to="body">
    <div
      v-if="node && rect"
      data-sb-toolbar
      class="fixed z-[70] flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 text-[11px] shadow-lg"
      :style="{ left: `${rect.left}px`, top: `${rect.top}px` }"
      @mousedown.prevent
    >
      <span class="rounded bg-ink px-1.5 py-0.5 font-semibold text-white">{{ node.label }}</span>
      <span v-if="node.dynamic" class="px-1 text-stone-400" :title="`Contenido dinámico · ${node.dynamic}`">dinámico</span>
      <button v-if="canEdit" type="button" class="node-toolbar-btn" data-testid="node-toolbar-edit" @click="emit('edit')">Editar</button>
      <button v-if="canChangeImage" type="button" class="node-toolbar-btn" data-testid="node-toolbar-change-image" @click="emit('change-image')">Cambiar imagen</button>
      <button type="button" class="node-toolbar-btn" title="Seleccionar la sección" data-testid="node-toolbar-parent" @click="emit('select-parent')">↑ Sección</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { NODE_KINDS } from '~/utils/siteBuilder/nodes'
import type { SiteNodeRef } from '~/composables/useSiteEditor'

/**
 * Barra contextual del nodo seleccionado, dentro del lienzo. Se posiciona
 * con `position: fixed` sobre la esquina superior izquierda del elemento
 * real (o bajo él si no hay sitio arriba) y se recoloca al hacer scroll,
 * al redimensionar y cuando el propio elemento cambia de tamaño — nunca
 * altera el layout de la página, es una capa aparte (Teleport a body).
 */
const props = defineProps<{
  node: SiteNodeRef | null
  editing: boolean
}>()

const emit = defineEmits<{ edit: []; 'change-image': []; 'select-parent': [] }>()

const canEdit = computed(() => !!props.node && NODE_KINDS[props.node.kind].inline && !props.node.dynamic && !props.editing)
const canChangeImage = computed(() => !!props.node && props.node.kind === 'image' && !props.node.dynamic)

const rect = ref<{ left: number; top: number } | null>(null)
let observed: Element | null = null
let observer: ResizeObserver | null = null

function target(): Element | null {
  if (!props.node) return null
  return document.querySelector(`[data-sb-node="${props.node.blockId}:${props.node.field}"]`)
}

function reposition() {
  const el = target()
  if (!el) {
    rect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  const height = 30
  const top = r.top - height - 6 >= 4 ? r.top - height - 6 : Math.min(r.bottom + 6, window.innerHeight - height - 4)
  rect.value = { left: Math.max(4, Math.min(r.left, window.innerWidth - 240)), top }
}

function observe() {
  observer?.disconnect()
  observed = target()
  if (observed && 'ResizeObserver' in window) {
    observer = new ResizeObserver(reposition)
    observer.observe(observed)
  }
}

watch(
  () => [props.node?.blockId, props.node?.field, props.editing],
  async () => {
    await nextTick()
    observe()
    reposition()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
})
onUnmounted(() => {
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
  observer?.disconnect()
})
</script>

<style scoped>
.node-toolbar-btn {
  @apply rounded px-1.5 py-0.5 font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-ink;
}
</style>
