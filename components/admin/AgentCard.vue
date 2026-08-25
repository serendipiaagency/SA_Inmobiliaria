<template>
  <div class="group relative overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md">
    <NuxtLink :to="`/admin/agents/${agent.id}`" class="flex items-start gap-3 p-4">
      <img v-if="agent.image" :src="mediaUrl(agent.image)" class="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line" />
      <span v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-stone-100 text-lg font-semibold text-stone-400">{{ initials }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate font-medium text-ink">{{ agent.name }}</p>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            :class="STATUS_CLASS[agent.employmentStatus] || 'bg-stone-100 text-stone-500'"
          >{{ STATUS_LABELS[agent.employmentStatus] || agent.employmentStatus }}</span>
        </div>
        <p class="truncate text-[13px] text-stone-500">{{ agent.position }}</p>
        <p v-if="agent.officeName || agent.department" class="mt-0.5 truncate text-[12px] text-stone-400">
          {{ [agent.officeName, agent.department].filter(Boolean).join(' · ') }}
        </p>
        <p v-if="firstZone" class="mt-0.5 truncate text-[12px] text-stone-400">📍 {{ firstZone }}</p>
      </div>
    </NuxtLink>

    <div class="flex items-center gap-1 border-t border-line px-3 py-2">
      <NuxtLink :to="`/admin/agents/${agent.id}`" class="text-[12px] font-medium text-stone-600 hover:text-ink hover:underline">Editar</NuxtLink>
      <span class="ml-2 text-[12px] text-stone-400">{{ agent.assignedPropertiesCount ?? 0 }} propiedad{{ agent.assignedPropertiesCount === 1 ? '' : 'es' }}</span>
      <div ref="menuRoot" class="relative ml-auto">
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-ink" @click.stop="menuOpen = !menuOpen">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        <div v-if="menuOpen" class="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-line bg-white py-1 text-[13px] shadow-lg">
          <button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-stone-50" @click="act('toggle-status')">
            {{ agent.employmentStatus === 'active' ? 'Marcar inactivo' : 'Marcar activo' }}
          </button>
          <button type="button" class="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50" @click="act('delete')">Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const STATUS_LABELS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', on_leave: 'Baja' }
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-stone-200 text-stone-600',
  on_leave: 'bg-amber-100 text-amber-700',
}

const props = defineProps<{ agent: Record<string, any> }>()
const emit = defineEmits<{ 'toggle-status': [id: number]; delete: [id: number] }>()

const initials = computed(() =>
  String(props.agent.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join(''),
)

const firstZone = computed(() => {
  try {
    const parsed = JSON.parse(props.agent.zones || '[]')
    return Array.isArray(parsed) ? parsed[0] : null
  } catch {
    return null
  }
})

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (!menuRoot.value?.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function act(action: 'toggle-status' | 'delete') {
  menuOpen.value = false
  emit(action as any, props.agent.id)
}
</script>
