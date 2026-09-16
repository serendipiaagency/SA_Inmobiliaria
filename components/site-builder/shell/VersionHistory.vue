<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" @click.self="emit('close')">
    <div data-testid="version-history" class="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
      <div class="flex shrink-0 items-start justify-between border-b border-line p-6 pb-4">
        <div>
          <p class="text-lg font-serif">Historial de versiones</p>
          <p class="mt-0.5 text-[12px] text-stone-500">
            Cada publicación deja una copia. Restaurar una la devuelve al borrador para que la revises: la web pública no
            cambia hasta que pulses «Publicar cambios».
          </p>
        </div>
        <button type="button" aria-label="Cerrar historial" class="shrink-0 text-stone-300 hover:text-ink" @click="emit('close')">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <p v-if="loading" class="py-8 text-center text-sm text-stone-400">Cargando…</p>
        <p v-else-if="error" class="py-8 text-center text-sm text-red-500">No se pudo cargar el historial.</p>
        <p v-else-if="!versions.length" class="py-8 text-center text-sm text-stone-400">
          Todavía no has publicado esta página. La primera publicación creará la versión 1.
        </p>

        <ul v-else class="space-y-1.5">
          <li
            v-for="v in versions"
            :key="v.version"
            class="flex items-center gap-3 rounded-lg border px-3 py-2.5"
            :class="v.isCurrent ? 'border-ink bg-paper' : 'border-line'"
          >
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 text-[13px] font-semibold text-ink">
                Versión {{ v.version }}
                <span v-if="v.isCurrent" class="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  En la web
                </span>
              </p>
              <p class="truncate text-[12px] text-stone-500">
                {{ formatWhen(v.createdAt) }}<template v-if="v.publishedByName"> · {{ v.publishedByName }}</template>
              </p>
              <p class="truncate text-[11px] text-stone-400">
                {{ v.blockCount }} {{ v.blockCount === 1 ? 'sección' : 'secciones' }}<template v-if="v.seoTitle"> · {{ v.seoTitle }}</template>
              </p>
            </div>
            <button
              type="button"
              class="btn-quiet shrink-0 !px-3 !py-1.5 !text-[12px]"
              :disabled="restoring !== null"
              :data-testid="`restore-v${v.version}`"
              @click="restore(v)"
            >
              {{ restoring === v.version ? 'Restaurando…' : 'Restaurar' }}
            </button>
          </li>
        </ul>

        <p v-if="versions.length >= limit" class="mt-3 px-1 text-[11px] text-stone-400">
          Se muestran las {{ limit }} publicaciones más recientes.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock, SitePageSeo, SitePageVersionSummary } from '~/server/utils/sitePages'

const props = defineProps<{ pageKey: string }>()
const emit = defineEmits<{
  close: []
  restored: [payload: { version: number; blocks: SiteBlock[]; seo: SitePageSeo }]
}>()

const toast = useToast()
const { confirm } = useConfirm()

const versions = ref<SitePageVersionSummary[]>([])
const limit = ref(50)
const loading = ref(true)
const error = ref(false)
const restoring = ref<number | null>(null)

onMounted(async () => {
  try {
    const data = await $fetch<{ versions: SitePageVersionSummary[]; limit: number }>(
      `/api/admin/site-pages/${props.pageKey}/versions`,
    )
    versions.value = data.versions
    limit.value = data.limit
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

/**
 * Timestamps are stored as "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker,
 * which `new Date()` would read as local time and show shifted by the
 * offset. Same fix as server/utils/email/health.ts: make the zone explicit.
 */
function formatWhen(raw: string): string {
  const d = new Date(`${String(raw).replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function restore(v: SitePageVersionSummary) {
  const ok = await confirm(
    `El borrador actual se sustituirá por la versión ${v.version}. Los cambios que no hayas publicado se perderán (puedes deshacerlo con Ctrl+Z). La web pública no cambia hasta que publiques.`,
    { title: `¿Restaurar la versión ${v.version}?`, confirmLabel: 'Restaurar al borrador' },
  )
  if (!ok) return

  restoring.value = v.version
  try {
    const res = await $fetch<{ ok: true; version: number; blocks: SiteBlock[]; seo: SitePageSeo }>(
      `/api/admin/site-pages/${props.pageKey}/restore`,
      { method: 'POST', body: { version: v.version } },
    )
    emit('restored', { version: res.version, blocks: res.blocks, seo: res.seo })
    toast.success(`Versión ${res.version} restaurada en el borrador. Revísala y publica cuando esté lista.`)
    emit('close')
  } catch {
    toast.error('No se pudo restaurar esa versión')
  } finally {
    restoring.value = null
  }
}
</script>
