<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Automatizaciones</h1>
        <p class="mt-1 text-sm text-stone-500">Flujos que se ejecutan solos ante cada evento</p>
      </div>
      <button class="dash-btn-primary">+ Crear flujo</button>
    </div>

    <div v-if="data" class="mb-4 grid gap-4 sm:grid-cols-3">
      <AdminStatCard label="Flujos activos" :value="`${data.active} / ${data.total}`" />
      <AdminStatCard label="Ejecuciones totales" :value="dt.num(data.totalRuns)" />
      <AdminStatCard label="Tiempo ahorrado (est.)" :value="`${Math.round(data.totalRuns * 4 / 60)} h`" sub="≈ 4 min por ejecución" />
    </div>

    <div class="grid gap-3">
      <div v-for="a in rows" :key="a.id" class="flex items-start gap-4 rounded-xl border border-line bg-white p-4">
        <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="a.enabled ? 'bg-ink text-white' : 'bg-stone-100 text-stone-400'">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="font-semibold">{{ a.name }}</p>
          </div>
          <p class="mt-0.5 text-sm text-stone-500">{{ a.description }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span class="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>{{ a.trigger }}
            </span>
            <svg class="h-3 w-3 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span class="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{{ actionLabel(a.action) }}</span>
            <span class="text-stone-400">· {{ dt.num(a.runsCount) }} ejecuciones · última {{ dt.relative(a.lastRunAt) }}</span>
          </div>
        </div>
        <button
          class="relative mt-1 h-6 w-11 shrink-0 rounded-full transition"
          :class="a.enabled ? 'bg-ink' : 'bg-stone-300'"
          role="switch"
          :aria-checked="!!a.enabled"
          @click="toggle(a)"
        >
          <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" :class="a.enabled ? 'left-[22px]' : 'left-0.5'" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Automatizaciones — SA Inmobiliaria' })
const dt = useDash()

const { data, refresh } = await useFetch<any>('/api/admin/saas/automations')
const rows = computed<any[]>(() => data.value?.rows || [])

function actionLabel(a: string) {
  return {
    send_email: 'Enviar email',
    create_task: 'Crear tarea',
    notify_slack: 'Avisar por Slack',
    create_invoice: 'Crear factura',
    social_post: 'Publicar en redes',
    assign_agent: 'Asignar agente',
  }[a] || a
}
async function toggle(a: any) {
  const next = a.enabled ? 0 : 1
  a.enabled = next
  try {
    await $fetch(`/api/admin/saas/automations/${a.id}`, { method: 'PATCH', body: { enabled: !!next } })
  } catch {
    a.enabled = next ? 0 : 1
    refresh()
  }
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black;
}
</style>
