<template>
  <div ref="root" class="relative">
    <div
      class="flex items-center gap-3 border border-line bg-white px-4 transition-shadow focus-within:shadow-lg"
      :class="rounded ? 'rounded-full' : 'rounded-xl'"
    >
      <svg class="h-5 w-5 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.3-4.3m1.8-5.2a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref="input"
        :value="modelValue"
        class="w-full bg-transparent py-3 text-[15px] text-ink placeholder:text-stone-400 focus:outline-none"
        :placeholder="placeholder"
        autocomplete="off"
        @input="onInput"
        @focus="onFocus"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="open = false"
      />
      <button
        v-if="modelValue"
        type="button"
        class="shrink-0 text-stone-400 transition hover:text-ink"
        aria-label="Limpiar"
        @click="clear"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <transition name="dd">
      <div
        v-if="open && groups.length"
        class="absolute left-0 right-0 z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-2xl"
      >
        <div v-for="(g, gi) in groups" :key="g.type" :class="{ 'mt-1': gi > 0 }">
          <p class="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ g.label }}</p>
          <button
            v-for="(item, ii) in g.items"
            :key="ii"
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition"
            :class="flatIndex(gi, ii) === active ? 'bg-paper' : 'hover:bg-paper'"
            @mouseenter="active = flatIndex(gi, ii)"
            @click="choose(g, item)"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-stone-500">
              <span v-html="icon(g.type)" />
            </span>
            <span class="truncate text-ink">{{ label(item) }}</span>
            <span v-if="g.type === 'reference'" class="ml-auto text-[11px] uppercase tracking-widest text-stone-400">
              Ver ficha →
            </span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ modelValue: string; placeholder?: string; rounded?: boolean; autofocus?: boolean }>(),
  { placeholder: 'Ciudad, barrio, calle o referencia…', rounded: false, autofocus: false },
)
const emit = defineEmits<{
  'update:modelValue': [string]
  select: [{ type: string; value: string; slug?: string }]
  enter: []
}>()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const open = ref(false)
const active = ref(-1)
const groups = ref<any[]>([])
let timer: any = null

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v)
  scheduleFetch(v)
  open.value = true
}
function onFocus() {
  open.value = true
  if (!groups.value.length) scheduleFetch(props.modelValue, true)
}
function scheduleFetch(q: string, immediate = false) {
  clearTimeout(timer)
  timer = setTimeout(fetchSuggest, immediate ? 0 : 160, q)
}
async function fetchSuggest(q: string) {
  try {
    const res = await $fetch<{ groups: any[] }>('/api/public/suggest', { query: { q } })
    groups.value = res.groups || []
    active.value = -1
  } catch {
    groups.value = []
  }
}

const flat = computed(() => {
  const out: { gi: number; ii: number; g: any; item: any }[] = []
  groups.value.forEach((g, gi) => g.items.forEach((item: any, ii: number) => out.push({ gi, ii, g, item })))
  return out
})
function flatIndex(gi: number, ii: number) {
  return flat.value.findIndex((f) => f.gi === gi && f.ii === ii)
}
function move(d: number) {
  if (!open.value) open.value = true
  const n = flat.value.length
  if (!n) return
  active.value = (active.value + d + n) % n
}
function onEnter() {
  if (active.value >= 0 && flat.value[active.value]) {
    const { g, item } = flat.value[active.value]
    choose(g, item)
  } else {
    open.value = false
    emit('enter')
  }
}
function label(item: any) {
  return typeof item === 'string' ? item : item.name
}
function choose(g: any, item: any) {
  const value = label(item)
  if (g.type === 'reference' && item.slug) {
    emit('select', { type: g.type, value, slug: item.slug })
  } else {
    emit('update:modelValue', value)
    emit('select', { type: g.type, value })
    emit('enter')
  }
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
  input.value?.focus()
  scheduleFetch('', true)
}
function icon(type: string) {
  if (type === 'city')
    return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01"/></svg>'
  if (type === 'reference')
    return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9.5L12 3l9 6.5V21H3z"/></svg>'
  if (type === 'street')
    return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3 5 21M17 3l4 18M10.5 9h5M9.5 15h7"/></svg>'
  if (type === 'postal_code')
    return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z"/></svg>'
  return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
}

function onDoc(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDoc)
  if (props.autofocus) input.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('click', onDoc))
</script>

<style scoped>
.dd-enter-active,
.dd-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}
.dd-enter-from,
.dd-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
