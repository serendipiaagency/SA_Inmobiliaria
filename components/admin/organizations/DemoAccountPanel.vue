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

    <div v-if="progress && (progress.status === 'provisioning' || progress.status === 'resetting')" class="mt-4">
      <div class="h-2 overflow-hidden rounded-full bg-stone-100">
        <div class="h-full rounded-full bg-emerald-600 transition-all" :style="{ width: `${percent}%` }" />
      </div>
      <p class="mt-2 text-xs text-stone-500">
        {{ progress.status === 'resetting' ? 'Borrando los datos anteriores de la demo…' : `Paso ${progress.stepIndex}${progress.total ? ` de ${progress.total}` : ''}` }}
        <span v-if="progress.lastStep"> · último: {{ progress.lastStep }}</span>
        <span v-if="progress.busy"> · el cron está generando un tramo ahora mismo</span>
      </p>
      <p class="mt-1 text-xs text-stone-400">Sigue sola con el cron de cada minuto; mientras esta pantalla esté abierta también avanza desde aquí.</p>
    </div>

    <p v-if="progress?.status === 'ready'" class="mt-3 text-sm text-stone-600">
      Generada el {{ progress.finishedAt }} con la historia anclada al {{ progress.anchorDay }}.
    </p>
    <p v-if="progress?.error" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="demo-error">{{ progress.error }}</p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button v-if="!progress || progress.status === 'idle'" class="btn-primary" :disabled="working" data-testid="demo-create" @click="create">Crear la cuenta demo</button>
      <template v-if="progress && (progress.status === 'ready' || progress.status === 'failed')">
        <button v-if="!confirming" class="btn-secondary" :disabled="working" data-testid="demo-reset" @click="confirming = true">Restablecer la demo…</button>
        <template v-else>
          <input v-model="confirmText" class="input !w-72" placeholder="Escribe norte-astur-inmobiliaria" data-testid="demo-reset-confirm" >
          <button class="btn-primary !bg-red-600" :disabled="confirmText !== slug || working" @click="reset">Borrar y volver a generar</button>
          <button class="btn-secondary" @click="cancelReset">Cancelar</button>
        </template>
      </template>
    </div>
    <p v-if="confirming" class="mt-2 text-xs text-stone-500">
      Borra todo lo de la empresa demo (incluido lo que se haya tocado en una presentación) y la vuelve a generar con fecha de hoy. No afecta a ninguna otra empresa.
    </p>
  </section>
</template>

<script setup lang="ts">
interface DemoProgress {
  status: 'idle' | 'provisioning' | 'resetting' | 'ready' | 'failed'
  orgId: number | null
  stepIndex: number
  total: number | null
  lastStep: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  anchorDay: string | null
  busy: boolean
}

const slug = 'norte-astur-inmobiliaria'
const toast = useToast()
const progress = ref<DemoProgress | null>(null)
const working = ref(false)
const confirming = ref(false)
const confirmText = ref('')
let stopped = false

const call = (action: string, extra: Record<string, unknown> = {}) => $fetch<DemoProgress>('/api/admin/organizations', { method: 'POST', body: { action, ...extra } })

const percent = computed(() => {
  const p = progress.value
  if (!p?.total) return 3
  return Math.max(3, Math.min(100, Math.round((p.stepIndex / p.total) * 100)))
})
const statusLabel = computed(
  () =>
    ({ idle: 'No creada', provisioning: 'Generando', resetting: 'Restableciendo', ready: 'Lista', failed: 'Con error' })[progress.value?.status ?? 'idle'] ?? '—',
)
const badgeClass = computed(() => {
  const s = progress.value?.status
  if (s === 'ready') return 'bg-emerald-50 text-emerald-700'
  if (s === 'failed') return 'bg-red-50 text-red-700'
  if (s === 'provisioning' || s === 'resetting') return 'bg-amber-50 text-amber-700'
  return 'bg-stone-100 text-stone-600'
})

/** Mientras se genera, cada llamada ejecuta un tramo (el cron hace lo mismo cada minuto). */
async function drive() {
  while (!stopped && progress.value && (progress.value.status === 'provisioning' || progress.value.status === 'resetting')) {
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
    progress.value = await call('demo-reset', { confirm: confirmText.value })
    cancelReset()
    toast.success('Restableciendo la cuenta demo')
    drive()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restablecer la demo')
  } finally {
    working.value = false
  }
}

function cancelReset() {
  confirming.value = false
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
