<template>
  <div class="card p-5">
    <h3 class="mb-3 font-semibold">IA editorial</h3>

    <div class="mb-3 grid grid-cols-2 gap-1.5 text-xs">
      <button class="ai-btn" :disabled="loading" @click="run('rewrite')">Reescribir</button>
      <button class="ai-btn" :disabled="loading" @click="run('summarize')">Resumir</button>
      <button class="ai-btn" :disabled="loading" @click="run('expand')">Expandir</button>
      <button class="ai-btn" :disabled="loading" @click="run('correct')">Corregir</button>
      <button class="ai-btn" :disabled="loading" @click="run('seo')">Optimizar SEO</button>
      <button class="ai-btn" :disabled="loading" @click="run('faq')">Crear FAQs</button>
      <button class="ai-btn" :disabled="loading" @click="run('meta_description')">Meta description</button>
      <button class="ai-btn" :disabled="loading" @click="translateOpen = !translateOpen">Traducir</button>
    </div>

    <div v-if="translateOpen" class="mb-3 flex gap-2">
      <select v-model="targetLanguage" class="input !py-1 text-xs">
        <option value="en">A inglés</option>
        <option value="es">A español</option>
      </select>
      <button class="ai-btn" :disabled="loading" @click="run('translate')">Ir</button>
    </div>

    <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-450">Redes sociales</p>
    <div class="mb-3 flex flex-wrap gap-1.5 text-xs">
      <button class="ai-btn" :disabled="loading" @click="run('social_linkedin')">LinkedIn</button>
      <button class="ai-btn" :disabled="loading" @click="run('social_instagram')">Instagram</button>
      <button class="ai-btn" :disabled="loading" @click="run('social_facebook')">Facebook</button>
      <button class="ai-btn" :disabled="loading" @click="run('social_google_business')">Google Business</button>
      <button class="ai-btn" :disabled="loading" @click="run('social_twitter')">X/Twitter</button>
      <button class="ai-btn" :disabled="loading" @click="run('social_tiktok')">TikTok</button>
    </div>

    <div v-if="loading" class="rounded-lg border border-line bg-stone-50 p-3 text-center text-xs text-stone-450">Generando…</div>
    <div v-else-if="result" class="rounded-lg border border-line bg-stone-50 p-3">
      <p class="whitespace-pre-wrap text-sm">{{ result }}</p>
      <button class="mt-2 text-xs font-medium text-emerald-700 hover:underline" @click="copy">Copiar al portapapeles</button>
    </div>
    <div v-else-if="notice" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">{{ notice }}</div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ articleId: number }>()
const toast = useToast()

const loading = ref(false)
const result = ref('')
const notice = ref('')
const translateOpen = ref(false)
const targetLanguage = ref('en')

async function run(action: string) {
  loading.value = true
  result.value = ''
  notice.value = ''
  try {
    const res = await $fetch<{ ok: boolean; text?: string; message?: string }>('/api/admin/cms/ai', {
      method: 'POST',
      body: { action, articleId: props.articleId, targetLanguage: targetLanguage.value },
    })
    if (res.ok && res.text) result.value = res.text
    else notice.value = res.message || 'No se pudo generar contenido.'
  } catch (err: any) {
    notice.value = err?.data?.message || err?.data?.statusMessage || 'No se pudo generar contenido.'
  } finally {
    loading.value = false
  }
}

async function copy() {
  await navigator.clipboard.writeText(result.value)
  toast.success('Copiado')
}
</script>

<style scoped>
.ai-btn {
  border: 1px solid #e7e4de;
  border-radius: 0.5rem;
  padding: 0.35rem 0.5rem;
  font-weight: 500;
  transition: all 0.15s;
  text-align: center;
}
.ai-btn:hover:not(:disabled) { border-color: #16150f; background: #f5f5f4; }
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
