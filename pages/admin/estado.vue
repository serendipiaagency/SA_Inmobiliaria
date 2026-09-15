<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Estado del sistema</h1>
      <p class="mt-1 text-sm text-stone-500">
        Qué integraciones de la plataforma están funcionando ahora mismo. Lo que aparece aquí es lo que hay, no lo que debería haber.
      </p>
    </div>

    <div v-if="pending" class="space-y-3">
      <div v-for="i in 5" :key="i" class="skeleton h-16 rounded-xl border border-line" />
    </div>

    <template v-else-if="report">
      <!-- Resumen. "Sin implementar" va aparte de "sin configurar" a propósito:
           son problemas distintos y sólo uno se arregla con un ajuste. -->
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl border border-line bg-white px-4 py-3">
          <p class="text-2xl font-semibold tabular-nums text-emerald-700">{{ report.summary.ok }}</p>
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Funcionando</p>
        </div>
        <div class="rounded-xl border border-line bg-white px-4 py-3">
          <p class="text-2xl font-semibold tabular-nums" :class="report.summary.degraded ? 'text-red-700' : 'text-stone-300'">{{ report.summary.degraded }}</p>
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Con problemas</p>
        </div>
        <div class="rounded-xl border border-line bg-white px-4 py-3">
          <p class="text-2xl font-semibold tabular-nums" :class="report.summary.notConfigured ? 'text-amber-700' : 'text-stone-300'">{{ report.summary.notConfigured }}</p>
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Sin configurar</p>
        </div>
        <div class="rounded-xl border border-line bg-white px-4 py-3">
          <p class="text-2xl font-semibold tabular-nums" :class="report.summary.notImplemented ? 'text-stone-600' : 'text-stone-300'">{{ report.summary.notImplemented }}</p>
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Sin implementar</p>
        </div>
      </div>

      <div v-for="group in groups" :key="group.label" class="mb-6">
        <p class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{{ group.label }}</p>
        <AdminPanel :pad="false">
          <div v-for="item in group.items" :key="item.key" class="border-b border-line/60 px-4 py-3.5 last:border-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="badgeClass(item.state)">{{ stateLabel(item.state) }}</span>
              <p class="text-sm font-medium">{{ item.label }}</p>
              <code v-if="item.setting" class="ml-auto rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-500">{{ item.setting }}</code>
            </div>
            <p class="mt-1.5 text-sm text-stone-600">{{ item.detail }}</p>
            <p v-if="item.remedy" class="mt-1 text-[13px] text-stone-500">→ {{ item.remedy }}</p>
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Build desplegado" sub="Qué código está sirviendo ahora mismo">
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Commit</dt>
            <dd class="mt-0.5 font-mono">{{ report.build.commit }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Rama</dt>
            <dd class="mt-0.5 font-mono">{{ report.build.branch }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Compilado</dt>
            <dd class="mt-0.5">{{ dt.relative(report.build.builtAt) }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Publicado por</dt>
            <dd class="mt-0.5">
              <span class="font-mono">{{ report.build.source }}</span>
              <!-- El pipeline aplica migraciones y hace copia de seguridad antes
                   de desplegar; Workers Builds no hace ni una cosa ni la otra. -->
              <span v-if="report.build.source === 'workers-builds'" class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Se saltó el pipeline
              </span>
            </dd>
          </div>
        </dl>
      </AdminPanel>
    </template>

    <p v-else class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      No se ha podido leer el estado del sistema.
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Estado del sistema — M&M Real Estate' })
const dt = useDash()

type IntegrationState = 'ok' | 'degraded' | 'not-configured' | 'not-implemented'
interface Integration {
  key: string
  label: string
  group: string
  state: IntegrationState
  detail: string
  remedy: string | null
  setting: string | null
}
interface SystemStatusReport {
  integrations: Integration[]
  summary: { ok: number; degraded: number; notConfigured: number; notImplemented: number }
  build: { commit: string; branch: string; builtAt: string; source: string }
  headline: string | null
}

const { data: report, pending } = await useFetch<SystemStatusReport>('/api/admin/system-status')

/** Agrupadas en el orden en que aparecen, que es el orden en que importan. */
const groups = computed(() => {
  const out: { label: string; items: Integration[] }[] = []
  for (const item of report.value?.integrations || []) {
    const existing = out.find((g) => g.label === item.group)
    if (existing) existing.items.push(item)
    else out.push({ label: item.group, items: [item] })
  }
  return out
})

function stateLabel(state: IntegrationState) {
  return { ok: 'Funcionando', degraded: 'Con problemas', 'not-configured': 'Sin configurar', 'not-implemented': 'Sin implementar' }[state] || state
}
function badgeClass(state: IntegrationState) {
  return (
    {
      ok: 'bg-emerald-100 text-emerald-700',
      degraded: 'bg-red-100 text-red-700',
      'not-configured': 'bg-amber-100 text-amber-800',
      // Gris a propósito: no es una avería ni una tarea pendiente de ajuste,
      // es que todavía no existe. Pintarlo de rojo invitaría a "arreglarlo".
      'not-implemented': 'bg-stone-100 text-stone-600',
    }[state] || 'bg-stone-100 text-stone-600'
  )
}
</script>
