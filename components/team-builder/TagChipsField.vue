<template>
  <div>
    <span v-if="label" class="label">{{ label }}</span>
    <div class="flex flex-wrap items-center gap-2">
      <span v-for="(v, i) in modelValue" :key="i" class="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[12px] text-stone-700">
        {{ v }}
        <button type="button" class="text-stone-400 hover:text-red-600" @click="remove(i)">×</button>
      </span>
      <span v-if="!adding" class="flex items-center">
        <button type="button" class="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-[12px] font-medium text-stone-500 hover:border-ink hover:text-ink" @click="startAdd">
          + {{ addLabel }}
        </button>
      </span>
      <span v-else class="flex items-center gap-1.5">
        <input ref="inputEl" v-model="draft" class="input !h-7 !w-40 !py-0 text-[12px]" :placeholder="placeholder" @keyup.enter="commit" @keyup.esc="cancel" @blur="commit" >
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ label?: string; modelValue: string[]; addLabel?: string; placeholder?: string }>(), {
  addLabel: 'Añadir',
  placeholder: '',
})
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const adding = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function startAdd() {
  adding.value = true
  draft.value = ''
  nextTick(() => inputEl.value?.focus())
}
function commit() {
  const v = draft.value.trim()
  if (v && !props.modelValue.includes(v)) emit('update:modelValue', [...props.modelValue, v])
  draft.value = ''
  adding.value = false
}
function cancel() {
  draft.value = ''
  adding.value = false
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
</script>
