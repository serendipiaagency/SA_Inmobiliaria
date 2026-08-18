<template>
  <SiteBlockRenderer
    :blocks="blocks"
    :home-data="homeData"
    :mode="mode"
    :device="device"
    :selected-block-id="selectedBlockId"
    @select="onSelect"
    @hover="onHover"
  />
</template>

<script setup lang="ts">
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'
import type { SiteBlock } from '~/server/utils/sitePages'

/**
 * Loaded inside the builder shell's <iframe>, sized to the exact target
 * breakpoint width by the parent — a real viewport, not a CSS-scaled
 * desktop view, so Tailwind's responsive classes evaluate for real. The
 * parent (pages/admin/site-builder/index.vue) owns the `blocks` array;
 * this page only ever reflects what it's told via postMessage and reports
 * selection/hover back up. Builder-only chrome (this whole route) never
 * ships to the public site — SiteBlockRenderer's mode="builder" outline is
 * the only visual difference from production, and only inside this iframe.
 */
definePageMeta({ layout: false, middleware: 'admin' })

const blocks = ref<SiteBlock[]>([])
const homeData = ref<{ projects: any[]; communities: any[]; blogs: any[] } | null>(null)
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const selectedBlockId = ref<string | null>(null)
const mode = ref<'builder' | 'preview'>('builder')

function onSelect(id: string) {
  window.parent.postMessage({ source: 'sa-builder-canvas', type: 'select', id }, window.location.origin)
}
function onHover(id: string | null) {
  window.parent.postMessage({ source: 'sa-builder-canvas', type: 'hover', id }, window.location.origin)
}

function handleMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return
  const msg = e.data
  if (!msg || msg.source !== 'sa-builder-shell') return
  if (msg.type === 'set-state') {
    blocks.value = msg.blocks || []
    device.value = msg.device || 'desktop'
    selectedBlockId.value = msg.selectedBlockId ?? null
    mode.value = msg.mode === 'preview' ? 'preview' : 'builder'
  }
}

onMounted(async () => {
  window.addEventListener('message', handleMessage)
  try {
    homeData.value = await $fetch<{ projects: any[]; communities: any[]; blogs: any[] }>('/api/admin/site-pages/preview-data')
  } catch {
    homeData.value = { projects: [], communities: [], blogs: [] }
  }
  window.parent.postMessage({ source: 'sa-builder-canvas', type: 'ready' }, window.location.origin)
})
onUnmounted(() => window.removeEventListener('message', handleMessage))
</script>
