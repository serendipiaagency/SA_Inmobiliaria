<template>
  <AdminCommsModal :title="title" :sub="sub" test-id="lead-stage-reason-modal" @close="emit('close')">
    <form class="space-y-3" @submit.prevent="confirm">
      <div v-if="chips.length">
        <p class="mb-1.5 text-[12px] font-medium text-stone-600">Motivos rápidos</p>
        <div class="flex flex-wrap gap-1.5" data-testid="lead-stage-reason-chips">
          <button
            v-for="(c, i) in chips"
            :key="c"
            type="button"
            class="rounded-full border px-2.5 py-1 text-[12px] transition"
            :class="reason.trim() === c ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
            :aria-pressed="reason.trim() === c"
            :data-testid="`lead-stage-reason-chip-${i}`"
            @click="reason = c"
          >
            {{ c }}
          </button>
        </div>
      </div>
      <label class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo <span class="text-red-500">*</span> <span class="font-normal text-stone-400">(queda en el historial del lead)</span></span>
        <textarea
          ref="input"
          v-model="reason"
          rows="2"
          :maxlength="MAX"
          class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink"
          placeholder="Llamada hecha, quiere ver pisos en el centro…"
          data-testid="lead-stage-reason-text"
          @keydown.enter.exact.prevent="confirm"
        />
      </label>
      <p v-if="warning" class="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900" data-testid="lead-stage-reason-warning">{{ warning }}</p>
    </form>
    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" data-testid="lead-stage-reason-cancel" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="!reason.trim()" data-testid="lead-stage-reason-confirm" @click="confirm">
        {{ confirmLabel }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import { LEAD_STAGE_GENERIC_REASONS, LEAD_STAGE_QUICK_REASONS } from '~/utils/leadCatalog'

/**
 * El motivo de un movimiento en el pipeline (cierre del núcleo, FASE 13): lo
 * pide la ficha («Cambiar fase» y «Reactivar»), el Kanban al soltar una
 * tarjeta, la edición inline de la Tabla y la acción masiva «Cambiar fase».
 * Motivos rápidos en chips según la fase de destino (`toStage`, o
 * 'reactivated') que sólo rellenan el texto, y el texto es obligatorio: el
 * servidor rechaza un movimiento del panel sin motivo. «Perdido» tiene su
 * propia ventana (LeadLostModal), con el motivo del catálogo.
 */
const props = withDefaults(defineProps<{ title?: string; sub?: string; toStage?: string | null; confirmLabel?: string; warning?: string | null }>(), {
  title: 'Motivo del cambio de fase',
  sub: undefined,
  toStage: null,
  confirmLabel: 'Guardar',
  warning: null,
})
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()

const MAX = 300
const reason = ref('')
const input = ref<HTMLTextAreaElement | null>(null)
const chips = computed(() => [...(props.toStage ? LEAD_STAGE_QUICK_REASONS[props.toStage] || [] : []), ...LEAD_STAGE_GENERIC_REASONS])
onMounted(() => input.value?.focus())

function confirm() {
  const v = reason.value.trim()
  if (!v) return
  emit('confirm', v.slice(0, MAX))
}
</script>
