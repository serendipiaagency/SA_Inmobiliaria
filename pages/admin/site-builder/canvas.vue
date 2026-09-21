<template>
  <div class="flex min-h-screen flex-col bg-paper text-ink">
    <!-- Mismo envoltorio que layouts/root.vue para la web publicada: cabecera,
         página y pie, con el mismo fondo — lo que se ve editando es la página
         real, no una versión sin cabecera. -->
    <SiteGlobalZone zone="header" :mode="mode" :selected="selectedGlobal === 'header'" @select="onSelectGlobal">
      <SiteHeader :tenant-override="tenantOverride" />
    </SiteGlobalZone>
    <main class="flex-1">
      <SiteBlockRenderer
        ref="renderer"
        :blocks="blocks"
        :styles="styles"
        :home-data="homeData"
        :mode="mode"
        :device="device"
        :selected-block-id="selectedBlockId"
        :selected-node-field="selectedNodeField"
        @select="onSelect"
        @hover="onHover"
        @edit-start="(node) => post('edit-start', { id: node.blockId, field: node.field })"
        @edit-node="(node, text) => post('edit-node', { id: node.blockId, field: node.field, text })"
        @node-action="(node, action) => post('node-action', { id: node.blockId, field: node.field, action, node })"
        @insert-at="(index) => post('insert-at', { index })"
        @move-up="(id) => post('move-up', { id })"
        @move-down="(id) => post('move-down', { id })"
        @add-below="(id) => post('add-below', { id })"
        @duplicate="(id) => post('duplicate', { id })"
        @toggle-hide="(id) => post('toggle-hide', { id })"
        @delete="(id) => post('delete', { id })"
      />
    </main>
    <SiteGlobalZone zone="footer" :mode="mode" :selected="selectedGlobal === 'footer'" @select="onSelectGlobal">
      <SiteFooter :tenant-override="tenantOverride" />
    </SiteGlobalZone>
  </div>
</template>

<script setup lang="ts">
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'
import SiteGlobalZone from '~/components/site-builder/SiteGlobalZone.vue'
import type { SiteBlock, SitePageDocument } from '~/server/utils/sitePages'
import type { TenantBranding } from '~/composables/useTenant'
import type { SiteNodeRef } from '~/composables/useSiteEditor'

/**
 * Loaded inside the builder shell's <iframe>, sized to the exact target
 * breakpoint width by the parent — a real viewport, not a CSS-scaled
 * desktop view, so Tailwind's responsive classes evaluate for real. The
 * parent (pages/admin/site-builder/index.vue) owns the `blocks` array;
 * this page only ever reflects what it's told via postMessage and reports
 * selection/hover/edits back up. Builder-only chrome (this whole route)
 * never ships to the public site — SiteBlockRenderer's mode="builder"
 * outlines are the only visual difference from production, and only
 * inside this iframe.
 *
 * `transparentHero` como en la portada pública: la cabecera empieza
 * transparente sobre el hero y se vuelve sólida al hacer scroll, igual que
 * en producción.
 */
definePageMeta({ layout: false, middleware: 'admin', transparentHero: true })

const renderer = ref<InstanceType<typeof SiteBlockRenderer> | null>(null)
const blocks = ref<SiteBlock[]>([])
const styles = ref<SitePageDocument['styles'] | null>(null)
const homeData = ref<{ projects: any[]; communities: any[]; blogs: any[]; team: any[] } | null>(null)
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const selectedBlockId = ref<string | null>(null)
const selectedNodeField = ref<string | null>(null)
const selectedGlobal = ref<'header' | 'footer' | null>(null)
const mode = ref<'builder' | 'preview'>('builder')

// La marca de la organización que se está editando (no la del host del
// panel): es lo que la cabecera y el pie enseñan en la web publicada.
const tenantOverride = ref<TenantBranding | null>(null)

function post(type: string, payload: Record<string, any> = {}) {
  window.parent.postMessage({ source: 'sa-builder-canvas', type, ...payload }, window.location.origin)
}
function onSelect(id: string | null, node: SiteNodeRef | null) {
  post('select', { id, node })
}
function onHover(id: string | null) {
  post('hover', { id })
}
function onSelectGlobal(zone: 'header' | 'footer', element: string | null) {
  post('select-global', { zone, element })
}

/**
 * Aplica el estado que manda el shell conservando la identidad de los
 * bloques que no han cambiado: el shell manda siempre la página entera (y
 * mientras se escribe inline lo hace en cada tecla), pero un bloque cuyo
 * JSON es idéntico al que ya hay se queda con su mismo objeto, así que Vue
 * no vuelve a pintar sus componentes. Sólo el bloque tocado se actualiza.
 */
const blockJson = new Map<string, string>()
function applyBlocks(incoming: SiteBlock[]) {
  const current = new Map(blocks.value.map((b) => [b.id, b]))
  const seen = new Set<string>()
  const next = incoming.map((b) => {
    seen.add(b.id)
    const json = JSON.stringify(b)
    const prev = current.get(b.id)
    if (prev && blockJson.get(b.id) === json) return prev
    blockJson.set(b.id, json)
    return b
  })
  for (const id of blockJson.keys()) if (!seen.has(id)) blockJson.delete(id)
  blocks.value = next
}

function handleMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return
  const msg = e.data
  if (!msg || msg.source !== 'sa-builder-shell') return
  if (msg.type === 'set-state') {
    applyBlocks(msg.blocks || [])
    styles.value = msg.styles && Object.keys(msg.styles).length ? msg.styles : null
    device.value = msg.device || 'desktop'
    selectedBlockId.value = msg.selectedBlockId ?? null
    selectedNodeField.value = msg.selectedNodeField ?? null
    selectedGlobal.value = msg.selectedGlobal ?? null
    mode.value = msg.mode === 'preview' ? 'preview' : 'builder'
  } else if (msg.type === 'scroll-to') {
    // Tras insertar un bloque o elegirlo en Estructura: se lleva a la vista
    // con el DOM ya actualizado, no con el estado de antes.
    nextTick(() => {
      const el = msg.field ? document.querySelector(`[data-sb-node="${msg.id}:${msg.field}"]`) : document.querySelector(`[data-site-block-id="${msg.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: msg.field ? 'center' : 'start' })
    })
  }
}

// Atajos con el foco dentro del lienzo. Los textos en edición inline se
// quedan con sus teclas (useInlineText corta la propagación), así que aquí
// nunca llega un Supr o un Enter escrito dentro de un título.
function isEditableTarget(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement)?.isContentEditable === true
}
function onKeydown(e: KeyboardEvent) {
  if (mode.value !== 'builder' || isEditableTarget(e.target)) return
  const meta = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (meta && key === 'z') {
    e.preventDefault()
    post('command', { name: e.shiftKey ? 'redo' : 'undo' })
  } else if (meta && key === 'y') {
    e.preventDefault()
    post('command', { name: 'redo' })
  } else if (meta && key === 'd') {
    e.preventDefault()
    if (selectedBlockId.value) post('command', { name: 'duplicate' })
  } else if (e.key === 'Escape') {
    // Esc sube de nivel: elemento → sección → nada. (Salir de la edición
    // inline lo hace el propio texto, antes de que la tecla llegue aquí.)
    if (selectedNodeField.value) post('select', { id: selectedBlockId.value, node: null })
    else if (selectedBlockId.value) post('select', { id: null, node: null })
    else if (selectedGlobal.value) post('select', { id: null, node: null })
  } else if (e.key === 'Enter' && selectedNodeField.value) {
    e.preventDefault()
    renderer.value?.startEditSelected()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId.value && !selectedNodeField.value) {
    e.preventDefault()
    post('command', { name: 'delete' })
  }
}

onMounted(async () => {
  window.addEventListener('message', handleMessage)
  window.addEventListener('keydown', onKeydown)
  const [data, org] = await Promise.all([
    $fetch<{ projects: any[]; communities: any[]; blogs: any[]; team: any[] }>('/api/admin/site-pages/preview-data').catch(() => ({ projects: [], communities: [], blogs: [], team: [] })),
    $fetch<any>('/api/admin/active-org-info').catch(() => null),
  ])
  homeData.value = data
  if (org) {
    tenantOverride.value = {
      id: org.id,
      name: org.name,
      companyName: org.companyName,
      logo: org.logo,
      brandColor: org.brandColor,
      isCustomDomain: true,
      legalCompanyName: null,
      taxId: null,
      legalAddress: null,
      legalEmail: null,
      legalPhone: null,
    }
  }
  window.parent.postMessage({ source: 'sa-builder-canvas', type: 'ready' }, window.location.origin)
})
onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
  window.removeEventListener('keydown', onKeydown)
})
</script>
