<template>
  <span class="text-[11px] text-stone-400" data-testid="created-by" :data-deleted="createdByDeleted ? '1' : undefined">
    <template v-if="createdByName">Creado por <span class="font-medium text-stone-500">{{ createdByName }}</span></template>
    <template v-else-if="createdByDeleted">Creado por <span class="italic">usuario eliminado</span></template>
    <template v-else>Creado</template>
    <template v-if="createdAt"> el {{ formatDateTime(createdAt) }}</template>
  </span>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'

/**
 * «Creado por X el Y» (FASE 0, cierre D3a) — la misma línea en la ficha del
 * lead, del contacto, de la cita, de la operación y en cada tarea. El nombre
 * lo resuelve el servidor (`createdByName`, sólo usuarios de la agencia);
 * `createdByDeleted` = tenía autor pero ese usuario ya no existe. Sin autor
 * (reserva pública, una automatización) sólo se dice cuándo.
 */
withDefaults(defineProps<{ createdByName?: string | null; createdByDeleted?: boolean; createdAt?: string | null }>(), {
  createdByName: null,
  createdByDeleted: false,
  createdAt: null,
})
</script>
