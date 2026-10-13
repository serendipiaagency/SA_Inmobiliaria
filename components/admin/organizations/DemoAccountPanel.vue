<template>
  <section class="card mb-6 p-5" data-testid="demo-account-panel">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">Cuenta demo comercial · Norte Astur Inmobiliaria</h2>
        <p class="mt-1 max-w-2xl text-sm text-stone-500">
          Empresa ficticia de Asturias con seis meses de actividad para enseñar la plataforma. Está aislada, marcada como demo y no envía nada fuera de la plataforma.
          Acceso de la gerente: <span class="font-medium text-ink">demo@portalinmo</span>.
        </p>
      </div>
      <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="badgeClass" data-testid="demo-status">{{ statusLabel }}</span>
    </div>

    <div v-if="progress && active" class="mt-4">
      <div class="h-2 overflow-hidden rounded-full bg-stone-100">
        <div class="h-full rounded-full bg-emerald-600 transition-all" :style="{ width: `${percent}%` }" />
      </div>
      <p class="mt-2 text-xs text-stone-500" data-testid="demo-progress">
        {{ phaseText }}
        <span v-if="progress.lastStep"> · último: {{ progress.lastStep }}</span>
        <span v-if="progress.busy"> · el cron está ejecutando un tramo ahora mismo</span>
      </p>
      <p class="mt-1 text-xs text-stone-400">Sigue sola con el cron de cada minuto; mientras esta pantalla esté abierta también avanza desde aquí.</p>
    </div>

    <div v-if="progress?.status === 'ready'" class="mt-3 space-y-1 text-sm text-stone-600" data-testid="demo-ready-info">
      <p>Generada el {{ progress.finishedAt }} con la historia anclada al {{ progress.anchorDay }}.</p>
      <p v-if="progress.snapshotAt">Instantánea del estado sembrado guardada el {{ progress.snapshotAt }}: «Restablecer» vuelve a ella sin tocar las imágenes.</p>
      <p v-if="progress.pendingSteps" class="text-amber-700" data-testid="demo-pending-steps">
        El código tiene {{ progress.pendingSteps }} {{ progress.pendingSteps === 1 ? 'paso nuevo' : 'pasos nuevos' }} que esta demo aún no tiene: «Restablecer» los aplica.
      </p>
      <p v-if="progress.legacy" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="demo-legacy">
        Esta demo se generó con una versión anterior y no tiene instantánea: el primer «Restablecer» la regenera entera (una sola vez, unos minutos). A partir de ahí los
        restablecimientos conservan lo sembrado y las imágenes.
      </p>
    </div>
    <p v-if="progress?.error" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="demo-error">{{ progress.error }}</p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button v-if="!progress || progress.status === 'idle'" class="btn-primary" :disabled="working" data-testid="demo-create" @click="create">Crear la cuenta demo</button>
      <template v-if="progress && (progress.status === 'ready' || progress.status === 'failed')">
        <template v-if="confirming === null">
          <button class="btn-primary" :disabled="working" data-testid="demo-reset" @click="confirming = 'reset'">Restablecer la demo</button>
          <button class="btn-secondary" :disabled="working" data-testid="demo-regenerate" @click="confirming = 'regenerate'">Regenerar desde cero…</button>
        </template>
        <template v-else-if="confirming === 'reset'">
          <button class="btn-primary" :disabled="working" data-testid="demo-reset-confirm" @click="reset">Sí, restablecer</button>
          <button class="btn-secondary" @click="cancelConfirm">Cancelar</button>
        </template>
        <template v-else>
          <input v-model="confirmText" class="input !w-72" placeholder="Escribe norte-astur-inmobiliaria" data-testid="demo-regenerate-confirm" >
          <button class="btn-primary !bg-red-600" :disabled="confirmText !== slug || working" data-testid="demo-regenerate-go" @click="regenerate">Borrar y volver a generar</button>
          <button class="btn-secondary" @click="cancelConfirm">Cancelar</button>
        </template>
      </template>
    </div>
    <p v-if="confirming === 'reset'" class="mt-2 text-xs text-stone-500" data-testid="demo-reset-help">
      Quita lo que hayan dejado los visitantes (contactos, cambios, ficheros subidos) y vuelve al estado sembrado desde su instantánea: conserva las imágenes y todo lo que
      viene del código, y aplica los pasos que el código haya añadido desde entonces. No cambia la fecha de anclaje. No afecta a ninguna otra empresa.
    </p>
    <p v-else-if="confirming === 'regenerate'" class="mt-2 text-xs text-stone-500">
      Borra todo lo de la empresa demo, ficheros incluidos, y la vuelve a generar desde cero con la historia anclada a hoy (unos minutos). Sólo hace falta para re-anclar la
      fecha o si no hay instantánea. No afecta a ninguna otra empresa.
    </p>
  </section>
</template>

<script setup lang="ts">
interface DemoProgress {
  status: 'idle' | 'provisioning' | 'resetting' | 'restoring' | 'updating' | 'snapshotting' | 'ready' | 'failed'
  orgId: number | null
  stepIndex: number
  total: number | null
  lastStep: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  anchorDay: string | null
  busy: boolean
  snapshotAt: string | null
  pendingSteps: number
  legacy: boolean
}
const ACTIVE = ['provisioning', 'resetting', 'restoring', 'updating', 'snapshotting']

const slug = 'norte-astur-inmobiliaria'
const toast = useToast()
const progress = ref<DemoProgress | null>(null)
const working = ref(false)
const confirming = ref<null | 'reset' | 'regenerate'>(null)
const confirmText = ref('')
let stopped = false

const call = (action: string, extra: Record<string, unknown> = {}) => $fetch<DemoProgress>('/api/admin/organizations', { method: 'POST', body: { action, ...extra } })

const active = computed(() => Boolean(progress.value && ACTIVE.includes(progress.value.status)))
const percent = computed(() => {
  const p = progress.value
  if (!p) return 3
  if (p.status === 'restoring' || p.status === 'snapshotting') return 50
  if (!p.total) return 3
  return Math.max(3, Math.min(100, Math.round((p.stepIndex / p.total) * 100)))
})
const phaseText = computed(() => {
  const p = progress.value
  if (!p) return ''
  if (p.status === 'resetting') return 'Borrando los datos anteriores de la demo…'
  if (p.status === 'restoring') return 'Restableciendo desde la instantánea sembrada (las imágenes no se tocan)…'
  if (p.status === 'updating') return `Aplicando los pasos nuevos del código${p.total ? ` (${p.total})` : ''}…`
  if (p.status === 'snapshotting') return 'Guardando la instantánea del estado sembrado…'
  return `Paso ${p.stepIndex}${p.total ? ` de ${p.total}` : ''}`
})
const statusLabel = computed(
  () =>
    ({ idle: 'No creada', provisioning: 'Generando', resetting: 'Regenerando', restoring: 'Restableciendo', updating: 'Actualizando', snapshotting: 'Guardando instantánea', ready: 'Lista', failed: 'Con error' })[
      progress.value?.status ?? 'idle'
    ] ?? '—',
)
const badgeClass = computed(() => {
  const s = progress.value?.status
  if (s === 'ready') return 'bg-emerald-50 text-emerald-700'
  if (s === 'failed') return 'bg-red-50 text-red-700'
  if (active.value) return 'bg-amber-50 text-amber-700'
  return 'bg-stone-100 text-stone-600'
})

/** Mientras hay trabajo, cada llamada ejecuta un tramo (el cron hace lo mismo cada minuto). */
async function drive() {
  while (!stopped && progress.value && ACTIVE.includes(progress.value.status)) {
    try {
      progress.value = await call('demo-advance')
    } catch (e: any) {
      toast.error(e?.data?.statusMessage || 'No se pudo avanzar la demo')
      return
    }
    // Si el cron tiene el tramo en curso, se espera un poco antes de volver a pedir.
    await new Promise((r) => setTimeout(r, progress.value?.busy ? 8000 : 400))
  }
}

async function create() {
  working.value = true
  try {
    progress.value = await call('demo-create')
    drive()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la demo')
  } finally {
    working.value = false
  }
}

async function reset() {
  working.value = true
  try {
    progress.value = await call('demo-reset', { confirm: true })
    cancelConfirm()
    toast.success(progress.value?.status === 'resetting' ? 'Sin instantánea: regenerando la cuenta demo' : 'Restableciendo la cuenta demo desde su instantánea')
    drive()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restablecer la demo')
  } finally {
    working.value = false
  }
}

async function regenerate() {
  working.value = true
  try {
    progress.value = await call('demo-regenerate', { confirm: confirmText.value })
    cancelConfirm()
    toast.success('Regenerando la cuenta demo desde cero')
    drive()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo regenerar la demo')
  } finally {
    working.value = false
  }
}

function cancelConfirm() {
  confirming.value = null
  confirmText.value = ''
}

onMounted(async () => {
  try {
    progress.value = await call('demo-status')
    drive()
  } catch {
    progress.value = null
  }
})
onBeforeUnmount(() => {
  stopped = true
})
</script>
