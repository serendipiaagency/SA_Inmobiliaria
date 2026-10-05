<template>
  <AdminCommsModal title="Marcar como perdido" :sub="`${name} — el motivo queda en el historial del lead.`" test-id="lead-lost-modal" @close="emit('close')">
    <div class="space-y-3">
      <fieldset class="space-y-1.5">
        <legend class="mb-1 text-[12px] font-medium text-stone-600">Motivo</legend>
        <label v-for="r in LEAD_LOST_REASONS" :key="r" class="flex items-center gap-2 text-sm">
          <input v-model="reason" type="radio" name="lead-lost-reason" :value="r" :data-testid="`lead-lost-reason-${r}`" >
          {{ LEAD_LOST_REASON_LABELS[r] }}
        </label>
      </fieldset>
      <label class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Comentario (opcional)</span>
        <textarea v-model="note" rows="2" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="lead-lost-note" />
      </label>
    </div>
    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="!reason" data-testid="lead-lost-confirm" @click="emit('confirm', { lostReason: reason, note: note.trim() || null })">
        Marcar como perdido
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import { LEAD_LOST_REASONS, LEAD_LOST_REASON_LABELS } from '~/utils/leadCatalog'

/** Perder un lead pide motivo del catálogo (No responde, No interesado, Duplicado, otro) y, si se quiere, un comentario. */
defineProps<{ name: string }>()
const emit = defineEmits<{ close: []; confirm: [value: { lostReason: string; note: string | null }] }>()
const reason = ref<string>('')
const note = ref('')
</script>
