<template>
  <div>
    <div class="mb-6 flex items-center gap-2">
      <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">IA</span>
      <h1 class="text-2xl font-bold">AI Studio</h1>
    </div>
    <p class="mb-6 max-w-2xl text-sm text-stone-500">
      Genera automáticamente títulos, descripciones, SEO y contenido para redes y campañas a partir de los datos de cada propiedad.
      <span v-if="engine === 'rules'" class="mt-1 block text-[12px] text-amber-700">
        Motor por reglas activo. Añade el secret <code>AI_API_KEY</code> en Cloudflare para activar la generación con Claude.
      </span>
    </p>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Picker -->
      <div class="space-y-4">
        <label class="block">
          <span class="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-stone-500">Propiedad</span>
          <select v-model="selectedKey" class="w-full rounded-lg border border-line px-3 py-2.5 text-sm">
            <option v-for="p in rows" :key="`${p.catalog}:${p.id}`" :value="`${p.catalog}:${p.id}`">{{ p.name || p.title || `#${p.id}` }}{{ p.catalog === 'agent' ? ' · 2ª mano' : '' }}</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="k in kinds" :key="k.key" class="rounded-lg border border-line px-3 py-2.5 text-[13px] font-medium transition hover:border-ink hover:bg-paper" :class="{ 'border-ink bg-ink text-white': active === k.key }" @click="gen(k.key)">
            {{ k.label }}
          </button>
        </div>
        <button class="btn-primary w-full" :disabled="loading" @click="genAll">{{ loading ? 'Generando…' : 'Generar todo' }}</button>
      </div>

      <!-- Output -->
      <div class="lg:col-span-2 space-y-4">
        <div v-for="k in kinds" v-show="results[k.key]" :key="k.key" class="rounded-2xl border border-line bg-white">
          <div class="flex items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-500">{{ k.label }}</p>
              <span
                v-if="engines[k.key]"
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="engines[k.key] === 'ai' ? 'bg-ink text-white' : 'bg-paper text-stone-500 ring-1 ring-line'"
              >
                {{ engines[k.key] === 'ai' ? 'Claude' : 'Reglas' }}
              </span>
            </div>
            <button class="text-[12px] font-semibold uppercase tracking-widest text-stone-500 hover:text-ink" @click="copy(k.key)">{{ copied === k.key ? '¡Copiado!' : 'Copiar' }}</button>
          </div>
          <pre class="whitespace-pre-wrap px-5 py-4 font-sans text-[14px] leading-relaxed text-stone-700">{{ results[k.key] }}</pre>
        </div>
        <div v-if="!Object.keys(results).length" class="rounded-2xl border border-dashed border-line p-12 text-center text-stone-400">
          Elige una propiedad y un tipo de contenido, o pulsa «Generar todo».
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'AI Studio — M&M Real Estate' })

const route = useRoute()
const { data } = await useFetch<any>('/api/public/properties', { query: { perPage: 48 } })
const rows = computed(() => data.value?.rows || [])
// La selección es `catalog:id` para distinguir obra nueva de 2ª mano (los ids
// se solapan entre catálogos). El enlace desde el editor llega con ?id=&kind=.
const selectedKey = ref<string>('')
watch(
  rows,
  (r) => {
    if (!r.length || selectedKey.value) return
    const qId = Number(route.query.id)
    const qCatalog = route.query.kind === 'agent' ? 'agent' : 'developer'
    const wanted = qId ? `${qCatalog}:${qId}` : ''
    selectedKey.value = wanted && r.some((p: any) => `${p.catalog}:${p.id}` === wanted) ? wanted : `${r[0].catalog}:${r[0].id}`
  },
  { immediate: true },
)
const sel = computed(() => {
  const [catalog, idStr] = selectedKey.value.split(':')
  return { catalog: catalog === 'agent' ? 'agent' : 'developer', id: Number(idStr) || 0 }
})

const kinds = [
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descripción' },
  { key: 'seo_title', label: 'SEO title' },
  { key: 'meta_description', label: 'Meta description' },
  { key: 'summary', label: 'Resumen' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'email', label: 'Email' },
]

const results = reactive<Record<string, string>>({})
const engines = reactive<Record<string, 'ai' | 'rules'>>({})
const active = ref('')
const loading = ref(false)
const copied = ref('')
const engine = ref('')

watch(selectedKey, () => {
  // Clearing a reactive() object's keys in place (rather than reassigning
  // the binding, which isn't possible for a `const reactive(...)`) is the
  // standard Vue 3 idiom for resetting reactive state.
  /* eslint-disable-next-line @typescript-eslint/no-dynamic-delete */
  Object.keys(results).forEach((k) => delete results[k])
  /* eslint-disable-next-line @typescript-eslint/no-dynamic-delete */
  Object.keys(engines).forEach((k) => delete engines[k])
})

async function gen(kind: string) {
  if (!sel.value.id) return
  active.value = kind
  const res = await $fetch<any>('/api/admin/ai/generate', { method: 'POST', body: { id: sel.value.id, kind, catalog: sel.value.catalog } })
  results[kind] = res.text
  engines[kind] = res.engine
  engine.value = res.engine
}
async function genAll() {
  loading.value = true
  try {
    for (const k of kinds) await gen(k.key)
  } finally {
    loading.value = false
  }
}
function copy(kind: string) {
  navigator.clipboard.writeText(results[kind] || '')
  copied.value = kind
  setTimeout(() => (copied.value = ''), 1500)
}
</script>
