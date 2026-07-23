<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ isNew ? 'Nuevo artículo' : `Editar — ${form.title || ''}` }}</h1>
        <p v-if="!isNew" class="mt-1 text-xs text-stone-450">Cada guardado crea una versión en el historial.</p>
      </div>
      <div class="flex items-center gap-3">
        <a v-if="!isNew" :href="`/blog/preview/${idParam}`" target="_blank" class="btn-secondary">Vista previa</a>
        <NuxtLink to="/admin/cms/articles" class="btn-secondary">← Volver</NuxtLink>
        <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-3">
      <!-- Main column -->
      <div class="space-y-5 lg:col-span-2">
        <div class="card space-y-4 p-6">
          <div>
            <label class="label">Título *</label>
            <input v-model="form.title" class="input" placeholder="Título del artículo" />
          </div>
          <div>
            <label class="label">Slug</label>
            <input v-model="form.slug" class="input" placeholder="se-genera-automaticamente" />
          </div>
          <div>
            <label class="label">Extracto</label>
            <textarea v-model="form.excerpt" class="input" rows="2" placeholder="Resumen breve para listados y meta descripción" />
          </div>
          <div>
            <label class="label">Imagen de portada</label>
            <div v-if="form.coverImage" class="mb-2 flex items-center gap-3">
              <img :src="mediaUrl(form.coverImage)" class="h-16 w-24 rounded border border-slate-200 object-cover" />
              <button type="button" class="text-sm text-red-600 hover:underline" @click="form.coverImage = ''">Quitar</button>
            </div>
            <input type="file" accept="image/*" class="text-sm" @change="uploadCover" />
          </div>
        </div>

        <div class="card p-6">
          <div class="mb-3 flex items-center justify-between">
            <label class="label !mb-0">Contenido</label>
            <span class="text-[11px] text-stone-400">{{ wordCount }} palabras · ~{{ readingTime }} min de lectura</span>
          </div>
          <CmsBlockEditor v-model="blocks" />
        </div>

        <CmsSeoPanel v-model="seoForm" :plain-text="plainText" :article="article" />
      </div>

      <!-- Sidebar -->
      <div class="space-y-5">
        <div class="card space-y-4 p-5">
          <div>
            <label class="label">Estado</label>
            <select v-model="form.status" class="input">
              <option value="draft">Borrador</option>
              <option value="scheduled">Programado</option>
              <option value="published">Publicado</option>
            </select>
          </div>
          <div v-if="form.status === 'scheduled'">
            <label class="label">Fecha de publicación</label>
            <input v-model="form.scheduledAt" type="datetime-local" class="input" />
          </div>
          <div>
            <label class="label">Fecha de caducidad (opcional)</label>
            <input v-model="form.expiresAt" type="datetime-local" class="input" />
            <p class="mt-1 text-[11px] text-stone-450">Se oculta automáticamente pasada esta fecha.</p>
          </div>
          <div>
            <label class="label">Idioma</label>
            <select v-model="form.language" class="input">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label class="label">Categoría</label>
            <select v-model="form.categoryId" class="input">
              <option value="">Sin categoría</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Autor</label>
            <select v-model="form.authorId" class="input">
              <option value="">Sin autor</option>
              <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Etiquetas</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in tags"
                :key="t.id"
                type="button"
                class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition"
                :class="selectedTagIds.includes(t.id) ? 'border-ink bg-ink text-white' : 'border-line text-stone-500'"
                @click="toggleTag(t.id)"
              >
                {{ t.name }}
              </button>
              <p v-if="!tags.length" class="text-[11px] text-stone-450">Crea etiquetas en <NuxtLink to="/admin/cms-tags" class="underline">Etiquetas</NuxtLink>.</p>
            </div>
          </div>
        </div>

        <CmsAiPanel v-if="!isNew" :article-id="Number(idParam)" />

        <div v-if="!isNew" class="card p-5">
          <h3 class="mb-2 font-semibold">Historial de versiones</h3>
          <ul v-if="versions.length" class="max-h-64 space-y-2 overflow-y-auto text-sm">
            <li v-for="v in versions" :key="v.id" class="flex items-center justify-between border-b border-line pb-2 last:border-0">
              <span class="text-stone-500">{{ new Date(v.createdAt).toLocaleString('es-ES') }} · {{ v.editorName || '—' }}</span>
              <button class="text-[11px] font-medium text-emerald-700 hover:underline" @click="restoreVersion(v.id)">Restaurar</button>
            </li>
          </ul>
          <p v-else class="text-sm text-stone-450">Sin historial todavía.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const router = useRouter()
const idParam = String(route.params.id)
const isNew = idParam === 'new'
const toast = useToast()

const form = reactive<Record<string, any>>({
  title: '', slug: '', excerpt: '', coverImage: '', status: 'draft', language: 'es',
  scheduledAt: '', expiresAt: '', categoryId: '', authorId: '',
})
const seoForm = reactive<Record<string, any>>({ seoTitle: '', seoDescription: '', focusKeyword: '', seoCanonical: '' })
const article = ref<any>(null)
const blocks = ref<any[]>([])
const versions = ref<any[]>([])
const selectedTagIds = ref<number[]>([])
const saving = ref(false)

const { data: categories } = await useFetch<any>('/api/admin/cms-categories', { query: { perPage: 100 }, transform: (r: any) => r.rows })
const { data: authors } = await useFetch<any>('/api/admin/cms-authors', { query: { perPage: 100 }, transform: (r: any) => r.rows })
const { data: tags } = await useFetch<any>('/api/admin/cms-tags', { query: { perPage: 100 }, transform: (r: any) => r.rows })

const plainText = computed(() => blocksToPlainTextClient(blocks.value))
const wordCount = computed(() => plainText.value.split(/\s+/).filter(Boolean).length)
const readingTime = computed(() => Math.max(1, Math.round(wordCount.value / 200)))

function blocksToPlainTextClient(bs: any[]): string {
  const parts: string[] = []
  for (const b of bs) {
    if (b.text) parts.push(b.text)
    if (b.title) parts.push(b.title)
    if (b.left) parts.push(b.left)
    if (b.right) parts.push(b.right)
    if (Array.isArray(b.items)) for (const it of b.items) { if (it.q) parts.push(it.q); if (it.a) parts.push(it.a) }
  }
  return parts.join(' ')
}

async function load() {
  const { data } = await useFetch<any>(`/api/admin/cms/articles/${idParam}`, { key: `cms-article-${idParam}-${Date.now()}` })
  if (data.value?.article) {
    article.value = data.value.article
    Object.assign(form, data.value.article)
    Object.assign(seoForm, data.value.article)
    try {
      const parsed = JSON.parse(data.value.article.contentJson || '[]')
      blocks.value = Array.isArray(parsed) ? parsed : []
    } catch {
      blocks.value = []
    }
    selectedTagIds.value = (data.value.tags || []).map((t: any) => t.tagId)
  }
  const { data: vData } = await useFetch<any>(`/api/admin/cms/articles/${idParam}/versions`, { key: `cms-versions-${idParam}-${Date.now()}` })
  versions.value = vData.value?.rows || []
}
if (!isNew) await load()

useHead({ title: computed(() => (isNew ? 'Nuevo artículo' : form.title) + ' — Blog & CMS') })

function toggleTag(id: number) {
  selectedTagIds.value = selectedTagIds.value.includes(id) ? selectedTagIds.value.filter((x) => x !== id) : [...selectedTagIds.value, id]
}

async function uploadCover(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form.coverImage = res.key
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo subir la imagen')
  }
}

async function restoreVersion(versionId: number) {
  await $fetch(`/api/admin/cms/articles/${idParam}/versions/${versionId}/restore`, { method: 'POST' })
  toast.success('Versión restaurada')
  await load()
}

async function save() {
  if (!form.title.trim()) {
    toast.error('El título es obligatorio')
    return
  }
  saving.value = true
  const contentJson = JSON.stringify(blocks.value)
  const payload = {
    ...form, ...seoForm, contentJson,
    categoryId: form.categoryId || null,
    authorId: form.authorId || null,
    scheduledAt: form.scheduledAt || null,
    expiresAt: form.expiresAt || null,
  }
  try {
    let id = idParam
    if (isNew) {
      const res = await $fetch<{ id: number }>('/api/admin/cms/articles', { method: 'POST', body: payload })
      id = String(res.id)
      toast.success('Artículo creado')
    } else {
      await $fetch(`/api/admin/cms/articles/${idParam}`, { method: 'PUT', body: payload })
      toast.success('Artículo guardado')
    }
    await $fetch(`/api/admin/cms/articles/${id}/tags`, { method: 'PUT', body: { tagIds: selectedTagIds.value } })
    if (isNew) router.push(`/admin/cms/articles/${id}`)
    else await load()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}
</script>
