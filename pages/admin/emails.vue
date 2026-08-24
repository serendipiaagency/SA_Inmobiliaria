<template>
  <div class="max-w-5xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Emails transaccionales</h1>
      <p class="mt-1 text-sm text-stone-500">Historial real de envíos vía Resend — el estado solo pasa a "Entregado"/"Rebotado"/"Reclamación" cuando Resend lo confirma por webhook.</p>
    </div>

    <div v-if="!rows.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin envíos todavía.</div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Plantilla</th>
              <th class="px-4 py-2.5 font-semibold">Destinatario</th>
              <th class="px-4 py-2.5 font-semibold">Tipo</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Intentos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 text-xs text-stone-500">{{ dt.relative(r.createdAt) }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ r.template }}</td>
              <td class="px-4 py-3">{{ r.recipient }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="r.kind === 'commercial' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'">{{ r.kind === 'commercial' ? 'Comercial' : 'Transaccional' }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(r.status)">{{ statusLabel(r.status) }}</span>
                <span v-if="r.errorMessage" class="ml-2 text-xs text-red-500">{{ r.errorMessage }}</span>
              </td>
              <td class="px-4 py-3 tabular-nums">{{ r.attempts }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Emails — M&M Real Estate' })
const dt = useDash()

const { data } = await useFetch<any[]>('/api/admin/saas/email-log')
const rows = computed(() => data.value || [])

function statusLabel(s: string) {
  return { queued: 'En cola', sent: 'Enviado', delivered: 'Entregado', bounced: 'Rebotado', complained: 'Reclamación', failed: 'Fallido' }[s] || s
}
function statusClass(s: string) {
  return (
    {
      queued: 'bg-sky-100 text-sky-700',
      sent: 'bg-stone-100 text-stone-600',
      delivered: 'bg-emerald-100 text-emerald-700',
      bounced: 'bg-red-100 text-red-700',
      complained: 'bg-red-100 text-red-700',
      failed: 'bg-red-100 text-red-700',
    }[s] || 'bg-stone-100 text-stone-600'
  )
}
</script>
