<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">API</h1>
        <p class="mt-1 text-sm text-stone-500">Claves de acceso y documentación de la API REST</p>
      </div>
      <button class="dash-btn-primary" @click="showCreate = !showCreate">+ Generar clave</button>
    </div>

    <div v-if="showCreate" class="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
      <div class="flex-1 min-w-[180px]">
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">Nombre</label>
        <input v-model="newKeyName" type="text" placeholder="p. ej. Integración web" class="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-ink focus:outline-none" @keyup.enter="createKey" />
      </div>
      <div>
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">Entorno</label>
        <select v-model="newKeyEnv" class="rounded-lg border border-line px-3 py-2 text-sm focus:border-ink focus:outline-none">
          <option value="live">live</option>
          <option value="test">test</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">Permisos</label>
        <select v-model="newKeyScopes" class="rounded-lg border border-line px-3 py-2 text-sm focus:border-ink focus:outline-none">
          <option value="read">solo lectura</option>
          <option value="write">lectura y escritura</option>
        </select>
      </div>
      <button class="dash-btn-primary" :disabled="creating" @click="createKey">{{ creating ? 'Generando…' : 'Crear' }}</button>
    </div>

    <div v-if="createdKey" class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p class="text-sm font-semibold text-emerald-800">Clave generada — cópiala ahora, no volverá a mostrarse completa.</p>
      <div class="mt-2 flex items-center gap-2">
        <code class="flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs text-stone-700">{{ createdKey }}</code>
        <button class="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100" @click="copyKey">{{ copied ? 'Copiado ✓' : 'Copiar' }}</button>
      </div>
      <button class="mt-2 text-xs text-emerald-700 underline" @click="createdKey = ''">Entendido, cerrar</button>
    </div>

    <AdminPanel title="Claves de API" sub="Úsalas en la cabecera Authorization: Bearer" :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Nombre</th>
              <th class="px-4 py-2.5 font-semibold">Clave</th>
              <th class="px-4 py-2.5 font-semibold">Entorno</th>
              <th class="px-4 py-2.5 font-semibold">Permisos</th>
              <th class="px-4 py-2.5 font-semibold">Último uso</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="k in rows" :key="k.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50" :class="{ 'opacity-50': k.revoked }">
              <td class="px-4 py-3 font-medium">{{ k.name }}</td>
              <td class="px-4 py-3"><code class="rounded bg-stone-100 px-2 py-1 font-mono text-xs">{{ k.prefix }}••••••••</code></td>
              <td class="px-4 py-3">
                <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="k.environment === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ k.environment }}</span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ k.scopes }}</td>
              <td class="px-4 py-3 text-stone-500">{{ k.revoked ? 'Revocada' : dt.relative(k.lastUsedAt) }}</td>
              <td class="px-4 py-3 text-right">
                <button v-if="!k.revoked" class="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50" @click="revokeKey(k)">Revocar</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="px-4 py-6 text-center text-sm text-stone-400">Aún no hay claves generadas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <AdminPanel title="Endpoints públicos">
        <ul class="space-y-2.5 text-sm">
          <li v-for="e in endpoints" :key="e.path" class="flex items-center gap-3">
            <span class="w-14 shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-center text-[11px] font-bold text-emerald-700">{{ e.method }}</span>
            <code class="font-mono text-xs text-stone-700">{{ e.path }}</code>
            <span class="ml-auto hidden text-xs text-stone-400 sm:block">{{ e.desc }}</span>
          </li>
        </ul>
      </AdminPanel>

      <AdminPanel title="Ejemplo de petición">
        <pre class="overflow-x-auto rounded-lg bg-ink p-4 text-xs leading-relaxed text-stone-100"><code>curl https://sa-inmobiliaria.com/api/v1/properties \
  -H "Authorization: Bearer sa_live_••••" \
  -H "Content-Type: application/json"</code></pre>
        <p class="mt-3 text-xs text-stone-500">Límite: 1.000 peticiones/hora por clave. Respuestas en JSON, paginación por cursor.</p>
      </AdminPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'API — M&M Real Estate' })
const dt = useDash()
const toast = useToast()
const confirm = useConfirm()

const { data, refresh } = await useFetch<any>('/api/admin/saas/apikeys')
const rows = computed<any[]>(() => data.value?.rows || [])

const showCreate = ref(false)
const newKeyName = ref('')
const newKeyEnv = ref('live')
const newKeyScopes = ref('read')
const creating = ref(false)
const createdKey = ref('')
const copied = ref(false)

async function createKey() {
  if (creating.value) return
  creating.value = true
  try {
    const res = await $fetch<any>('/api/admin/saas/apikeys', {
      method: 'POST',
      body: { name: newKeyName.value, environment: newKeyEnv.value, scopes: newKeyScopes.value },
    })
    createdKey.value = res.plainKey
    newKeyName.value = ''
    showCreate.value = false
    await refresh()
    toast.success('Clave generada')
  } catch {
    toast.error('No se pudo generar la clave')
  } finally {
    creating.value = false
  }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(createdKey.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.error('No se pudo copiar')
  }
}

async function revokeKey(k: any) {
  const ok = await confirm.confirm(`¿Revocar la clave "${k.name}"? Esta acción no se puede deshacer.`, {
    title: 'Revocar clave',
    confirmLabel: 'Revocar',
    danger: true,
  })
  if (!ok) return
  try {
    await $fetch(`/api/admin/saas/apikeys/${k.id}`, { method: 'PATCH' })
    await refresh()
    toast.success('Clave revocada')
  } catch {
    toast.error('No se pudo revocar la clave')
  }
}

const endpoints = [
  { method: 'GET', path: '/api/v1/properties', desc: 'Listar propiedades' },
  { method: 'GET', path: '/api/v1/properties/:id', desc: 'Detalle' },
  { method: 'GET', path: '/api/v1/communities', desc: 'Comunidades' },
  { method: 'POST', path: '/api/v1/leads', desc: 'Crear lead' },
  { method: 'GET', path: '/api/v1/agents', desc: 'Agentes' },
]
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black;
}
</style>
