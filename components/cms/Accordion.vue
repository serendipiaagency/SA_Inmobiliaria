<template>
  <section class="cms-accordion" data-testid="cms-accordion">
    <div class="cms-accordion-top">
      <p v-if="block.title" class="cms-accordion-title">{{ block.title }}</p>
      <div v-if="block.checkable" class="cms-accordion-progress" role="status" aria-live="polite">
        <span>{{ done }} de {{ total }} preguntas hechas</span>
        <span class="cms-accordion-bar" aria-hidden="true"><i :style="{ width: `${pct}%` }" /></span>
      </div>
    </div>
    <details v-for="(section, si) in block.sections || []" :key="si" class="cms-accordion-section" :open="si === 0 ? true : undefined" :data-testid="`cms-accordion-section-${si + 1}`">
      <summary>
        <span class="cms-accordion-summary">{{ section.title }}</span>
        <span v-if="block.checkable" class="cms-accordion-count">{{ sectionDone(si) }}/{{ section.items?.length || 0 }}</span>
        <svg class="cms-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <ul class="cms-accordion-items">
        <li v-for="(item, ii) in section.items || []" :key="ii">
          <label v-if="block.checkable" class="cms-accordion-check">
            <input type="checkbox" :checked="isDone(si, ii)" :data-testid="`cms-accordion-item-${si + 1}-${ii + 1}`" @change="toggle(si, ii)">
            <span><strong>{{ item.q }}</strong><small v-if="item.why">{{ item.why }}</small></span>
          </label>
          <p v-else class="cms-accordion-plain"><strong>{{ item.q }}</strong><small v-if="item.why">{{ item.why }}</small></p>
        </li>
      </ul>
    </details>
    <div v-if="block.printable" class="cms-accordion-actions">
      <button type="button" class="cms-btn-ghost" data-testid="cms-accordion-print" @click="print">Imprimir la lista</button>
      <button v-if="block.checkable" type="button" class="cms-btn-ghost" data-testid="cms-accordion-reset" @click="reset">Empezar de cero</button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Preguntas agrupadas en secciones desplegables. Con `checkable`, cada
 * pregunta se marca como hecha y el progreso se recuerda en este navegador
 * (localStorage, una comodidad; nunca sale de aquí). `printable` añade el
 * botón de imprimir (CSS de impresión en el artículo).
 */
const props = defineProps<{ block: { title?: string; storageKey?: string; checkable?: boolean; printable?: boolean; sections?: Array<{ title: string; items?: Array<{ q: string; why?: string }> }> } }>()
const key = computed(() => `cms-accordion:${props.block.storageKey || 'default'}`)
const done = ref(0)
const marks = ref<Record<string, true>>({})

const total = computed(() => (props.block.sections || []).reduce((s, sec) => s + (sec.items?.length || 0), 0))
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const id = (si: number, ii: number) => `${si}:${ii}`
const isDone = (si: number, ii: number) => Boolean(marks.value[id(si, ii)])
const sectionDone = (si: number) => (props.block.sections?.[si]?.items || []).filter((_, ii) => isDone(si, ii)).length

function recount() {
  done.value = Object.keys(marks.value).length
}
function persist() {
  try {
    localStorage.setItem(key.value, JSON.stringify(marks.value))
  } catch {
    /* sin almacenamiento local (modo privado o bloqueado): el progreso dura lo que la visita */
  }
}
function toggle(si: number, ii: number) {
  const k = id(si, ii)
  if (marks.value[k]) marks.value = Object.fromEntries(Object.entries(marks.value).filter(([mark]) => mark !== k))
  else marks.value[k] = true
  recount()
  persist()
}
function reset() {
  marks.value = {}
  recount()
  persist()
}
function print() {
  window.print()
}
onMounted(() => {
  try {
    const raw = localStorage.getItem(key.value)
    if (raw) marks.value = JSON.parse(raw) || {}
  } catch {
    /* sin almacenamiento local o JSON corrupto: se empieza de cero */
  }
  recount()
})
</script>

<style scoped>
.cms-accordion {
  margin: 3rem 0;
}
.cms-accordion-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-bottom: 1rem;
}
.cms-accordion-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-accordion-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: #4f5b53;
}
.cms-accordion-bar {
  width: 8rem;
  height: 6px;
  border-radius: 999px;
  background: var(--cms-line, #e6e1d7);
  overflow: hidden;
}
.cms-accordion-bar i {
  display: block;
  height: 100%;
  background: var(--cms-accent, #1f4e5f);
  transition: width 0.3s ease;
}
.cms-accordion-section {
  border-top: 1px solid var(--cms-line, #e6e1d7);
}
.cms-accordion-section:last-of-type {
  border-bottom: 1px solid var(--cms-line, #e6e1d7);
}
.cms-accordion-section summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.1rem 0;
  cursor: pointer;
  list-style: none;
}
.cms-accordion-section summary::-webkit-details-marker {
  display: none;
}
.cms-accordion-summary {
  flex: 1;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.cms-accordion-count {
  font-size: 0.78rem;
  color: #7a857a;
  font-variant-numeric: tabular-nums;
}
.cms-accordion-chevron {
  width: 1.1rem;
  height: 1.1rem;
  transition: transform 0.25s ease;
}
.cms-accordion-section[open] .cms-accordion-chevron {
  transform: rotate(180deg);
}
.cms-accordion-items {
  margin: 0;
  padding: 0 0 1.25rem;
  list-style: none;
  display: grid;
  gap: 0.7rem;
}
.cms-accordion-check {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  cursor: pointer;
}
.cms-accordion-check input {
  margin-top: 0.3rem;
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  accent-color: var(--cms-accent, #1f4e5f);
}
.cms-accordion-check span,
.cms-accordion-plain {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0;
}
.cms-accordion-check strong,
.cms-accordion-plain strong {
  font-weight: 600;
  color: #2b2a26;
  line-height: 1.45;
}
.cms-accordion-check input:checked + span strong {
  color: #7a857a;
  text-decoration: line-through;
}
.cms-accordion-check small,
.cms-accordion-plain small {
  font-size: 0.85rem;
  line-height: 1.45;
  color: #6b766d;
}
.cms-accordion-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.25rem;
}
@media print {
  .cms-accordion-section {
    display: block;
  }
  .cms-accordion-actions,
  .cms-accordion-chevron {
    display: none;
  }
}
</style>
