<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Webhooks salientes</h1>
        <p class="mt-1 text-sm text-stone-500">Notifica a sistemas externos (Zapier, Make, tu propio backend) cuando pase algo real en tu cuenta.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = !showCreate">{{ showCreate ? 'Cancelar' : 'Nuevo endpoint' }}</button>
    </div>

    <AdminPanel v-if="showCreate" title="Nuevo endpoint" class="mb-6">
      <label class="block">
        <span class="mb-1.5 block text-[12px] font-medium text-stone-600">URL (https)</span>
        <input v-model="form.url" class="cfg-input" placeholder="https://tu-sistema.com/webhooks/sa-inmobiliaria" />
      </label>
      <div class="mt-3">
        <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Eventos</span>
        <div class="flex flex-wrap gap-2">
          <label v-for="ev in EVENTS" :key="ev" class="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs">
            <input v-model="form.events" type="checkbox" :value="ev" /> {{ ev }}
          </label>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Creando…' : 'Crear' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
      <div v-if="newSecret" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Este es el único momento en que se muestra el secreto — cópialo ahora, se usa para verificar la firma HMAC (<code>X-Webhook-Signature</code>) de cada entrega:
        <code class="mt-1 block break-all font-mono">{{ newSecret }}</code>
      </div>
    </AdminPanel>

    <div v-if="!endpoints.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin endpoints configurados.</div>

    <div v-else class="space-y-3">
      <AdminPanel v-for="ep in endpoints" :key="ep.id">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ ep.url }}</p>
            <p class="mt-1 text-xs text-stone-400">Secreto: {{ ep.secretHint }} · Eventos: {{ JSON.parse(ep.eventsJson).join(', ') }}</p>
          </div>
          <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="ep.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'">{{ ep.active ? 'Activo' : 'Pausado' }}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-3 border-t border-line pt-3">
          <button type="button" class="text-xs font-medium text-ink hover:underline" @click="test(ep)">{{ testing === ep.id ? 'Enviando…' : 'Enviar prueba' }}</button>
          <button type="button" class="text-xs font-medium text-ink hover:underline" @click="toggleLog(ep)">{{ expanded === ep.id ? 'Ocultar historial' : 'Ver historial' }}</button>
          <button type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="toggleActive(ep)">{{ ep.active ? 'Pausar' : 'Reactivar' }}</button>
          <button type="button" class="text-xs font-medium text-red-600 hover:underline" @click="remove(ep)">Eliminar</button>
        </div>
        <p v-if="lastTestResult[ep.id]" class="mt-2 text-xs" :class="lastTestResult[ep.id].status === 'delivered' ? 'text-emerald-700' : 'text-red-600'">
          Última prueba: {{ lastTestResult[ep.id].status }} {{ lastTestResult[ep.id].responseCode ? `(HTTP ${lastTestResult[ep.id].responseCode})` : '' }} {{ lastTestResult[ep.id].errorMessage || '' }}
        </p>
        <div v-if="expanded === ep.id" class="mt-3 border-t border-line pt-3">
          <ul v-if="deliveries[ep.id]?.length" class="divide-y divide-line text-xs">
            <li v-for="d in deliveries[ep.id]" :key="d.id" class="flex items-center justify-between py-2">
              <span>{{ d.event }} — {{ dt.relative(d.createdAt) }}</span>
              <span :class="d.status === 'delivered' ? 'text-emerald-700' : 'text-red-600'">{{ d.status }} {{ d.responseCode ? `(${d.responseCode})` : '' }}</span>
            </li>
          </ul>
          <p v-else class="text-xs text-stone-400">Sin entregas todavía.</p>
        </div>
      </AdminPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Webhooks — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const EVENTS = ['lead.created', 'deal.closed', 'visit.booked', 'contract.accepted', 'referral.converted']

const { data, refresh } = await useFetch<any[]>('/api/admin/saas/webhooks')
const endpoints = computed(() => data.value || [])

const showCreate = ref(false)
const creating = ref(false)
const error = ref('')
const newSecret = ref('')
const form = reactive({ url: '', events: [] as string[] })

async function create() {
  error.value = ''
  creating.value = true
  try {
    const res = await $fetch<any>('/api/admin/saas/webhooks', { method: 'POST', body: form })
    newSecret.value = res.secret
    form.url = ''
    form.events = []
    await refresh()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al crear el endpoint'
  } finally {
    creating.value = false
  }
}

const testing = ref<number | null>(null)
const lastTestResult = reactive<Record<number, any>>({})
async function test(ep: any) {
  testing.value = ep.id
  try {
    lastTestResult[ep.id] = await $fetch(`/api/admin/saas/webhooks/${ep.id}/test`, { method: 'POST' })
  } finally {
    testing.value = null
  }
}

const expanded = ref<number | null>(null)
const deliveries = reactive<Record<number, any[]>>({})
async function toggleLog(ep: any) {
  if (expanded.value === ep.id) {
    expanded.value = null
    return
  }
  expanded.value = ep.id
  deliveries[ep.id] = await $fetch<any[]>(`/api/admin/saas/webhooks/${ep.id}/deliveries`)
}

async function toggleActive(ep: any) {
  await $fetch(`/api/admin/saas/webhooks/${ep.id}`, { method: 'PATCH', body: { active: !ep.active } })
  await refresh()
}

async function remove(ep: any) {
  if (!confirm('¿Eliminar este endpoint?')) return
  await $fetch(`/api/admin/saas/webhooks/${ep.id}`, { method: 'DELETE' })
  await refresh()
  toast.success('Endpoint eliminado')
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
