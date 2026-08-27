<template>
  <div class="thin-scroll flex items-start gap-1 overflow-x-auto pb-1">
    <template v-for="(s, i) in steps" :key="s.key">
      <button type="button" class="flex shrink-0 items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-stone-50" @click="$emit('select', s.key)">
        <span
          class="step-num"
          :class="active === s.key ? 'step-num-active' : state(s) === 'complete' ? 'step-num-complete' : state(s) === 'error' ? 'step-num-error' : ''"
        >
          <svg v-if="state(s) === 'complete' && active !== s.key" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="min-w-0">
          <span class="block whitespace-nowrap text-[12.5px] font-semibold leading-tight" :class="active === s.key ? 'text-ink' : 'text-stone-600'">{{ s.label }}</span>
          <span class="block whitespace-nowrap text-[10.5px] leading-tight text-stone-400">{{ s.subtitle }}</span>
        </span>
      </button>
      <span v-if="i < steps.length - 1" class="mt-3.5 h-px w-3 shrink-0 bg-line" />
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  steps: { key: string; label: string; subtitle: string }[]
  active: string
  sectionState: (key: string) => 'complete' | 'error' | 'neutral'
}>()
defineEmits<{ select: [key: string] }>()

function state(s: { key: string }) {
  return props.sectionState(s.key)
}
</script>

<style scoped>
.step-num {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1.5px solid #e7e5e4;
  font-size: 12px;
  font-weight: 700;
  color: #a8a29e;
}
.step-num-active {
  border-color: #16150f;
  background: #16150f;
  color: #fff;
}
.step-num-complete {
  border-color: #10b981;
  color: #10b981;
}
.step-num-error {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
