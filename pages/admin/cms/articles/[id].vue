<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ isNew ? 'Nuevo artículo' : `Editar — ${form.title || ''}` }}</h1>
        <p v-if="!isNew" class="mt-1 text-xs text-stone-450">Cada guardado crea una versión en el historial.</p>
      </div>
      <div class="flex items-center gap-3">
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

        <div class="card space-y-3 p-6">
          <div class="flex items-center justify-between">
            <label class="label !mb-0">Contenido</label>
            <span class="text-[11px] text-stone-400">Editor de bloques llega en la Fase 3 — por ahora, texto simple</span>
          </div>
          <textarea v-model="bodyText" class="input" rows="16" placeholder="Escribe el contenido del artículo…" />
          <p class="text-[11px] text-stone-450">{{ wordCount }} palabras · ~{{ Math.max(1, Math.round(wordCount / 200)) }} min de lectura</p>
        </div>

        <div class="card space-y-4 p-6">
          <h3 class="font-semibold">SEO</h3>
          <div>
            <label class="label">Título SEO</label>
            <input v-model="form.seoTitle" class="input" :placeholder="form.title" />
          </div>
          <div>
            <label class="label">Meta descripción</label>
            <textarea v-model="form.seoDescription" class="input" rows="2" :placeholder="form.excerpt" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Palabra clave objetivo</label>
              <input v-model="form.focusKeyword" class="input" />
            </div>
            <div>
              <label class="label">Canonical</label>
              <input v-model="form.seoCanonical" class="input" placeholder="https://…" />
            </div>
          </div>
          <div v-if="article" class="flex items-center gap-3 rounded-lg border border-line bg-stone-50 px-4 py-3">
            <span class="text-2xl font-bold" :class="article.seoScore >= 70 ? 'text-emerald-600' : article.seoScore >= 40 ? 'text-amber-600' : 'text-rose-500'">{{ article.seoScore }}</span>
            <div>
              <p class="text-sm font-semibold">SEO Score</p>
              <p class="text-xs text-stone-450">Se recalcula automáticamente al guardar</p>
            </div>
          </div>
        </div>
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
            <label class="label">Idioma</label>
            <select v-model="form.language" class="input">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label class="label">Categoría (ID)</label>
            <input v-model="form.categoryId" type="number" class="input" placeholder="ID de categoría" />
            <p class="mt-1 text-[11px] text-stone-450">Gestiona categorías en <NuxtLink to="/admin/cms-categories" class="underline">Categorías</NuxtLink>.</p>
          </div>
          <div>
            <label class="label">Autor (ID)</label>
            <input v-model="form.authorId" type="number" class="input" placeholder="ID de autor" />
            <p class="mt-1 text-[11px] text-stone-450">Gestiona autores en <NuxtLink to="/admin/cms-authors" class="underline">Autores</NuxtLink>.</p>
          </div>
        </div>

        <div v-if="!isNew" class="card p-5">
          <h3 class="mb-2 font-semibold">Historial de versiones</h3>
          <ul v-if="versions.length" class="max-h-64 space-y-2 overflow-y-auto text-sm">
            <li v-for="v in versions" :key="v.id" class="flex items-center justify-between border-b border-line pb-2 last:border-0">
              <span class="text-stone-500">{{ new Date(v.createdAt).toLocaleString('es-ES') }}</span>
              <span class="text-[11px] text-stone-400">{{ v.editorName || '—' }}</span>
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
  scheduledAt: '', categoryId: '', authorId: '', seoTitle: '', seoDescription: '', focusKeyword: '', seoCanonical: '',
})
const article = ref<any>(null)
const bodyText = ref('')
const versions = ref<any[]>([])
const saving = ref(false)

const wordCount = computed(() => bodyText.value.trim().split(/\s+/).filter(Boolean).length)

if (!isNew) {
  const { data } = await useFetch<any>(`/api/admin/cms/articles/${idParam}`)
  if (data.value?.article) {
    article.value = data.value.article
    Object.assign(form, data.value.article)
    try {
      const blocks = JSON.parse(data.value.article.contentJson || '[]')
      bodyText.value = Array.isArray(blocks) ? blocks.map((b: any) => b.text || '').join('\n\n') : ''
    } catch {
      bodyText.value = ''
    }
  }
  const { data: vData } = await useFetch<any>(`/api/admin/cms/articles/${idParam}/versions`)
  versions.value = vData.value?.rows || []
}

useHead({ title: computed(() => (isNew ? 'Nuevo artículo' : form.title) + ' — Blog & CMS') })

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

async function save() {
  if (!form.title.trim()) {
    toast.error('El título es obligatorio')
    return
  }
  saving.value = true
  const contentJson = JSON.stringify(
    bodyText.value.split(/\n{2,}/).filter(Boolean).map((text) => ({ type: 'paragraph', text })),
  )
  const payload = { ...form, contentJson, categoryId: form.categoryId || null, authorId: form.authorId || null }
  try {
    if (isNew) {
      const res = await $fetch<{ id: number }>('/api/admin/cms/articles', { method: 'POST', body: payload })
      toast.success('Artículo creado')
      router.push(`/admin/cms/articles/${res.id}`)
    } else {
      await $fetch(`/api/admin/cms/articles/${idParam}`, { method: 'PUT', body: payload })
      toast.success('Artículo guardado')
      const { data } = await useFetch<any>(`/api/admin/cms/articles/${idParam}`)
      if (data.value?.article) article.value = data.value.article
    }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}
</script>
