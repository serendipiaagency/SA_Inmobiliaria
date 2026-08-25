<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir redes sociales.</p>
    <template v-else>
      <p v-if="!rows.length && !picking" class="rounded-lg border border-dashed border-line bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">
        Sin redes sociales todavía.
      </p>

      <div class="space-y-2">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="flex items-center gap-3 rounded-lg border bg-white p-3 transition"
          :class="dragOverIndex === i ? 'border-ink ring-2 ring-ink/30' : 'border-line'"
          draggable="true"
          @dragstart="dragFrom = i"
          @dragover.prevent="dragOverIndex = i"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onDrop(i)"
        >
          <span class="shrink-0 cursor-grab text-stone-300 hover:text-stone-500" title="Arrastra para reordenar" aria-hidden="true">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
          </span>
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="SOCIAL_ICONS[row.platform] || SOCIAL_ICONS.instagram" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-ink">{{ PLATFORM_LABELS[row.platform] || row.platform }}</p>
            <input v-model="row.url" class="input mt-1 !py-1 !text-[12px]" placeholder="https://…" @change="saveUrl(row)" />
          </div>
          <button type="button" class="shrink-0 text-[12px] font-semibold text-red-600 hover:underline" @click="remove(row.id)">Eliminar</button>
        </div>
      </div>

      <div v-if="picking" class="mt-3 rounded-lg border border-line bg-stone-50 p-3">
        <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-500">Elige una plataforma</p>
        <div class="grid grid-cols-5 gap-2 sm:grid-cols-9">
          <button
            v-for="p in PLATFORMS"
            :key="p"
            type="button"
            class="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white text-stone-600 transition hover:border-ink hover:text-ink"
            :title="PLATFORM_LABELS[p]"
            @click="pickPlatform(p)"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="SOCIAL_ICONS[p]" />
          </button>
        </div>
        <div v-if="newPlatform" class="mt-3 flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-stone-600">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="SOCIAL_ICONS[newPlatform]" />
          </span>
          <input v-model="newUrl" type="url" class="input flex-1" placeholder="https://…" @keyup.enter="confirmAdd" />
          <button type="button" class="btn-primary !px-3 !py-1.5" :disabled="!newUrl" @click="confirmAdd">Añadir</button>
        </div>
        <button type="button" class="mt-2 text-[12px] font-medium text-stone-400 hover:text-ink" @click="cancelPick">Cancelar</button>
      </div>
      <button v-else type="button" class="btn-quiet mt-3" @click="picking = true">+ Añadir red social</button>

      <p v-if="error" class="mt-2 text-[11px] font-medium text-red-600">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ childResource: string; parentField: string; parentId: number | null }>()
const { confirm } = useConfirm()
const toast = useToast()

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'pinterest', 'whatsapp', 'telegram'] as const
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}
// Simple hand-drawn pictograms in the same 24x24 outline style as
// PropertyBuilder.vue's section-nav ICONS — mnemonics, not brand logo
// reproductions.
const SOCIAL_ICONS: Record<string, string> = {
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />',
  facebook: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.5 4h-2a3 3 0 0 0-3 3v3H8v3h2.5v7h3v-7H16l.5-3h-3V7a1 1 0 0 1 1-1h1.5V4z" />',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3" /><path stroke-linecap="round" stroke-linejoin="round" d="M7.3 10v7M7.3 7.3h.01M11.5 17v-4.2a2.3 2.3 0 0 1 4.5 0V17M11.5 12.8V17" />',
  tiktok: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 3v11.8a3.3 3.3 0 1 1-3.3-3.3c.4 0 .8.06 1.2.2" /><path stroke-linecap="round" stroke-linejoin="round" d="M14 3c.35 2.5 2.1 4.3 4.6 4.6" />',
  youtube: '<rect x="3" y="5" width="18" height="14" rx="4" /><path d="M10 9.3v5.4l4.8-2.7z" fill="currentColor" stroke="none" />',
  twitter: '<path stroke-linecap="round" stroke-linejoin="round" d="m5 4 14 16M19 4 5 20" />',
  pinterest: '<circle cx="12" cy="12" r="9" /><path stroke-linecap="round" stroke-linejoin="round" d="M9.3 20 12 9.5m0 0a3 3 0 1 1 3 3.7c-.5 0-1.6-.2-1.9-1.1" />',
  whatsapp: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 19 7.1 15.5A7 7 0 1 1 12 19c-1.1 0-2.2-.3-3.1-.8z" /><path stroke-linecap="round" stroke-linejoin="round" d="M9.6 9.8c.4-.1.7.4.9.9.2.4.4.9.1 1.2-.4.5.7 1.9 2 2.4.4.2.6-.5 1-.6.4-.1.9.1 1.3.4.3.3.2 1-.1 1.4-.5.6-1.3.8-2 .6-1.3-.4-3.2-1.7-4.1-3.3-.4-.7-.5-1.5-.1-2.1.2-.3.6-.8 1-.9z" />',
  telegram: '<path stroke-linecap="round" stroke-linejoin="round" d="m3.5 12.3 16-7.5-2.8 15.7-5.5-4.2-2.6 2.5v-3.7l9-7.8-11.2 6.4z" />',
}

const rows = ref<any[]>([])
const error = ref('')
const picking = ref(false)
const newPlatform = ref<string | null>(null)
const newUrl = ref('')

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows
    .filter((r) => r[props.parentField] === props.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
}

function pickPlatform(p: string) {
  newPlatform.value = p
}
function cancelPick() {
  picking.value = false
  newPlatform.value = null
  newUrl.value = ''
}

async function confirmAdd() {
  if (!newPlatform.value || !newUrl.value.trim() || !props.parentId) return
  error.value = ''
  try {
    await $fetch(`/api/admin/${props.childResource}`, {
      method: 'POST',
      body: { [props.parentField]: props.parentId, platform: newPlatform.value, url: newUrl.value.trim(), sortOrder: rows.value.length },
    })
    cancelPick()
    await load()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la red social'
  }
}

async function saveUrl(row: any) {
  try {
    await $fetch(`/api/admin/${props.childResource}/${row.id}`, { method: 'PUT', body: { url: row.url } })
  } catch {
    toast.error('No se pudo guardar la URL')
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta red social se eliminará.', { title: '¿Eliminar red social?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch {
    toast.error('No se pudo eliminar')
  }
}

const dragFrom = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

async function onDrop(to: number) {
  const from = dragFrom.value
  dragFrom.value = null
  dragOverIndex.value = null
  if (from === null || from === to) return

  const [moved] = rows.value.splice(from, 1)
  rows.value.splice(to, 0, moved)

  const updates = rows.value.map((r, i) => ({ r, sortOrder: i })).filter(({ r, sortOrder }) => r.sortOrder !== sortOrder)
  try {
    await Promise.all(
      updates.map(({ r, sortOrder }) => {
        r.sortOrder = sortOrder
        return $fetch(`/api/admin/${props.childResource}/${r.id}`, { method: 'PUT', body: { sortOrder } })
      }),
    )
  } catch {
    toast.error('No se pudo guardar el nuevo orden')
    await load()
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>
