<template>
  <span class="inline-flex">
    <button
      type="button"
      class="rounded px-1.5 py-0.5 font-semibold hover:ring-1 hover:ring-ink/20"
      :class="[scoreCls(lead.score), compact ? 'text-[10px]' : 'text-xs']"
      :title="lead.scoreComputedAt ? 'Ver por qué tiene esta puntuación' : 'Puntuación heredada, sin desglose — ver o recalcular'"
      :data-testid="`lead-score-${lead.id}`"
      @click.stop="openDetail"
    >
      {{ lead.score }}<span v-if="!lead.scoreComputedAt" class="ml-0.5 opacity-60">*</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="open = false">
        <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" data-testid="lead-score-detail">
          <div class="mb-1 flex items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold">¿Por qué {{ detail?.score ?? lead.score }}/100?</h3>
              <p class="text-xs text-stone-500">{{ lead.name }}</p>
            </div>
            <button type="button" class="text-stone-400 hover:text-ink" aria-label="Cerrar" @click="open = false">✕</button>
          </div>

          <p v-if="loading" class="py-6 text-center text-sm text-stone-400">Cargando…</p>
          <p v-else-if="error" class="py-6 text-center text-sm text-red-600">{{ error }}</p>
          <template v-else-if="detail">
            <p v-if="!detail.breakdown" class="my-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="lead-score-legacy">
              Esta puntuación viene del sistema anterior (sumaba puntos fijos en cada contacto) y no tiene desglose. Recalcúlala para obtenerla de señales reales.
            </p>
            <ul v-else class="my-3 space-y-1.5" data-testid="lead-score-breakdown">
              <li v-for="b in detail.breakdown" :key="b.criterion" class="flex items-start gap-2 text-[13px]" :class="b.applied ? '' : 'text-stone-400'">
                <span class="w-10 shrink-0 text-right font-semibold tabular-nums" :class="b.applied ? (b.points >= 0 ? 'text-emerald-700' : 'text-red-600') : ''">
                  {{ b.applied ? (b.points >= 0 ? `+${b.points}` : b.points) : '—' }}
                </span>
                <span class="min-w-0">
                  <span class="font-medium" :class="b.applied ? 'text-ink' : ''">{{ b.label }}</span>
                  <span class="block text-[11px]">{{ b.detail }}</span>
                </span>
              </li>
            </ul>
            <p v-if="detail.computedAt" class="text-[11px] text-stone-400">
              Calculada {{ formatDateTime(detail.computedAt) }} · reglas de la agencia (motor v{{ detail.engineVersion }}). No es la compatibilidad con un inmueble: eso es el Matching.
            </p>

            <div v-if="detail.history.length > 1" class="mt-4 border-t border-line pt-3">
              <h4 class="mb-1.5 text-xs font-semibold text-stone-500">Historial</h4>
              <ul class="space-y-1 text-[12px] text-stone-600" data-testid="lead-score-history">
                <li v-for="h in detail.history" :key="h.id" class="flex justify-between gap-3">
                  <span class="font-semibold tabular-nums">{{ h.score }}</span>
                  <span class="text-stone-400">{{ reasonLabel(h.reason) }} · {{ formatDateTime(h.createdAt) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="canWrite('crm')" class="mt-4 flex justify-end">
              <button type="button" class="btn-secondary !px-3 !py-1.5 text-xs" :disabled="recalculating" data-testid="lead-score-recalculate" @click="recalculate">
                {{ recalculating ? 'Recalculando…' : 'Recalcular con las señales actuales' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'

/**
 * FASE 32 — el Lead Score con su «¿por qué?»: desglose de cada criterio real
 * (aplicado o no, con el dato que lo justifica), historial y recálculo. Lo
 * calcula server/utils/leads/score.ts; aquí sólo se enseña.
 */
const props = defineProps<{ lead: { id: number; name: string; score: number; scoreComputedAt?: string | null }; compact?: boolean }>()
const emit = defineEmits<{ updated: [{ score: number; scoreComputedAt: string | null }] }>()
const { canWrite } = useAdminPermissions()
const toast = useToast()

const open = ref(false)
const loading = ref(false)
const recalculating = ref(false)
const error = ref('')
const detail = ref<any>(null)

function scoreCls(s: number) {
  if (s >= 75) return 'bg-emerald-50 text-emerald-700'
  if (s >= 45) return 'bg-amber-50 text-amber-700'
  return 'bg-stone-100 text-stone-500'
}
const REASONS: Record<string, string> = { created: 'alta', signal: 'nueva señal', rules: 'cambio de reglas', manual: 'recálculo manual', expiry: 'caducó una señal' }
function reasonLabel(r: string) {
  return REASONS[r] || r
}

async function openDetail() {
  open.value = true
  loading.value = true
  error.value = ''
  try {
    detail.value = await $fetch('/api/admin/saas/leads', { query: { scoreFor: props.lead.id } })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar el desglose'
  } finally {
    loading.value = false
  }
}

async function recalculate() {
  recalculating.value = true
  try {
    detail.value = await $fetch(`/api/admin/saas/leads/${props.lead.id}`, { method: 'PATCH', body: { score: 'recalculate' } })
    emit('updated', { score: detail.value.score, scoreComputedAt: detail.value.computedAt })
    toast.success('Puntuación recalculada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo recalcular')
  } finally {
    recalculating.value = false
  }
}
</script>
