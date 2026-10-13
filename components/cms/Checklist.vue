<template>
  <section class="cms-checklist" data-testid="cms-checklist">
    <div class="cms-checklist-top">
      <div>
        <p v-if="block.title" class="cms-checklist-title">{{ block.title }}</p>
        <p v-if="block.intro" class="cms-checklist-intro">{{ block.intro }}</p>
      </div>
      <div class="cms-checklist-progress" role="status" aria-live="polite" data-testid="cms-checklist-progress">
        <strong>{{ pct }} %</strong>
        <span>{{ done }} de {{ total }}</span>
        <span class="cms-checklist-bar" aria-hidden="true"><i :style="{ width: `${pct}%` }" /></span>
      </div>
    </div>
    <div class="cms-checklist-groups">
      <section v-for="(group, gi) in block.groups || []" :key="gi" class="cms-checklist-group" :data-testid="`cms-checklist-group-${gi + 1}`">
        <h3 class="cms-checklist-group-title"><span>{{ group.title }}</span><small>{{ groupDone(gi) }}/{{ group.items?.length || 0 }}</small></h3>
        <ul>
          <li v-for="(item, ii) in group.items || []" :key="ii">
            <label class="cms-checklist-item" :class="{ 'is-done': isDone(gi, ii) }">
              <input type="checkbox" :checked="isDone(gi, ii)" :data-testid="`cms-checklist-item-${gi + 1}-${ii + 1}`" @change="toggle(gi, ii)">
              <span><strong>{{ item.text }}</strong><small v-if="item.hint">{{ item.hint }}</small></span>
            </label>
          </li>
        </ul>
      </section>
    </div>
    <div class="cms-checklist-actions">
      <button v-if="block.downloadable !== false" type="button" class="cms-btn-ghost" data-testid="cms-checklist-download" @click="download">Descargar la lista (.txt)</button>
      <button v-if="block.printable !== false" type="button" class="cms-btn-ghost" data-testid="cms-checklist-print" @click="print">Imprimir</button>
      <button type="button" class="cms-btn-ghost" data-testid="cms-checklist-reset" @click="reset">Reiniciar</button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Lista de comprobación interactiva por grupos (fases de la compra, estancias
 * de una visita…): marca lo hecho, enseña el progreso y lo recuerda en este
 * navegador (localStorage). Se puede descargar como texto para llevarla a la
 * visita, o imprimir. No se envía nada a ningún sitio.
 */
const props = defineProps<{ block: { title?: string; intro?: string; storageKey?: string; printable?: boolean; downloadable?: boolean; groups?: Array<{ title: string; items?: Array<{ text: string; hint?: string }> }> } }>()
const key = computed(() => `cms-checklist:${props.block.storageKey || 'default'}`)
const marks = ref<Record<string, true>>({})
const done = ref(0)
const total = computed(() => (props.block.groups || []).reduce((s, g) => s + (g.items?.length || 0), 0))
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const id = (gi: number, ii: number) => `${gi}:${ii}`
const isDone = (gi: number, ii: number) => Boolean(marks.value[id(gi, ii)])
const groupDone = (gi: number) => (props.block.groups?.[gi]?.items || []).filter((_, ii) => isDone(gi, ii)).length

function persist() {
  try {
    localStorage.setItem(key.value, JSON.stringify(marks.value))
  } catch {
    /* sin almacenamiento local (modo privado o bloqueado): el progreso dura lo que la visita */
  }
}
function toggle(gi: number, ii: number) {
  const k = id(gi, ii)
  if (marks.value[k]) marks.value = Object.fromEntries(Object.entries(marks.value).filter(([mark]) => mark !== k))
  else marks.value[k] = true
  done.value = Object.keys(marks.value).length
  persist()
}
function reset() {
  marks.value = {}
  done.value = 0
  persist()
}
function print() {
  window.print()
}
function download() {
  const lines: string[] = [props.block.title || 'Lista de comprobación', '']
  for (const [gi, g] of (props.block.groups || []).entries()) {
    lines.push(g.title.toUpperCase())
    for (const [ii, item] of (g.items || []).entries()) lines.push(`${isDone(gi, ii) ? '[x]' : '[ ]'} ${item.text}${item.hint ? ` — ${item.hint}` : ''}`)
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(props.block.storageKey || 'lista').replace(/[^a-z0-9-]+/gi, '-')}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onMounted(() => {
  try {
    const raw = localStorage.getItem(key.value)
    if (raw) marks.value = JSON.parse(raw) || {}
  } catch {
    /* sin almacenamiento local o JSON corrupto: se empieza de cero */
  }
  done.value = Object.keys(marks.value).length
})
</script>

<style scoped>
.cms-checklist {
  margin: 3rem 0;
  padding: 2rem;
  border-radius: 1.25rem;
  background: var(--cms-paper-2, #f6f4ef);
}
.cms-checklist-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem 2rem;
}
.cms-checklist-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.cms-checklist-intro {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #4f5b53;
  max-width: 48ch;
}
.cms-checklist-progress {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  font-size: 0.8rem;
  color: #4f5b53;
  min-width: 10rem;
}
.cms-checklist-progress strong {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--cms-accent, #1f4e5f);
  font-variant-numeric: tabular-nums;
}
.cms-checklist-bar {
  grid-column: 1 / -1;
  height: 6px;
  border-radius: 999px;
  background: #e4dfd4;
  overflow: hidden;
}
.cms-checklist-bar i {
  display: block;
  height: 100%;
  background: var(--cms-accent, #1f4e5f);
  transition: width 0.3s ease;
}
.cms-checklist-groups {
  display: grid;
  gap: 1.5rem;
  margin-top: 1.75rem;
}
.cms-checklist-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-checklist-group-title small {
  font-size: 0.75rem;
  color: #7a857a;
  letter-spacing: 0;
  text-transform: none;
  font-variant-numeric: tabular-nums;
}
.cms-checklist-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}
.cms-checklist-item {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.7rem 0.9rem;
  border-radius: 0.8rem;
  background: #fff;
  border: 1px solid var(--cms-line, #e6e1d7);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}
.cms-checklist-item:hover {
  border-color: #cfc8ba;
}
.cms-checklist-item.is-done {
  background: #f1f4ef;
}
.cms-checklist-item input {
  margin-top: 0.25rem;
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  accent-color: var(--cms-accent, #1f4e5f);
}
.cms-checklist-item span {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.cms-checklist-item strong {
  font-weight: 600;
  color: #2b2a26;
  line-height: 1.45;
}
.cms-checklist-item.is-done strong {
  color: #7a857a;
  text-decoration: line-through;
}
.cms-checklist-item small {
  font-size: 0.85rem;
  line-height: 1.45;
  color: #6b766d;
}
.cms-checklist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.5rem;
}
@media (min-width: 768px) {
  .cms-checklist-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .cms-checklist {
    padding: 1.25rem;
  }
}
@media print {
  .cms-checklist {
    background: none;
    padding: 0;
  }
  .cms-checklist-actions {
    display: none;
  }
  .cms-checklist-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
