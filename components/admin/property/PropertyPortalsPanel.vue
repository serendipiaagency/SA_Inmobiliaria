<template>
  <div data-testid="property-portals">
    <p v-if="!parentId" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
      Guarda la propiedad primero; después verás en qué canales está publicada.
    </p>
    <template v-else>
      <p class="mb-3 text-[13px] text-stone-500">
        Dónde está publicada esta propiedad y cómo está cada canal, con el último trabajo de la publicación multicanal. Programar, publicar o retirar se hace en
        <NuxtLink to="/admin/scheduler" class="font-medium text-ink underline">Publicación multicanal</NuxtLink>.
        Sólo se envían fotos y recursos publicables, no privados y no ocultos, y sólo los campos que el registro de esquemas permite a un portal.
      </p>
      <p v-if="pending && !summary" class="py-6 text-center text-sm text-stone-400">Cargando…</p>
      <p v-else-if="error" class="text-[13px] text-red-600">{{ error }}</p>
      <template v-else-if="summary">
        <!-- Web propia -->
        <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3" data-testid="property-portals-web">
          <div class="min-w-0 flex-1">
            <p class="text-[14px] font-medium text-ink">Web pública de la agencia</p>
            <p class="text-[12px] text-stone-500">{{ summary.channels.web.detail }}</p>
          </div>
          <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="TONES[summary.channels.web.state] || TONES.none">{{ summary.channels.web.label }}</span>
          <a v-if="summary.channels.web.url" :href="summary.channels.web.url" target="_blank" rel="noopener" class="text-[12px] font-semibold text-ink hover:underline">Ver ficha pública</a>
        </div>

        <p v-if="summary.channels.portalsNote" class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800" data-testid="property-portals-note">{{ summary.channels.portalsNote }}</p>

        <div v-if="summary.channels.portals.length" class="overflow-x-auto rounded-xl border border-line bg-white">
          <table class="w-full min-w-[640px] text-left text-[13px]">
            <thead class="border-b border-line text-[11px] uppercase tracking-wide text-stone-400">
              <tr>
                <th class="px-4 py-2 font-medium">Canal</th>
                <th class="px-4 py-2 font-medium">Estado</th>
                <th class="px-4 py-2 font-medium">Último trabajo</th>
                <th class="px-4 py-2 font-medium">Integración</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="p in orderedPortals" :key="p.key" :data-testid="`property-portal-${p.key}`">
                <td class="px-4 py-2.5">
                  <span class="font-medium text-ink">{{ p.label }}</span>
                  <span class="block text-[11px] text-stone-400">{{ TYPE_LABELS[p.type] || p.type }}<template v-if="!p.enabled"> · desactivado</template></span>
                </td>
                <td class="px-4 py-2.5"><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="TONES[p.state] || TONES.none">{{ p.stateLabel }}</span></td>
                <td class="px-4 py-2.5 text-[12px] text-stone-600">
                  <template v-if="p.lastJob">
                    {{ ACTION_LABELS[p.lastJob.action] || p.lastJob.action }} · {{ String(p.lastJob.runAt).slice(0, 16) }}
                    <a v-if="p.lastJob.externalUrl" :href="p.lastJob.externalUrl" target="_blank" rel="noopener" class="ml-1 font-semibold text-ink underline">Ver anuncio</a>
                    <span v-if="p.lastJob.lastError" class="block text-[11px] text-red-600">{{ p.lastJob.lastError }}</span>
                  </template>
                  <span v-else class="text-stone-400">—</span>
                </td>
                <td class="px-4 py-2.5 text-[12px]">
                  <span v-if="p.implemented" class="text-emerald-700">Real{{ p.connected ? ' · conectada' : ' · sin credencial' }}</span>
                  <span v-else class="text-stone-400">Sin integración todavía</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Paso «Portales» del editor (FASE 25, bloque N7a): en qué canales de
 * publicación está la propiedad y su estado real, sacado del sistema de
 * publicación multicanal (`publication_jobs`, el último trabajo por canal) y
 * de la web propia. No inventa integraciones: ningún portal tiene hoy un
 * adaptador real y el panel lo dice (docs/publication-channels.md).
 */
const props = defineProps<{ parentId: number | null; kind: 'agent' | 'developer'; active?: boolean }>()

const TONES: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-800',
  visible: 'bg-sky-50 text-sky-800',
  scheduled: 'bg-sky-50 text-sky-800',
  withdrawn: 'bg-stone-100 text-stone-600',
  failed: 'bg-red-50 text-red-700',
  blocked: 'bg-amber-50 text-amber-800',
  cancelled: 'bg-stone-100 text-stone-600',
  none: 'bg-stone-100 text-stone-500',
  removed: 'bg-red-50 text-red-700',
  not_applicable: 'bg-stone-100 text-stone-500',
}
const TYPE_LABELS: Record<string, string> = { marketplace: 'Marketplace', own_web: 'Web propia', portal: 'Portal', social: 'Red social', messaging: 'Mensajería' }
const ACTION_LABELS: Record<string, string> = { publish: 'Publicar', update_images: 'Actualizar fotos', update_text: 'Actualizar textos', unpublish: 'Retirar' }
const ORDER: Record<string, number> = { published: 0, scheduled: 1, failed: 2, blocked: 3, withdrawn: 4, cancelled: 5, none: 6 }

const summary = ref<any | null>(null)
const pending = ref(false)
const error = ref('')
const orderedPortals = computed(() => [...(summary.value?.channels?.portals || [])].sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9)))

async function load() {
  if (!props.parentId) return
  pending.value = true
  error.value = ''
  try {
    const resource = props.kind === 'developer' ? 'developer-properties' : 'properties'
    const res = await $fetch<{ summary: any }>(`/api/admin/${resource}/${props.parentId}`, { query: { view: 'summary' } })
    summary.value = res.summary
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar el estado de publicación'
  } finally {
    pending.value = false
  }
}

watch(
  () => [props.active, props.parentId] as const,
  ([active, id]) => {
    if (active && id) load()
  },
  { immediate: true },
)
</script>
