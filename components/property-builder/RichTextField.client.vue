<template>
  <div>
    <div class="flex items-center gap-1 border border-b-0 border-line bg-stone-50 px-1.5 py-1">
      <button type="button" class="rt-btn" :class="{ 'rt-btn-on': active.bold }" title="Negrita" @mousedown.prevent="exec('bold')"><strong>N</strong></button>
      <button type="button" class="rt-btn italic" :class="{ 'rt-btn-on': active.italic }" title="Cursiva" @mousedown.prevent="exec('italic')">C</button>
      <span class="mx-1 h-4 w-px bg-line" />
      <button type="button" class="rt-btn" title="Lista" @mousedown.prevent="exec('insertUnorderedList')">•</button>
      <button type="button" class="rt-btn" title="Lista numerada" @mousedown.prevent="exec('insertOrderedList')">1.</button>
      <span class="mx-1 h-4 w-px bg-line" />
      <button type="button" class="rt-btn" title="Enlace" @mousedown.prevent="addLink">🔗</button>
      <button type="button" class="rt-btn ml-auto text-stone-400" title="Quitar formato" @mousedown.prevent="clear">Limpiar</button>
    </div>
    <div
      ref="editorEl"
      class="input min-h-[8rem] focus:outline-none [&_a]:text-accent-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      contenteditable="true"
      @input="onInput"
      @blur="onInput"
    />
    <p class="mt-1 text-[11px] text-stone-400">Negrita, cursiva, listas y enlaces — se publica tal cual en la ficha pública.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Minimal rich-text editor for long-form description fields (P2, redesign
 * megaprompt) — just enough formatting to be useful (bold, italic, lists,
 * links), not a full page builder. Stores its content as an HTML string in
 * the same text column the plain textarea used to write to; the public
 * template that renders it switches from `{{ }}` to `v-html` accordingly.
 * Client-only (contenteditable needs `document`) — the .client.vue suffix
 * handles that, same convention as LocationPicker.client.vue.
 */
const props = defineProps<{ modelValue: string | null | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editorEl = ref<HTMLDivElement | null>(null)
const active = reactive({ bold: false, italic: false })

onMounted(() => {
  if (editorEl.value) editorEl.value.innerHTML = props.modelValue || ''
  document.addEventListener('selectionchange', updateActiveState)
})
onBeforeUnmount(() => document.removeEventListener('selectionchange', updateActiveState))

function updateActiveState() {
  if (!editorEl.value || document.activeElement !== editorEl.value) return
  active.bold = document.queryCommandState('bold')
  active.italic = document.queryCommandState('italic')
}

function onInput() {
  emit('update:modelValue', editorEl.value?.innerHTML || '')
}

// execCommand is deprecated but still the only cross-browser way to drive a
// contenteditable's undo-aware formatting without a full editor library —
// acceptable for this toolbar's narrow surface (bold/italic/lists/links).
function exec(command: string) {
  editorEl.value?.focus()
  document.execCommand(command)
  onInput()
  updateActiveState()
}

function addLink() {
  const url = window.prompt('URL del enlace (https://…)')
  if (!url) return
  editorEl.value?.focus()
  document.execCommand('createLink', false, url)
  onInput()
}

function clear() {
  if (editorEl.value) editorEl.value.innerHTML = ''
  onInput()
}
</script>

<style scoped>
.rt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.35rem;
  border-radius: 0.35rem;
  font-size: 12px;
  font-weight: 600;
  color: #57534e;
}
.rt-btn:hover {
  background: #e7e4de;
}
.rt-btn-on {
  background: #16150f;
  color: #fff;
}
</style>
