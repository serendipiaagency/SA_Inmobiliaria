<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Papelera</h1>
      <p class="mt-1 text-sm text-stone-500">Elementos eliminados — restáuralos o bórralos definitivamente.</p>
    </div>

    <div class="mb-4 flex gap-2 border-b border-line">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="border-b-2 px-3 py-2 text-sm font-medium"
        :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-450'"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Articles -->
    <div v-if="tab === 'articles'" class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th class="px-4 py-3">Título</th><th class="px-4 py-3">Última edición</th><th class="px-4 py-3 text-right">Acciones</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in articles?.rows || []" :key="a.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-medium">{{ a.title }}</td>
            <td class="px-4 py-3 text-stone-450">{{ new Date(a.updatedAt).toLocaleDateString('es-ES') }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <button class="mr-3 font-medium text-emerald-700 hover:underline" @click="restoreArticle(a.id)">Restaurar</button>
              <button class="font-medium text-red-600 hover:underline" @click="destroyArticle(a.id)">Eliminar definitivamente</button>
            </td>
          </tr>
          <tr v-if="!articles?.rows?.length"><td colspan="3" class="px-4 py-14 text-center text-sm text-slate-500">Sin artículos en la papelera</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Generic soft-delete resources: categories, tags, authors, media -->
    <div v-else-if="tab !== 'comments'" class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th class="px-4 py-3">Nombre</th><th class="px-4 py-3 text-right">Acciones</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in genericRows" :key="row.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-medium">{{ row.name || row.filename || row.title }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <button class="mr-3 font-medium text-emerald-700 hover:underline" @click="restoreGeneric(row.id)">Restaurar</button>
              <button class="font-medium text-red-600 hover:underline" @click="destroyGeneric(row.id)">Eliminar definitivamente</button>
            </td>
          </tr>
          <tr v-if="!genericRows.length"><td colspan="2" class="px-4 py-14 text-center text-sm text-slate-500">Vacío</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Comments: soft-delete is status='trash' (moderation-controlled), not a deleted_at column -->
    <div v-else class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th class="px-4 py-3">Autor</th><th class="px-4 py-3">Comentario</th><th class="px-4 py-3 text-right">Acciones</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in comments?.rows || []" :key="c.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-medium">{{ c.authorName }}</td>
            <td class="max-w-sm truncate px-4 py-3 text-stone-500">{{ c.content }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <button class="mr-3 font-medium text-emerald-700 hover:underline" @click="restoreComment(c.id)">Restaurar</button>
              <button class="font-medium text-red-600 hover:underline" @click="destroyComment(c.id)">Eliminar definitivamente</button>
            </td>
          </tr>
          <tr v-if="!comments?.rows?.length"><td colspan="3" class="px-4 py-14 text-center text-sm text-slate-500">Sin comentarios en la papelera</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Papelera — Blog & CMS' })

const TABS = [
  { key: 'articles', label: 'Artículos' },
  { key: 'cms-categories', label: 'Categorías' },
  { key: 'cms-tags', label: 'Etiquetas' },
  { key: 'cms-authors', label: 'Autores' },
  { key: 'cms/media', label: 'Media' },
  { key: 'comments', label: 'Comentarios' },
]
const tab = ref('articles')

const toast = useToast()
const { confirm } = useConfirm()

const { data: articles, refresh: refreshArticles } = await useFetch<any>('/api/admin/cms/articles', { query: { trashed: 1, perPage: 100 } })
const { data: comments, refresh: refreshComments } = await useFetch<any>('/api/admin/cms-comments', { query: { status: 'trash', perPage: 100 } })

const { data: genericData, refresh: refreshGeneric } = await useFetch<any>(
  () => (tab.value !== 'articles' && tab.value !== 'comments' ? `/api/admin/${tab.value}` : null),
  { query: computed(() => ({ trashed: 1, perPage: 100 })), watch: [tab] },
)
const genericRows = computed(() => genericData.value?.rows || [])

async function restoreArticle(id: number) {
  await $fetch(`/api/admin/cms/articles/${id}/restore`, { method: 'POST' })
  toast.success('Restaurado')
  await refreshArticles()
}
async function destroyArticle(id: number) {
  const ok = await confirm('Esta acción es permanente.', { title: '¿Eliminar definitivamente?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms/articles/${id}?hard=1`, { method: 'DELETE' })
  toast.success('Eliminado definitivamente')
  await refreshArticles()
}

async function restoreGeneric(id: number) {
  const resource = tab.value === 'cms/media' ? 'cms/media' : tab.value
  await $fetch(`/api/admin/${resource}/${id}/restore`, { method: 'POST' })
  toast.success('Restaurado')
  await refreshGeneric()
}
async function destroyGeneric(id: number) {
  const ok = await confirm('Esta acción es permanente.', { title: '¿Eliminar definitivamente?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  const resource = tab.value === 'cms/media' ? 'cms/media' : tab.value
  await $fetch(`/api/admin/${resource}/${id}?hard=1`, { method: 'DELETE' })
  toast.success('Eliminado definitivamente')
  await refreshGeneric()
}

async function restoreComment(id: number) {
  await $fetch(`/api/admin/cms-comments/${id}`, { method: 'PUT', body: { status: 'pending' } })
  toast.success('Restaurado como pendiente de moderación')
  await refreshComments()
}
async function destroyComment(id: number) {
  const ok = await confirm('Esta acción es permanente.', { title: '¿Eliminar definitivamente?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms-comments/${id}`, { method: 'DELETE' })
  toast.success('Eliminado definitivamente')
  await refreshComments()
}
</script>
