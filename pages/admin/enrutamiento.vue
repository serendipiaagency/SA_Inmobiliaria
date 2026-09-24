<!--
  Enrutamiento y SLA de leads (FASE 15 — Lead Routing; FASE 16 — Lead SLA).

  Las reglas de enrutado (quién decide a qué comercial va un lead nuevo) se
  gestionan en el CRUD genérico del panel (/admin/lead-routing-rules) — esta
  página se centra en lo que sí es propio: los umbrales de SLA por agencia y
  las alertas abiertas ahora mismo, con acción directa sobre cada una.
-->
<template>
  <div>
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Enrutamiento y SLA</h1>
        <p class="mt-1 text-sm text-stone-500">Quién atiende cada lead, y si se está atendiendo a tiempo.</p>
      </div>
      <NuxtLink to="/admin/lead-routing-rules" class="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-stone-50">
        Gestionar reglas de enrutado →
      </NuxtLink>
    </header>

    <AdminPanel title="Umbrales de SLA" class="mb-6">
      <p class="mb-4 text-xs text-stone-500">
        Por agencia — nunca una regla universal. Un lead cruza cada umbral en tiempo natural (no horario comercial) desde el momento correspondiente.
      </p>
      <div v-if="settings" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Nuevo sin atender (minutos)</span>
          <input v-model.number="settings.newLeadUnattendedMinutes" type="number" min="1" class="cfg-input" data-testid="sla-unattended-minutes">
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Cualificado sin próxima acción (horas)</span>
          <input v-model.number="settings.qualifiedWithoutActionHours" type="number" min="1" class="cfg-input" data-testid="sla-qualified-hours">
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Sin contacto (días)</span>
          <input v-model.number="settings.inactiveLeadDays" type="number" min="1" class="cfg-input" data-testid="sla-inactive-days">
        </label>
      </div>
      <button type="button" class="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90" :disabled="savingSettings" data-testid="sla-settings-save" @click="saveSettings">
        {{ savingSettings ? 'Guardando…' : 'Guardar umbrales' }}
      </button>
    </AdminPanel>

    <AdminPanel title="Alertas abiertas">
      <p v-if="loadingAlerts" class="text-sm text-stone-400">Cargando…</p>
      <p v-else-if="!alerts.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Sin alertas abiertas — todo al día.
      </p>
      <div v-else class="space-y-2">
        <div v-for="a in alerts" :key="a.id" class="flex items-center justify-between rounded-lg border border-line px-4 py-2.5 text-sm" :data-testid="`sla-alert-${a.id}`">
          <div class="min-w-0">
            <NuxtLink :to="`/admin/leads`" class="font-medium hover:underline">{{ a.leadName }}</NuxtLink>
            <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{{ typeLabel(a.type) }}</span>
            <p class="mt-0.5 text-xs text-stone-400">
              Fase: {{ a.leadStage || 'nueva' }}{{ a.leadAgentName ? ` · ${a.leadAgentName}` : ' · sin asignar' }} · abierta desde {{ dt.date(a.openedAt) }}
            </p>
          </div>
          <button type="button" class="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-stone-50" @click="resolveAlert(a.id)">
            Marcar como resuelta
          </button>
        </div>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Enrutamiento y SLA — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const settings = ref<any>(null)
const savingSettings = ref(false)
const alerts = ref<any[]>([])
const loadingAlerts = ref(false)

const TYPE_LABELS: Record<string, string> = { unattended: 'Sin atender', qualified_no_action: 'Cualificado sin acción', inactive: 'Inactivo' }
function typeLabel(t: string) {
  return TYPE_LABELS[t] || t
}

async function loadSettings() {
  settings.value = await $fetch('/api/admin/saas/leads-routing/sla-settings')
}

async function loadAlerts() {
  loadingAlerts.value = true
  try {
    const res = await $fetch<any>('/api/admin/saas/leads-routing/sla-alerts')
    alerts.value = res.rows
  } finally {
    loadingAlerts.value = false
  }
}

async function saveSettings() {
  savingSettings.value = true
  try {
    settings.value = await $fetch('/api/admin/saas/leads-routing/sla-settings', { method: 'PUT', body: settings.value })
    toast.success('Umbrales guardados')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudieron guardar los umbrales')
  } finally {
    savingSettings.value = false
  }
}

async function resolveAlert(id: number) {
  try {
    await $fetch(`/api/admin/saas/leads-routing/sla-alerts/${id}/resolve`, { method: 'POST' })
    alerts.value = alerts.value.filter((a) => a.id !== id)
    toast.success('Alerta resuelta')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo resolver')
  }
}

await Promise.all([loadSettings(), loadAlerts()])
</script>
