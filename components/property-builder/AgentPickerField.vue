<template>
  <div class="block" :class="span === 2 ? 'sm:col-span-2' : ''">
    <span class="label">{{ label }}</span>
    <div ref="root" class="relative">
      <button type="button" class="input flex w-full items-center gap-2 text-left" @click="open = !open">
        <template v-if="selected">
          <img v-if="selected.image" :src="mediaUrl(selected.image)" class="h-6 w-6 shrink-0 rounded-full object-cover" >
          <span v-else class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-400">{{ initials(selected.name) }}</span>
          <span class="min-w-0 flex-1 truncate">
            {{ selected.name }}
            <span v-if="selected.position" class="text-stone-400"> · {{ selected.position }}</span>
          </span>
          <span class="shrink-0 text-stone-300 hover:text-red-500" title="Quitar" @click.stop="select(null)">✕</span>
        </template>
        <span v-else class="text-stone-400">Sin asignar</span>
      </button>

      <div v-if="open" class="absolute z-20 mt-1 max-h-64 w-full min-w-[16rem] overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
        <button type="button" class="block w-full px-3 py-2 text-left text-[13px] text-stone-500 hover:bg-stone-50" @click="select(null)">Sin asignar</button>
        <button
          v-for="a in options"
          :key="a.id"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-stone-50"
          @click="select(a)"
        >
          <img v-if="a.image" :src="mediaUrl(a.image)" class="h-7 w-7 shrink-0 rounded-full object-cover" >
          <span v-else class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-400">{{ initials(a.name) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-ink">{{ a.name }}</span>
            <span class="block truncate text-[11px] text-stone-400">{{ [a.position, a.officeName].filter(Boolean).join(' · ') || '—' }}</span>
          </span>
        </button>
        <p v-if="!loading && options.length === 0" class="px-3 py-2 text-[12px] text-stone-400">No hay comerciales dados de alta todavía.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; modelValue: number | null; span?: 1 | 2 }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const open = ref(false)
const loading = ref(true)
const options = ref<any[]>([])
const root = ref<HTMLElement | null>(null)

const selected = computed(() => options.value.find((a) => a.id === props.modelValue) || null)

function initials(name: string) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function select(a: any) {
  emit('update:modelValue', a ? a.id : null)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
onMounted(async () => {
  document.addEventListener('click', onDocClick)
  try {
    const res = await $fetch<{ rows: any[] }>('/api/admin/team', { query: { perPage: 200 } })
    options.value = res.rows
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
