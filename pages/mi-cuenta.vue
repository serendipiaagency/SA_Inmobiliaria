<template>
  <div class="mx-auto max-w-3xl px-4 py-16">
    <h1 class="heading-serif text-3xl">Mi cuenta</h1>
    <p class="mt-1 text-sm text-stone-500">Hola {{ user?.name }} — aquí tienes tus visitas, solicitudes y contratos.</p>

    <section class="mt-10">
      <h2 class="text-lg font-semibold">Visitas</h2>
      <p v-if="!data?.visits?.length" class="mt-2 text-sm text-stone-400">Sin visitas registradas.</p>
      <ul v-else class="mt-3 divide-y divide-line text-sm">
        <li v-for="v in data.visits" :key="v.id" class="py-3">
          <p class="font-medium">{{ v.propertyName || 'Visita' }} — {{ new Date(v.scheduledAt).toLocaleString('es-ES') }}</p>
          <p class="text-xs text-stone-400">Con {{ v.agentName || 'un agente' }} · {{ statusLabel(v.status) }}</p>
        </li>
      </ul>
    </section>

    <section class="mt-10">
      <h2 class="text-lg font-semibold">Solicitudes</h2>
      <p v-if="!data?.leads?.length" class="mt-2 text-sm text-stone-400">Sin solicitudes registradas.</p>
      <ul v-else class="mt-3 divide-y divide-line text-sm">
        <li v-for="l in data.leads" :key="l.id" class="py-3">
          <p class="font-medium">{{ l.propertyName || 'Consulta general' }}</p>
          <p class="text-xs text-stone-400">Estado: {{ leadStatusLabel(l.status) }}</p>
        </li>
      </ul>
    </section>

    <section class="mt-10">
      <h2 class="text-lg font-semibold">Contratos</h2>
      <p v-if="!data?.contracts?.length" class="mt-2 text-sm text-stone-400">Sin contratos.</p>
      <ul v-else class="mt-3 divide-y divide-line text-sm">
        <li v-for="c in data.contracts" :key="c.id" class="flex items-center justify-between py-3">
          <div>
            <p class="font-medium">{{ c.title }}</p>
            <p class="text-xs text-stone-400">{{ contractStatusLabel(c.status) }}</p>
          </div>
          <a v-if="c.status === 'accepted'" :href="`/api/client/contracts/${c.id}/download`" class="text-xs font-medium text-ink hover:underline">Descargar PDF</a>
          <a v-else-if="c.status === 'sent' && c.managementToken" :href="`/contratos/${c.managementToken}`" class="text-xs font-medium text-ink hover:underline">Revisar y aceptar</a>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
useHead({ title: `Mi cuenta — ${tenant.value?.companyName || tenant.value?.name}` })
const { user } = useAuth()
const { data } = await useFetch<any>('/api/client/dashboard')

function statusLabel(s: string) {
  return { scheduled: 'Programada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' }[s] || s
}
function leadStatusLabel(s: string) {
  return { new: 'Nueva', contacted: 'Contactada', qualified: 'Cualificada', proposal: 'Propuesta enviada', won: 'Cerrada', lost: 'Descartada' }[s] || s
}
function contractStatusLabel(s: string) {
  return { draft: 'En preparación', sent: 'Pendiente de tu revisión', accepted: 'Aceptado', void: 'Anulado' }[s] || s
}
</script>
