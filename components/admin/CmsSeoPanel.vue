<template>
  <div class="card space-y-4 p-6">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">SEO</h3>
      <div class="flex items-center gap-2">
        <span class="text-2xl font-bold" :class="scoreCls">{{ score }}</span>
        <span class="text-xs text-stone-450">/100</span>
      </div>
    </div>

    <div>
      <label class="label">Título SEO</label>
      <input v-model="form.seoTitle" class="input" placeholder="Título para buscadores" />
      <p class="mt-1 text-[11px]" :class="titleLen >= 30 && titleLen <= 65 ? 'text-emerald-600' : 'text-amber-600'">{{ titleLen }} caracteres (ideal: 30–65)</p>
    </div>
    <div>
      <label class="label">Meta descripción</label>
      <textarea v-model="form.seoDescription" class="input" rows="2" placeholder="Resumen para resultados de búsqueda" />
      <p class="mt-1 text-[11px]" :class="descLen >= 70 && descLen <= 160 ? 'text-emerald-600' : 'text-amber-600'">{{ descLen }} caracteres (ideal: 70–160)</p>
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

    <div class="rounded-lg border border-line bg-stone-50 p-4">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-450">Análisis en tiempo real</p>
      <ul class="space-y-1.5 text-sm">
        <li v-for="check in checks" :key="check.label" class="flex items-center gap-2">
          <span :class="check.ok ? 'text-emerald-600' : 'text-stone-400'">{{ check.ok ? '✓' : '○' }}</span>
          <span :class="check.ok ? 'text-ink' : 'text-stone-500'">{{ check.label }}</span>
        </li>
      </ul>
      <div class="mt-3 grid grid-cols-4 gap-3 border-t border-line pt-3 text-center text-xs">
        <div>
          <p class="text-lg font-semibold">{{ wordCount }}</p>
          <p class="text-stone-450">palabras</p>
        </div>
        <div>
          <p class="text-lg font-semibold">{{ keywordDensity }}%</p>
          <p class="text-stone-450">densidad keyword</p>
        </div>
        <div>
          <p class="text-lg font-semibold">{{ links.internal }} / {{ links.external }}</p>
          <p class="text-stone-450">enlaces int./ext.</p>
        </div>
        <div>
          <p class="text-lg font-semibold" :class="readability.level === 'easy' ? 'text-emerald-600' : readability.level === 'medium' ? 'text-amber-600' : 'text-rose-500'">{{ readabilityLabel }}</p>
          <p class="text-stone-450">legibilidad ({{ readability.avgWordsPerSentence }} pal./frase)</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: Record<string, any>; plainText: string; article?: any }>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, any>] }>()
const form = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

const titleLen = computed(() => (form.value.seoTitle || '').length)
const descLen = computed(() => (form.value.seoDescription || '').length)
const wordCount = computed(() => props.plainText.trim().split(/\s+/).filter(Boolean).length)

const keywordDensity = computed(() => {
  const kw = (form.value.focusKeyword || '').toLowerCase().trim()
  if (!kw || !wordCount.value) return 0
  const occurrences = props.plainText.toLowerCase().split(kw).length - 1
  return Math.round((occurrences / wordCount.value) * 1000) / 10
})

// Mirrors server/utils/cms.ts's countLinks — real-time preview only; the
// authoritative count is recomputed server-side from the saved blocks on save.
const links = computed(() => {
  const urls = props.plainText.match(/https?:\/\/[^\s)]+/g) || []
  let internal = 0
  let external = 0
  for (const u of urls) (u.includes(window?.location?.hostname || '__never__') ? internal++ : external++)
  return { internal, external }
})

// Mirrors server/utils/cms.ts's computeReadability — same average-sentence-length heuristic.
const readability = computed(() => {
  const sentences = props.plainText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const words = props.plainText.split(/\s+/).filter(Boolean)
  const avg = sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : 0
  const level = avg <= 15 ? 'easy' : avg <= 25 ? 'medium' : 'hard'
  return { avgWordsPerSentence: avg, level: level as 'easy' | 'medium' | 'hard' }
})
const readabilityLabel = computed(() => ({ easy: 'Fácil', medium: 'Media', hard: 'Difícil' })[readability.value.level])

const checks = computed(() => [
  { label: 'Título SEO entre 30 y 65 caracteres', ok: titleLen.value >= 30 && titleLen.value <= 65 },
  { label: 'Meta descripción entre 70 y 160 caracteres', ok: descLen.value >= 70 && descLen.value <= 160 },
  { label: 'Palabra clave definida', ok: !!form.value.focusKeyword },
  { label: 'Palabra clave presente en el título SEO', ok: !!form.value.focusKeyword && (form.value.seoTitle || '').toLowerCase().includes((form.value.focusKeyword || '').toLowerCase()) },
  { label: 'Palabra clave presente en el contenido', ok: !!form.value.focusKeyword && props.plainText.toLowerCase().includes((form.value.focusKeyword || '').toLowerCase()) },
  { label: 'Al menos 300 palabras de contenido', ok: wordCount.value >= 300 },
  { label: 'Tiene imagen de portada', ok: !!props.article?.coverImage },
  { label: 'Frases fáciles de leer (≤15 palabras de media)', ok: readability.value.level === 'easy' },
])

const score = computed(() => {
  if (props.article?.seoScore !== undefined) return props.article.seoScore
  const passed = checks.value.filter((c) => c.ok).length
  return Math.round((passed / checks.value.length) * 100)
})
const scoreCls = computed(() => (score.value >= 70 ? 'text-emerald-600' : score.value >= 40 ? 'text-amber-600' : 'text-rose-500'))
</script>
