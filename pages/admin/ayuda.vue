<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Ayuda y documentación</h1>
      <p class="mt-1 text-sm text-stone-500">Guía de uso de cada apartado de la plataforma, preguntas frecuentes y cómo contactarnos.</p>
    </div>

    <div class="mb-6">
      <div class="relative">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input v-model="query" type="search" placeholder="Busca por lo que quieres hacer (ej: “contrato”, “webhook”, “fianza”…)" class="cfg-input pl-9" />
      </div>
    </div>

    <!-- Search results -->
    <template v-if="query.trim()">
      <AdminPanel :title="`Resultados para “${query.trim()}”`" class="mb-6">
        <p v-if="!matchingSections.length && !matchingFaqs.length" class="text-sm text-stone-400">
          Sin resultados. Prueba con otra palabra, o
          <a :href="`mailto:${contact.email}?subject=${encodeURIComponent('Ayuda con la plataforma')}`" class="text-ink underline">escríbenos directamente</a>.
        </p>

        <div v-if="matchingSections.length" class="space-y-3">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Apartados</p>
          <div v-for="s in matchingSections" :key="s.key" class="rounded-lg border border-line p-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium">{{ s.title }} <span class="text-xs font-normal text-stone-400">· {{ s.group }}</span></p>
              <NuxtLink v-if="s.route" :to="s.route" class="shrink-0 text-xs font-medium text-ink hover:underline">Ir al apartado →</NuxtLink>
            </div>
            <p class="mt-1 text-sm text-stone-600">{{ s.summary }}</p>
          </div>
        </div>

        <div v-if="matchingFaqs.length" class="mt-5 space-y-3">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Preguntas frecuentes</p>
          <div v-for="f in matchingFaqs" :key="f.id" class="rounded-lg border border-line p-3">
            <p class="text-sm font-medium">{{ f.question }}</p>
            <p class="mt-1 text-sm text-stone-600">{{ f.answer }}</p>
          </div>
        </div>
      </AdminPanel>
    </template>

    <template v-else>
      <!-- Group tabs -->
      <div class="mb-5 flex flex-wrap gap-2">
        <button
          v-for="g in groups"
          :key="g"
          type="button"
          class="rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
          :class="activeGroup === g ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
          @click="activeGroup = g"
        >
          {{ g }}
        </button>
      </div>

      <AdminPanel :title="activeGroup" class="mb-6" :pad="false">
        <div class="divide-y divide-line">
          <details v-for="s in sectionsInActiveGroup" :key="s.key" class="group px-5 py-4">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
              <span class="text-sm font-medium">{{ s.title }}</span>
              <span class="flex items-center gap-3">
                <NuxtLink v-if="s.route" :to="s.route" class="text-xs font-medium text-ink hover:underline" @click.stop>Abrir →</NuxtLink>
                <svg class="h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>
            <p class="mt-2 text-sm text-stone-600">{{ s.summary }}</p>
            <ul v-if="s.steps.length" class="mt-3 space-y-1.5 text-sm text-stone-600">
              <li v-for="(step, i) in s.steps" :key="i" class="flex gap-2">
                <span class="mt-0.5 shrink-0 text-stone-400">{{ i + 1 }}.</span>
                <span>{{ step }}</span>
              </li>
            </ul>
          </details>
        </div>
      </AdminPanel>

      <AdminPanel title="Preguntas frecuentes" class="mb-6" :pad="false">
        <div class="divide-y divide-line">
          <details v-for="f in faqs" :key="f.id" class="px-5 py-4">
            <summary class="cursor-pointer list-none text-sm font-medium">{{ f.question }}</summary>
            <p class="mt-2 text-sm text-stone-600">{{ f.answer }}</p>
          </details>
        </div>
      </AdminPanel>
    </template>

    <AdminPanel title="¿Necesitas ayuda?">
      <p class="text-sm text-stone-600">{{ contact.note }}</p>
      <a
        :href="`mailto:${contact.email}?subject=${encodeURIComponent('Ayuda con la plataforma')}`"
        class="dash-btn-primary mt-4 inline-flex"
      >
        Escribir a {{ contact.email }}
      </a>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Ayuda y documentación — M&M Real Estate' })

const { sections, faqs, contact } = useHelpContent()

const groups = [...new Set(sections.map((s) => s.group))]
const activeGroup = ref(groups[0])
const sectionsInActiveGroup = computed(() => sections.filter((s) => s.group === activeGroup.value))

const query = ref('')
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents so "difícil" matches "dificil"
}
const matchingSections = computed(() => {
  const q = norm(query.value.trim())
  if (!q) return []
  return sections.filter((s) => norm(`${s.title} ${s.summary} ${s.steps.join(' ')} ${s.group}`).includes(q))
})
const matchingFaqs = computed(() => {
  const q = norm(query.value.trim())
  if (!q) return []
  return faqs.filter((f) => norm(`${f.question} ${f.answer} ${f.tags.join(' ')}`).includes(q))
})
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black;
}
summary::-webkit-details-marker {
  display: none;
}
</style>
