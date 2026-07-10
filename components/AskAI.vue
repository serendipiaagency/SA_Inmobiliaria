<template>
  <div class="rounded-2xl border border-line bg-white p-6">
    <div class="flex items-center gap-2">
      <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ t('askAI.badge', 'IA') }}</span>
      <h3 class="font-serif text-xl font-medium">{{ t('askAI.title', 'Pregúntale a la IA sobre esta propiedad') }}</h3>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button v-for="q in suggestions" :key="q" class="chip" @click="ask(q)">{{ q }}</button>
    </div>

    <form class="mt-4 flex gap-2" @submit.prevent="ask(input)">
      <input v-model="input" class="input" :placeholder="t('askAI.placeholder', 'Escribe tu pregunta…')" maxlength="300" />
      <button type="submit" class="btn-primary shrink-0" :disabled="loading">{{ loading ? '…' : t('askAI.ask', 'Preguntar') }}</button>
    </form>

    <transition name="fade">
      <div v-if="answer || loading" class="mt-5 rounded-xl bg-paper p-5">
        <p v-if="loading" class="flex items-center gap-2 text-sm text-stone-500"><span class="dot" /> {{ t('askAI.thinking', 'Pensando…') }}</p>
        <template v-else>
          <p class="text-[15px] leading-relaxed text-stone-700">{{ answer }}</p>
          <p class="mt-3 text-[11px] uppercase tracking-widest text-stone-400">
            {{ engine === 'ai' ? t('askAI.answerAi', 'Respuesta generada por IA') : t('askAI.answerHeuristic', 'Respuesta orientativa · confírmala con un asesor') }}
          </p>
        </template>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const { t } = useI18n()
const suggestions = computed(() => [
  t('askAI.suggestionLight', '¿Tiene mucha luz?'),
  t('askAI.suggestionInvestment', '¿Es buena inversión?'),
  t('askAI.suggestionRenovation', '¿Cuánto costaría reformarla?'),
  t('askAI.suggestionSchools', '¿Qué colegios hay cerca?'),
  t('askAI.suggestionOrientation', '¿Qué orientación tiene?'),
])
const input = ref('')
const answer = ref('')
const engine = ref('')
const loading = ref(false)

async function ask(q: string) {
  const question = (q || '').trim()
  if (!question || loading.value) return
  input.value = question
  loading.value = true
  answer.value = ''
  try {
    const res = await $fetch<any>('/api/public/ask', { method: 'POST', body: { slug: props.slug, question } })
    answer.value = res.text
    engine.value = res.engine
  } catch {
    answer.value = t('askAI.error', 'No he podido responder ahora mismo. Inténtalo de nuevo o contacta con un asesor.')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.chip {
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.45rem 0.9rem;
  font-size: 13px;
  color: #44403c;
  transition: all 0.18s;
}
.chip:hover {
  border-color: #16150f;
  color: #16150f;
}
.chip:active {
  transform: scale(0.95);
}
.dot {
  display: inline-block;
  height: 0.5rem;
  width: 0.5rem;
  border-radius: 9999px;
  background: currentColor;
  animation: pulse 0.9s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.fade-enter-active { transition: opacity 0.3s; }
.fade-enter-from { opacity: 0; }
</style>
