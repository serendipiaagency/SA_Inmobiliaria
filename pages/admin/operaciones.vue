<template>
  <div class="max-w-5xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Operaciones cerradas</h1>
        <p class="mt-1 text-sm text-stone-500">Ventas y alquileres cerrados, con seguimiento real de comisiones por agente.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = !showCreate">{{ showCreate ? 'Cancelar' : 'Registrar operación' }}</button>
    </div>

    <AdminPanel v-if="showCreate" title="Nueva operación" class="mb-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Cliente</span>
          <input v-model="form.clientName" class="cfg-input" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Tipo</span>
          <select v-model="form.dealType" class="cfg-input">
            <option value="sale">Venta</option>
            <option value="rental">Alquiler</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Propiedad</span>
          <input v-model="form.propertyName" class="cfg-input" placeholder="Nombre de la propiedad" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Agente</span>
          <input v-model="form.agentName" class="cfg-input" placeholder="Nombre del agente" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Valor de la operación (€)</span>
          <input v-model.number="form.dealValue" type="number" min="0" step="1000" class="cfg-input" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Comisión (%)</span>
          <input v-model.number="form.commissionRate" type="number" min="0" max="100" step="0.5" class="cfg-input" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Fecha de cierre</span>
          <input v-model="form.closedAt" type="date" class="cfg-input" >
        </label>
      </div>
      <p class="mt-3 text-xs text-stone-500">Comisión calculada: <strong>{{ dt.money(estimatedCommission) }}</strong></p>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Guardando…' : 'Guardar operación' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
    </AdminPanel>

    <div v-if="!deals.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin operaciones registradas todavía.</div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Tipo</th>
              <th class="px-4 py-2.5 font-semibold">Agente</th>
              <th class="px-4 py-2.5 text-right font-semibold">Valor</th>
              <th class="px-4 py-2.5 text-right font-semibold">Comisión</th>
              <th class="px-4 py-2.5 font-semibold">Cierre</th>
              <th class="px-4 py-2.5 font-semibold">Comisión pagada</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deals" :key="d.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ d.clientName }}</td>
              <td class="px-4 py-3 capitalize text-stone-600">{{ d.dealType === 'rental' ? 'Alquiler' : 'Venta' }}</td>
              <td class="px-4 py-3 text-stone-600">{{ d.agentName || '—' }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ dt.money(d.dealValue) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ dt.money(d.commissionAmount) }} <span class="text-stone-400">({{ d.commissionRate }}%)</span></td>
              <td class="px-4 py-3 text-stone-500">{{ d.closedAt }}</td>
              <td class="px-4 py-3">
                <button
                  type="button"
                  class="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  :class="d.commissionPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'"
                  @click="togglePaid(d)"
                >
                  {{ d.commissionPaid ? 'Pagada' : 'Pendiente — marcar pagada' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Operaciones cerradas — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

interface Deal {
  id: number
  clientName: string
  dealType: string
  agentName: string | null
  dealValue: number
  commissionRate: number
  commissionAmount: number
  commissionPaid: number
  closedAt: string
}

const { data, refresh } = await useFetch<{ rows: Deal[] }>('/api/admin/saas/deals')
const deals = computed(() => data.value?.rows || [])

const showCreate = ref(false)
const creating = ref(false)
const error = ref('')
const form = reactive({ clientName: '', dealType: 'sale', propertyName: '', agentName: '', dealValue: 0, commissionRate: 3, closedAt: new Date().toISOString().slice(0, 10) })
const estimatedCommission = computed(() => Math.round(((form.dealValue || 0) * (form.commissionRate || 0)) / 100))

async function create() {
  error.value = ''
  creating.value = true
  try {
    await $fetch('/api/admin/saas/deals', { method: 'POST', body: form })
    showCreate.value = false
    form.clientName = ''
    form.propertyName = ''
    form.agentName = ''
    form.dealValue = 0
    await refresh()
    toast.success('Operación registrada')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al registrar la operación'
  } finally {
    creating.value = false
  }
}

async function togglePaid(d: Deal) {
  try {
    await $fetch(`/api/admin/saas/deals/${d.id}`, { method: 'PATCH', body: { commissionPaid: !d.commissionPaid } })
    await refresh()
  } catch {
    toast.error('No se pudo actualizar')
  }
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
