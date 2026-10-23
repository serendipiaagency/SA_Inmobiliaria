<template>
  <AdminActionsMenu :label="`Acciones de ${client.name}`" :items="items" />
</template>

<script setup lang="ts">
import { useClientActions } from '~/composables/useClientActions'
import type { AdminActionItem } from '~/components/admin/ActionsMenu.vue'

const props = defineProps<{ client: { id: number; name: string } }>()
const emit = defineEmits<{ deleted: [] }>()
const { deleteClient } = useClientActions()

const items = computed<AdminActionItem[]>(() => [
  { label: 'Ver perfil', to: `/admin/clientes/${props.client.id}` },
  { label: 'Editar', to: `/admin/clientes/${props.client.id}/editar` },
  { label: 'Eliminar', danger: true, divider: true, onClick: remove },
])

async function remove() {
  if (await deleteClient(props.client)) emit('deleted')
}
</script>
