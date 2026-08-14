<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Programa de referidos</h1>
        <p class="mt-1 text-sm text-stone-500">Enlaces de recomendación por cliente o agente, con seguimiento real de conversión y recompensa.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = !showCreate">{{ showCreate ? 'Cancelar' : 'Nuevo enlace' }}</button>
    </div>

    <AdminPanel v-if="showCreate" title="Nuevo enlace de referido" class="mb-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre del referidor</span>
          <input v-model="form.referrerName" class="cfg-input" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Tipo</span>
          <select v-model="form.referrerType" class="cfg-input">
            <option value="client">Cliente</option>
            <option value="agent">Agente</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Tipo de recompensa</span>
          <select v-model="form.rewardType" class="cfg-input">
            <option value="cash">Efectivo</option>
            <option value="discount">Descuento</option>
            <option value="commission">Comisión</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Importe de recompensa (€)</span>
          <input v-model.number="form.rewardAmount" type="number" min="0" class="cfg-input" />
        </label>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Creando…' : 'Crear enlace' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
    </AdminPanel>

    <div v-if="!links.length" class="mb-6 rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">Sin enlaces de referido todavía.</div>
    <div v-else class="mb-6 grid gap-3 sm:grid-cols-2">
      <AdminPanel v-for="l in links" :key="l.id">
        <p class="text-sm font-medium">{{ l.referrerName }} <span class="text-xs text-stone-400">({{ l.referrerType === 'agent' ? 'agente' : 'cliente' }})</span></p>
        <p class="mt-1 text-xs text-stone-500">{{ l.referralCount }} referidos · recompensa: {{ l.rewardType }} {{ l.rewardAmount ? dt.money(l.rewardAmount) : '' }}</p>
        <div class="mt-2 flex items-center gap-2">
          <input :value="linkUrl(l.code)" readonly class="flex-1 rounded-lg border border-line bg-stone-50 px-2 py-1 text-xs" @click="($event.target as HTMLInputElement).select()" />
          <button type="button" class="text-xs font-medium text-ink hover:underline" @click="copy(l.code)">{{ copied === l.code ? 'Copiado' : 'Copiar' }}</button>
        </div>
      </AdminPanel>
    </div>

    <AdminPanel title="Referidos recibidos">
      <ul v-if="referrals.length" class="divide-y divide-line text-sm">
        <li v-for="r in referrals" :key="r.id" class="flex items-center justify-between py-2.5">
          <div>
            <p class="font-medium">{{ r.refereeName }}</p>
            <p class="text-xs text-stone-400">Referido por {{ r.referrerName }} · {{ dt.relative(r.createdAt) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(r.status)">{{ statusLabel(r.status) }}</span>
            <button v-if="r.status === 'pending'" type="button" class="text-xs font-medium text-ink hover:underline" @click="setStatus(r, 'converted')">Marcar convertido</button>
            <button v-if="r.status === 'converted'" type="button" class="text-xs font-medium text-ink hover:underline" @click="setStatus(r, 'rewarded')">Marcar recompensado</button>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-stone-400">Sin referidos todavía.</p>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Referidos — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const { data: linksData, refresh: refreshLinks } = await useFetch<any[]>('/api/admin/saas/referral-links')
const links = computed(() => linksData.value || [])
const { data: referralsData, refresh: refreshReferrals } = await useFetch<any[]>('/api/admin/saas/referrals')
const referrals = computed(() => referralsData.value || [])

const showCreate = ref(false)
const creating = ref(false)
const error = ref('')
const form = reactive({ referrerName: '', referrerType: 'client', rewardType: 'cash', rewardAmount: 100 })

async function create() {
  error.value = ''
  creating.value = true
  try {
    await $fetch('/api/admin/saas/referral-links', { method: 'POST', body: form })
    showCreate.value = false
    form.referrerName = ''
    await refreshLinks()
    toast.success('Enlace creado')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al crear el enlace'
  } finally {
    creating.value = false
  }
}

function linkUrl(code: string) {
  return `${useRequestURL().origin}/demo/referir/${code}`
}
const copied = ref('')
function copy(code: string) {
  navigator.clipboard.writeText(linkUrl(code))
  copied.value = code
  setTimeout(() => (copied.value = ''), 2000)
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', converted: 'Convertido', rewarded: 'Recompensado', expired: 'Caducado' }[s] || s
}
function statusClass(s: string) {
  return (
    { pending: 'bg-stone-100 text-stone-600', converted: 'bg-sky-100 text-sky-700', rewarded: 'bg-emerald-100 text-emerald-700', expired: 'bg-stone-200 text-stone-500' }[s] ||
    'bg-stone-100 text-stone-600'
  )
}
async function setStatus(r: any, status: string) {
  await $fetch(`/api/admin/saas/referrals/${r.id}`, { method: 'PATCH', body: { status } })
  await refreshReferrals()
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
