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
          <select v-model="selectedId" class="w-full rounded-lg border border-line px-3 py-2.5 text-sm">
            <option v-for="p in rows" :key="p.id" :value="p.id">{{ p.name }}</option>
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
        <div v-for="k in kinds" :key="k.key" v-show="results[k.key]" class="rounded-2xl border border-line bg-white">
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
const selectedId = ref<number | null>(null)
watch(
  rows,
  (r) => {
    if (!r.length || selectedId.value) return
    const fromQuery = Number(route.query.id)
    selectedId.value = fromQuery && r.some((p: any) => p.id === fromQuery) ? fromQuery : r[0].id
  },
  { immediate: true },
)

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

watch(selectedId, () => {
  Object.keys(results).forEach((k) => delete results[k])
  Object.keys(engines).forEach((k) => delete engines[k])
})

async function gen(kind: string) {
  if (!selectedId.value) return
  active.value = kind
  const res = await $fetch<any>('/api/admin/ai/generate', { method: 'POST', body: { id: selectedId.value, kind } })
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
