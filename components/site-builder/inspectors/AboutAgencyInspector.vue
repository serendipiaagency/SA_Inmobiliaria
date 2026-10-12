<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" multiline :rows="5" :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
      <ImageField label="Fotografía corporativa" aspect="video" show-alt :model-value="content.image || ''" :alt="content.imageAlt || ''" @update:model-value="(v) => (content.image = v)" @update:alt="(v) => (content.imageAlt = v)" />
    </InspectorSection>

    <InspectorSection title="Cifras">
      <p class="mb-2 text-[11px] text-stone-400">
        Las cifras en vivo son recuentos reales de tu cuenta y se actualizan solas. Las propias las escribes tú: úsalas sólo para datos que puedas acreditar (años de experiencia, operaciones cerradas…). Hasta cuatro, en el orden de esta lista.
      </p>
      <div class="space-y-1 rounded-lg border border-line p-2">
        <div v-for="(key, i) in orderedKeys" :key="key" class="rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
          <label class="flex items-center gap-2">
            <input type="checkbox" :checked="selected.includes(key)" @change="toggle(key, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ labelFor(key) }}</span>
            <span v-if="isLiveStatKey(key)" class="ml-auto shrink-0 text-stone-400" :data-testid="`stat-live-${key}`">{{ liveValue(key) }}</span>
            <span v-if="selected.includes(key)" class="ml-1 flex shrink-0 gap-0.5">
              <button type="button" class="rounded px-1 text-stone-400 hover:bg-stone-100 disabled:opacity-30" :disabled="selected.indexOf(key) === 0" title="Subir" @click="move(key, -1)">↑</button>
              <button type="button" class="rounded px-1 text-stone-400 hover:bg-stone-100 disabled:opacity-30" :disabled="selected.indexOf(key) === selected.length - 1" title="Bajar" @click="move(key, 1)">↓</button>
            </span>
            <span v-else class="ml-1 w-10 shrink-0" />
            <span v-if="false">{{ i }}</span>
          </label>
          <div v-if="selected.includes(key) && isLiveStatKey(key)" class="mt-1 pl-6">
            <TextField label="Texto de la cifra" :placeholder="defaultLabel(key)" :model-value="content[`label${capitalize(key)}`] || ''" @update:model-value="(v) => (content[`label${capitalize(key)}`] = v)" />
          </div>
          <div v-if="selected.includes(key) && isCustomStatKey(key)" class="mt-1 grid grid-cols-2 gap-2 pl-6">
            <TextField label="Cifra" placeholder="+15" :model-value="content[`customValue${key.slice(-1)}`] || ''" @update:model-value="(v) => (content[`customValue${key.slice(-1)}`] = v)" />
            <TextField label="Texto" placeholder="años de experiencia" :model-value="content[`customLabel${key.slice(-1)}`] || ''" @update:model-value="(v) => (content[`customLabel${key.slice(-1)}`] = v)" />
          </div>
        </div>
      </div>
      <p class="mt-1.5 text-[11px] text-stone-400">{{ selected.length }} seleccionada(s) · una cifra en vivo a cero no se enseña.</p>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/nosotros" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Texto, fotografía grande y columna de cifras; sin cifras, la fotografía ocupa su sitio.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ImageField from '../inspector/fields/ImageField.vue'
import { CUSTOM_STAT_KEYS, LIVE_STAT_KEYS, LIVE_STAT_LABELS, MAX_STATS, isCustomStatKey, isLiveStatKey, type LiveStatKey, type StatKey } from '~/utils/corporateBlocks'

const props = defineProps<{ content: Record<string, any>; company?: { stats?: Partial<Record<LiveStatKey, number>> | null } | null }>()

const selected = computed<StatKey[]>(() => (Array.isArray(props.content.stats) ? props.content.stats.filter((k: unknown) => isLiveStatKey(k) || isCustomStatKey(k)) : ['team', 'offices', 'properties']))
const orderedKeys = computed<StatKey[]>(() => [...selected.value, ...[...LIVE_STAT_KEYS, ...CUSTOM_STAT_KEYS].filter((k) => !selected.value.includes(k))])
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const defaultLabel = (key: LiveStatKey) => LIVE_STAT_LABELS[key].many
const labelFor = (key: StatKey) => (isLiveStatKey(key) ? LIVE_STAT_LABELS[key].inspector : `Cifra propia ${key.slice(-1)}`)
const liveValue = (key: LiveStatKey) => {
  const n = props.company?.stats?.[key]
  return typeof n === 'number' ? String(n) : '—'
}

function toggle(key: StatKey, checked: boolean) {
  const next = selected.value.filter((k) => k !== key)
  if (checked) {
    if (next.length >= MAX_STATS) return
    next.push(key)
  }
  props.content.stats = next
}
function move(key: StatKey, delta: number) {
  const next = [...selected.value]
  const i = next.indexOf(key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j], next[i]]
  props.content.stats = next
}
</script>
