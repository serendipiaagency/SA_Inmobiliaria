<template>
  <div v-if="meta">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ isNew ? `New — ${meta.label}` : `Edit — ${meta.label} #${id}` }}</h1>
      <NuxtLink :to="`/admin/${resource}`" class="btn-secondary">← Back</NuxtLink>
    </div>

    <!-- Readonly detail view -->
    <div v-if="meta.readonly" class="card max-w-3xl p-6">
      <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <template v-for="(v, k) in record" :key="k">
          <div v-if="v !== null && v !== ''">
            <dt class="text-xs font-semibold uppercase text-slate-400">{{ k }}</dt>
            <dd class="mt-0.5 break-words text-sm text-slate-800">
              <a
                v-if="String(v).match(/\.(pdf|jpg|png|webp)$/i)"
                :href="mediaUrl(String(v))"
                target="_blank"
                class="text-emerald-700 underline"
                >Open file</a
              >
              <span v-else>{{ v }}</span>
            </dd>
          </div>
        </template>
      </dl>
    </div>

    <!-- Edit form -->
    <form v-else class="card max-w-3xl space-y-4 p-6" @submit.prevent="save">
      <div v-for="(fd, field) in meta.fields" :key="field">
        <label class="label">{{ fd.label }} <span v-if="fd.required" class="text-red-500">*</span></label>

        <select v-if="fd.type === 'select'" v-model="form[field]" class="input">
          <option value="">—</option>
          <option v-for="opt in fd.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <textarea v-else-if="fd.type === 'textarea' || fd.type === 'json'" v-model="form[field]" class="input" rows="4" />

        <div v-else-if="fd.type === 'image' || fd.type === 'file'" class="space-y-2">
          <div v-if="form[field]" class="flex items-center gap-3">
            <img
              v-if="fd.type === 'image'"
              :src="mediaUrl(form[field])"
              class="h-16 w-16 rounded border border-slate-200 object-cover"
            />
            <span class="truncate text-xs text-slate-500">{{ form[field] }}</span>
            <button type="button" class="text-sm text-red-600 hover:underline" @click="form[field] = ''">Remove</button>
          </div>
          <input type="file" :accept="fd.type === 'image' ? 'image/*' : undefined" class="text-sm" @change="upload(field, $event)" />
          <p v-if="uploading === field" class="text-xs text-slate-400">Uploading…</p>
        </div>

        <input v-else-if="fd.type === 'number'" v-model="form[field]" type="number" step="any" class="input" />
        <input v-else v-model="form[field]" class="input" />
      </div>

      <!-- Translations (en/ar) -->
      <fieldset v-if="meta.hasTranslations" class="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend class="px-1 text-sm font-semibold text-slate-700">Translations</legend>
        <div v-for="tr in translations" :key="tr.locale" class="space-y-2">
          <p class="text-xs font-bold uppercase text-emerald-700">{{ tr.locale }}</p>
          <input v-model="tr.title" class="input" :placeholder="`Title (${tr.locale})`" />
          <textarea v-model="tr.description" class="input" rows="3" :placeholder="`Description (${tr.locale})`" />
        </div>
      </fieldset>

      <div class="flex items-center gap-3">
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        <p v-if="saved" class="text-sm font-medium text-emerald-700">Saved ✓</p>
        <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const router = useRouter()
const resource = computed(() => String(route.params.resource))
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')

const { data: resources } = await useFetch<Record<string, any>>('/api/admin/resources')
const meta = computed(() => resources.value?.[resource.value])
if (!meta.value) throw createError({ statusCode: 404, statusMessage: 'Unknown resource', fatal: true })
useHead({ title: computed(() => `${meta.value?.label || 'Admin'} — M&M Real Estate`) })

const form = reactive<Record<string, any>>({})
const record = ref<Record<string, any>>({})
const translations = reactive([
  { locale: 'en', title: '', description: '' },
  { locale: 'ar', title: '', description: '' },
])

if (!isNew.value) {
  const res = await $fetch<any>(`/api/admin/${resource.value}/${id.value}`)
  record.value = res.row
  for (const field of Object.keys(meta.value.fields)) {
    form[field] = res.row[field] ?? ''
  }
  for (const tr of res.translations || []) {
    const slot = translations.find((t) => t.locale === tr.locale)
    if (slot) {
      slot.title = tr.title
      slot.description = tr.description || ''
    }
  }
}

const saving = ref(false)
const saved = ref(false)
const error = ref('')
const uploading = ref('')

async function upload(field: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = field
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', resource.value)
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form[field] = res.key
  } catch (err: any) {
    error.value = err?.statusMessage || 'Upload failed'
  } finally {
    uploading.value = ''
  }
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    const body: Record<string, any> = { ...form }
    if (meta.value.hasTranslations) {
      body.translations = translations.filter((t) => t.title)
    }
    if (isNew.value) {
      const res = await $fetch<{ id: number }>(`/api/admin/${resource.value}`, { method: 'POST', body })
      router.replace(`/admin/${resource.value}/${res.id}`)
    } else {
      await $fetch(`/api/admin/${resource.value}/${id.value}`, { method: 'PUT', body })
    }
    saved.value = true
  } catch (e: any) {
    error.value = e?.statusMessage || e?.data?.statusMessage || 'Save failed'
  } finally {
    saving.value = false
  }
}
</script>
