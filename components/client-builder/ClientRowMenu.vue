<template>
  <div ref="root" class="relative inline-block text-left">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-ink"
      :aria-label="`Acciones de ${client.name}`"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>

    <div v-if="open" class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white py-1 text-left shadow-lg">
      <NuxtLink :to="`/admin/clientes/${client.id}`" class="block px-3 py-2 text-[13px] text-stone-600 hover:bg-stone-50 hover:text-ink" @click="open = false">Ver perfil</NuxtLink>
      <NuxtLink :to="`/admin/clientes/${client.id}/editar`" class="block px-3 py-2 text-[13px] text-stone-600 hover:bg-stone-50 hover:text-ink" @click="open = false">Editar</NuxtLink>
      <span class="my-1 block h-px bg-line" />
      <button type="button" class="block w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50" @click="remove">Eliminar</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClientActions } from '~/composables/useClientActions'

/**
 * Las acciones rápidas del listado. No implementan nada propio: enlazan a las
 * mismas rutas que la ficha y llaman al mismo `deleteClient`, así que la
 * confirmación de borrado es idéntica se pulse donde se pulse.
 */
const props = defineProps<{ client: { id: number; name: string } }>()
const emit = defineEmits<{ deleted: [] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const { deleteClient } = useClientActions()

function onDocClick(e: MouseEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

async function remove() {
  open.value = false
  if (await deleteClient(props.client)) emit('deleted')
}
</script>
