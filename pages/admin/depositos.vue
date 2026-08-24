<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Fianzas y depósitos</h1>
      <p class="mt-1 text-sm text-stone-500">Cobro de fianzas o señales por contrato a través de Stripe Checkout.</p>
    </div>

    <div v-if="!stripeWarningDismissed" class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Si Stripe no está conectado (falta el secreto <code>STRIPE_SECRET_KEY</code>), los depósitos se crean igualmente pero quedan marcados como
      <strong>no conectado</strong> — sin enlace de pago real, para no fingir un cobro que no existe. El estado se confirma automáticamente por
      webhook en cuanto Stripe procesa el pago; "Comprobar estado" es solo para forzar una consulta manual.
    </div>

    <AdminPanel title="Solicitar depósito" class="mb-6">
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="block sm:col-span-2">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Contrato</span>
          <select v-model.number="form.contractId" class="cfg-input">
            <option :value="null" disabled>Selecciona un contrato</option>
            <option v-for="c in contracts" :key="c.id" :value="c.id">{{ c.title }} — {{ c.clientName }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Importe (€)</span>
          <input v-model.number="form.amount" type="number" min="0" step="100" class="cfg-input" />
        </label>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Creando…' : 'Solicitar pago' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
      <div v-if="lastCheckoutUrl" class="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm">
        <p class="font-medium">Enlace de pago:</p>
        <a :href="lastCheckoutUrl" target="_blank" class="break-all text-ink hover:underline">{{ lastCheckoutUrl }}</a>
      </div>
    </AdminPanel>

    <div v-if="!deposits.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin depósitos todavía.</div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Contrato</th>
              <th class="px-4 py-2.5 text-right font-semibold">Importe</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deposits" :key="d.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ d.contractTitle || '—' }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ dt.money(d.amount) }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(d.status)">{{ statusLabel(d.status) }}</span>
                <span v-if="d.status === 'failed' && d.errorMessage" class="ml-2 text-xs text-red-500">{{ d.errorMessage }}</span>
              </td>
              <td class="px-4 py-3">
                <button v-if="d.status === 'processing'" type="button" class="text-xs font-medium text-ink hover:underline" @click="refresh(d)">Comprobar estado</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <div v-if="stripeEvents.length" class="mt-8">
      <h2 class="mb-3 text-sm font-semibold text-stone-700">Historial de eventos de Stripe</h2>
      <AdminPanel :pad="false">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <tr>
                <th class="px-4 py-2.5 font-semibold">Fecha</th>
                <th class="px-4 py-2.5 font-semibold">Tipo</th>
                <th class="px-4 py-2.5 font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ev in stripeEvents" :key="ev.id" class="border-b border-line/60 last:border-0">
                <td class="px-4 py-2.5 text-xs text-stone-500">{{ ev.receivedAt }}</td>
                <td class="px-4 py-2.5 font-mono text-xs">{{ ev.type }}</td>
                <td class="px-4 py-2.5 text-xs">{{ ev.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Depósitos — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const { data: depositsData, refresh: refreshDeposits } = await useFetch<any[]>('/api/admin/saas/deposits')
const deposits = computed(() => depositsData.value || [])
const { data: contractsData } = await useFetch<any[]>('/api/admin/saas/contracts')
const contracts = computed(() => (contractsData.value || []).filter((c: any) => c.status === 'accepted' || c.status === 'sent'))

const { data: stripeEventsData } = await useFetch<any[]>('/api/admin/saas/stripe-events')
const stripeEvents = computed(() => stripeEventsData.value || [])

const stripeWarningDismissed = ref(false)
const form = reactive({ contractId: null as number | null, amount: 0 })
const creating = ref(false)
const error = ref('')
const lastCheckoutUrl = ref('')

async function create() {
  error.value = ''
  lastCheckoutUrl.value = ''
  if (!form.contractId) {
    error.value = 'Selecciona un contrato'
    return
  }
  creating.value = true
  try {
    const res: any = await $fetch('/api/admin/saas/deposits', { method: 'POST', body: form })
    if (res.checkoutUrl) lastCheckoutUrl.value = res.checkoutUrl
    else toast.error(res.message || 'Depósito creado sin enlace de pago (Stripe no conectado)')
    await refreshDeposits()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al crear el depósito'
  } finally {
    creating.value = false
  }
}

async function refresh(d: any) {
  try {
    await $fetch(`/api/admin/saas/deposits/${d.id}/refresh`, { method: 'POST' })
    await refreshDeposits()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo comprobar el estado')
  }
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', not_connected: 'No conectado', processing: 'En proceso', paid: 'Pagado', failed: 'Error', refunded: 'Reembolsado' }[s] || s
}
function statusClass(s: string) {
  return (
    {
      pending: 'bg-stone-100 text-stone-600',
      not_connected: 'bg-amber-100 text-amber-700',
      processing: 'bg-sky-100 text-sky-700',
      paid: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      refunded: 'bg-violet-100 text-violet-700',
    }[s] || 'bg-stone-100 text-stone-600'
  )
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
