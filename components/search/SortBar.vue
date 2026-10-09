<template>
  <div ref="root" class="sb" role="group" :aria-label="t('sort.label', 'Ordenar por')" data-testid="sort-bar">
    <span class="sb-label">{{ t('sort.label', 'Ordenar por') }}:</span>
    <div class="sb-group">
      <button
        v-for="k in QUICK_SORTS"
        :key="k || 'relevance'"
        type="button"
        class="sb-btn"
        :class="{ 'sb-on': modelValue === k }"
        :aria-pressed="modelValue === k"
        :data-testid="`sort-${k || 'relevance'}`"
        @click="choose(k)"
      >
        {{ label(k) }}
      </button>
      <div class="sb-more">
        <button
          type="button"
          class="sb-btn sb-more-btn"
          :class="{ 'sb-on': isMore }"
          :aria-expanded="open"
          aria-haspopup="menu"
          data-testid="sort-more"
          @click="open = !open"
          @keydown.escape="open = false"
        >
          {{ isMore ? label(modelValue) : t('sort.more', 'Más') }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ 'rotate-180': open }"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div v-if="open" class="sb-menu" role="menu" data-testid="sort-menu" @keydown.escape="open = false">
          <button
            v-for="k in MORE_SORTS"
            :key="k"
            type="button"
            role="menuitemradio"
            class="sb-item"
            :class="{ 'sb-item-on': modelValue === k }"
            :aria-checked="modelValue === k"
            :data-testid="`sort-${k}`"
            @click="choose(k)"
          >
            {{ label(k) }}
            <svg v-if="modelValue === k" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MORE_SORTS, QUICK_SORTS, SORT_LABELS, type SortKey } from '~/utils/searchState'

/**
 * «Ordenar por: Relevancia | Baratos | Recientes | Más ▾» del catálogo. Las
 * ocho ordenaciones (utils/searchState.ts) las hace el servidor sobre todos
 * los resultados, antes de paginar; aquí sólo se elige. La elegida va en la
 * URL (`sort`) y se conserva al filtrar, al cambiar Galería/Mapa y al paginar.
 */
const props = defineProps<{ modelValue: SortKey }>()
const emit = defineEmits<{ 'update:modelValue': [SortKey] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const isMore = computed(() => MORE_SORTS.includes(props.modelValue))
const label = (k: SortKey) => t(SORT_LABELS[k][0], SORT_LABELS[k][1])

function choose(k: SortKey) {
  open.value = false
  if (k !== props.modelValue) emit('update:modelValue', k)
}
function onDocDown(e: Event) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))
</script>

<style scoped>
.sb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.sb-label {
  font-size: 13px;
  color: #57534e;
}
.sb-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  border: 1px solid #e7e2d9;
  border-radius: 999px;
  background: #fff;
  padding: 3px;
}
.sb-btn {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  color: #57534e;
  transition: background-color 0.15s, color 0.15s;
}
.sb-btn:hover {
  color: #1c1b19;
}
.sb-on {
  background: #1c1b19;
  color: #fff;
}
.sb-on:hover {
  color: #fff;
}
.sb-more {
  position: relative;
}
.sb-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 50;
  min-width: 220px;
  border-radius: 14px;
  border: 1px solid #ece8e1;
  background: #fff;
  padding: 6px;
  box-shadow: 0 18px 40px -16px rgba(28, 27, 25, 0.28);
}
.sb-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  padding: 9px 10px;
  text-align: left;
  font-size: 13.5px;
  color: #1c1b19;
}
.sb-item:hover {
  background: #f5f2ec;
}
.sb-item-on {
  font-weight: 700;
}
</style>
