<template>
  <div class="max-w-5xl" data-testid="poster-templates">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Plantillas de cartel</h1>
        <p class="mt-1 max-w-2xl text-sm text-stone-500">
          Diseños de cartel de escaparate y folleto para tus propiedades. Las plantillas de muestra se pueden duplicar para adaptarlas; luego, en «Carteles», eliges una propiedad y exportas el PDF.
        </p>
      </div>
      <button type="button" class="dash-btn-primary" data-testid="poster-template-new" @click="openCreate">Nueva plantilla</button>
    </div>

    <AdminPanel>
      <div v-if="pending && !data" class="py-10 text-center text-sm text-stone-400">Cargando…</div>
      <div v-else-if="!templates.length" class="py-10 text-center text-sm text-stone-500" data-testid="poster-templates-empty">
        Aún no hay plantillas. Crea la primera con «Nueva plantilla».
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-500">
              <th class="py-2 pr-3 font-semibold">Nombre</th>
              <th class="py-2 pr-3 font-semibold">Formato</th>
              <th class="py-2 pr-3 font-semibold">Origen</th>
              <th class="py-2 pr-3 font-semibold">Estado</th>
              <th class="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id" class="border-b border-line last:border-0" :data-testid="`poster-template-${t.id}`">
              <td class="py-2.5 pr-3 font-medium">{{ t.name }}</td>
              <td class="py-2.5 pr-3 text-stone-500">{{ formatLabel(t.formatKey) }}</td>
              <td class="py-2.5 pr-3">
                <span v-if="t.isSystem" class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">Muestra</span>
                <span v-else class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Propia</span>
              </td>
              <td class="py-2.5 pr-3 text-stone-500">{{ t.status === 'published' ? 'Publicada' : 'Borrador' }}</td>
              <td class="py-2.5 text-right">
                <button type="button" class="text-xs font-medium text-ink hover:underline" @click="duplicate(t)">Duplicar</button>
                <template v-if="!t.isSystem">
                  <button type="button" class="ml-3 text-xs font-medium text-ink hover:underline" @click="togglePublish(t)">{{ t.status === 'published' ? 'Pasar a borrador' : 'Publicar' }}</button>
                  <button type="button" class="ml-3 text-xs font-medium text-rose-600 hover:underline" @click="remove(t)">Eliminar</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <AdminCommsModal v-if="creating" title="Nueva plantilla de cartel" test-id="poster-template-modal" @close="creating = false">
      <div class="space-y-4">
        <div>
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre</span>
          <input v-model="createForm.name" type="text" class="cfg-input" placeholder="Cartel de venta A3" data-testid="poster-template-name" >
        </div>
        <div>
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Formato</span>
          <select v-model="createForm.formatKey" class="cfg-input" data-testid="poster-template-format">
            <option v-for="f in formats" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
        </div>
        <p class="text-xs text-stone-400">Se crea con un diseño de partida (foto, título, precio, ubicación, referencia y QR) que podrás ajustar.</p>
      </div>
      <template #footer>
        <button type="button" class="dash-btn-secondary" @click="creating = false">Cancelar</button>
        <button type="button" class="dash-btn-primary" :disabled="saving" data-testid="poster-template-create" @click="create">{{ saving ? 'Creando…' : 'Crear plantilla' }}</button>
      </template>
    </AdminCommsModal>
  </div>
</template>

<script setup lang="ts">
/**
 * Carteles de escaparate → Plantillas (Cola 20). Lista las plantillas de
 * muestra (de sistema, sólo lectura) y las propias; permite crear una propia
 * con un diseño de partida, duplicar cualquiera, publicarla y borrarla. El
 * diseño visual de la plantilla se edita en un paso posterior; aquí se
 * gestiona el catálogo. Permiso: Portal Web.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Plantillas de cartel' })

interface PosterTemplate { id: number; name: string; formatKey: string; isSystem: boolean; status: string }
interface FormatOpt { key: string; label: string; orientation: string }

const toast = useToast()
const { confirm } = useConfirm()

const { data, pending, refresh } = await useFetch<{ items: PosterTemplate[]; formats: FormatOpt[] }>('/api/admin/carteles/templates')
const templates = computed(() => data.value?.items || [])
const formats = computed(() => data.value?.formats || [])
const formatLabel = (key: string) => formats.value.find((f) => f.key === key)?.label || key

const creating = ref(false)
const saving = ref(false)
const createForm = reactive({ name: '', formatKey: 'print_a3_portrait' })
function openCreate() {
  createForm.name = ''
  createForm.formatKey = formats.value[0]?.key || 'print_a3_portrait'
  creating.value = true
}
async function create() {
  saving.value = true
  try {
    await $fetch('/api/admin/carteles/templates', { method: 'POST', body: { name: createForm.name, formatKey: createForm.formatKey } })
    toast.success('Plantilla creada')
    creating.value = false
    await refresh()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || err?.statusMessage || 'No se pudo crear')
  } finally {
    saving.value = false
  }
}

async function duplicate(t: PosterTemplate) {
  try {
    await $fetch(`/api/admin/carteles/templates/${t.id}/duplicate`, { method: 'POST' })
    toast.success('Plantilla duplicada')
    await refresh()
  } catch {
    toast.error('No se pudo duplicar')
  }
}
async function togglePublish(t: PosterTemplate) {
  const status = t.status === 'published' ? 'draft' : 'published'
  try {
    await $fetch(`/api/admin/carteles/templates/${t.id}`, { method: 'PATCH', body: { status } })
    await refresh()
  } catch {
    toast.error('No se pudo cambiar el estado')
  }
}
async function remove(t: PosterTemplate) {
  if (!(await confirm(`Se borrará la plantilla «${t.name}».`, { title: '¿Eliminar plantilla?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/carteles/templates/${t.id}`, { method: 'DELETE' })
    toast.success('Plantilla eliminada')
    await refresh()
  } catch {
    toast.error('No se pudo eliminar')
  }
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink;
}
</style>
