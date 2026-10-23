<template>
  <div class="group relative overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md">
    <NuxtLink :to="`/admin/comerciales/${agent.id}`" class="flex items-start gap-3 p-4">
      <img v-if="agent.image" :src="mediaUrl(agent.image)" class="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line" >
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
      <NuxtLink :to="`/admin/comerciales/${agent.id}`" class="text-[12px] font-medium text-stone-600 hover:text-ink hover:underline">Editar</NuxtLink>
      <span class="ml-2 text-[12px] text-stone-400">{{ agent.assignedPropertiesCount ?? 0 }} propiedad{{ agent.assignedPropertiesCount === 1 ? '' : 'es' }}</span>
      <AdminActionsMenu
        class="ml-auto"
        :label="`Acciones de ${agent.name}`"
        trigger-class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink"
        :items="menuItems"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdminActionItem } from '~/components/admin/ActionsMenu.vue'

const STATUS_LABELS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', on_leave: 'Baja' }
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-stone-200 text-stone-600',
  on_leave: 'bg-amber-100 text-amber-700',
}

const props = defineProps<{ agent: Record<string, any> }>()
const emit = defineEmits<{ 'toggle-status': [id: number]; delete: [id: number] }>()

const menuItems = computed<AdminActionItem[]>(() => [
  {
    label: props.agent.employmentStatus === 'active' ? 'Marcar inactivo' : 'Marcar activo',
    onClick: () => emit('toggle-status', props.agent.id),
  },
  { label: 'Eliminar', danger: true, onClick: () => emit('delete', props.agent.id) },
])

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

</script>
