<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">API</h1>
        <p class="mt-1 text-sm text-stone-500">Claves de acceso y documentación de la API REST</p>
      </div>
      <button class="dash-btn-primary">+ Generar clave</button>
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
            <tr v-for="k in rows" :key="k.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ k.name }}</td>
              <td class="px-4 py-3"><code class="rounded bg-stone-100 px-2 py-1 font-mono text-xs">{{ k.prefix }}••••••••</code></td>
              <td class="px-4 py-3">
                <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="k.environment === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ k.environment }}</span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ k.scopes }}</td>
              <td class="px-4 py-3 text-stone-500">{{ dt.relative(k.lastUsedAt) }}</td>
              <td class="px-4 py-3 text-right">
                <button class="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50">Revocar</button>
              </td>
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

const { data } = await useFetch<any>('/api/admin/saas/apikeys')
const rows = computed<any[]>(() => data.value?.rows || [])

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
