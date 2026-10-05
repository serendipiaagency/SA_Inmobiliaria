<template>
  <div>
    <div v-if="modelValue.length" class="mb-2 flex flex-wrap gap-1.5">
      <span
        v-for="(z, i) in modelValue"
        :key="i"
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]"
        :class="tone === 'exclude' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'"
        :data-testid="`${testPrefix}-chip`"
      >
        {{ zoneLabel(z) }}
        <span class="text-[10px] opacity-60">{{ ZONE_KIND_LABELS[zoneKindOf(z)] }}</span>
        <button type="button" class="ml-0.5 opacity-60 hover:opacity-100" :aria-label="`Quitar ${zoneLabel(z)}`" @click="remove(i)">×</button>
      </span>
    </div>
    <div class="flex flex-wrap gap-2">
      <select v-model="kind" class="rounded-lg border border-line bg-white px-2 py-2 text-[13px]" :aria-label="`Tipo de zona (${title})`" :data-testid="`${testPrefix}-kind`">
        <option v-for="k in ZONE_KINDS" :key="k" :value="k">{{ ZONE_KIND_LABELS[k] }}</option>
      </select>
      <input
        v-model="value"
        class="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
        :placeholder="placeholder"
        maxlength="120"
        :aria-label="title"
        :data-testid="`${testPrefix}-value`"
        @keydown.enter.prevent="add"
      >
      <button type="button" class="rounded-lg border border-line px-3 py-2 text-[13px] font-medium hover:bg-stone-50 disabled:opacity-50" :disabled="!value.trim()" :data-testid="`${testPrefix}-add`" @click="add">Añadir</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ZONE_KINDS, ZONE_KIND_LABELS, zoneFromInput, zoneKindOf, zoneLabel, type ZoneKind, type ZoneRefLike } from '~/utils/buyerRequirementCatalog'

/**
 * Lista de zonas estructuradas (`ZoneRef`): cada zona es UNA referencia —un
 * distrito, una localidad, un código postal o una urbanización—, nunca
 * «Chamberí, Salamanca» en un texto. El motor compara cada tipo con su campo
 * de la ficha del inmueble (distrito con distrito, CP con CP…).
 */
const props = withDefaults(defineProps<{ modelValue: ZoneRefLike[]; title: string; testPrefix: string; tone?: 'include' | 'exclude' }>(), { tone: 'include' })
const emit = defineEmits<{ 'update:modelValue': [value: ZoneRefLike[]] }>()

const kind = ref<ZoneKind>('district')
const value = ref('')
const placeholder = computed(() => ({ district: 'Chamberí', city: 'Madrid', postalCode: '28010', label: 'La Moraleja' })[kind.value])

function add() {
  const zone = zoneFromInput(kind.value, value.value)
  if (!zone) return
  const key = JSON.stringify(zone).toLowerCase()
  if (!props.modelValue.some((z) => JSON.stringify(z).toLowerCase() === key)) emit('update:modelValue', [...props.modelValue, zone])
  value.value = ''
}

function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
</script>
