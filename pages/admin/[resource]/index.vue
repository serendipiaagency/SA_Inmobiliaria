<template>
  <div v-if="meta">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ meta.label }}</h1>
      <div class="flex flex-wrap gap-2">
        <input v-model="q" class="input !w-56" placeholder="Buscar…" @keyup.enter="page = 1" >
        <button v-if="meta.softDelete" type="button" class="btn-secondary" data-testid="resource-trash-toggle" @click="toggleTrash">
          {{ trashed ? '← Volver al listado' : 'Papelera' }}
        </button>
        <NuxtLink v-if="!meta.readonly && canEdit && !trashed" :to="`/admin/${resource}/new`" class="btn-primary">+ Nuevo</NuxtLink>
      </div>
    </div>

    <!-- Sistemas > Empresas: la cuenta demo comercial (sólo super admin, como esta lista). -->
    <AdminOrganizationsDemoAccountPanel v-if="resource === 'organizations' && !trashed" />

    <div class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <!-- Nombre declarado por el recurso si lo tiene; si no, uno
                 legible. Nunca el nombre crudo de la columna. -->
            <th v-for="f in meta.listFields" :key="f" class="px-4 py-3">{{ fieldLabel(meta, f) }}</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data?.rows || []" :key="row.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td v-for="f in meta.listFields" :key="f" class="max-w-xs truncate px-4 py-3" :data-field="f">
              {{ cell(f, row[f], row) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <template v-if="trashed">
                <button v-if="canEdit" class="mr-3 font-medium text-emerald-700 hover:underline" data-testid="resource-restore" @click="restore(row.id)">Restaurar</button>
                <button v-if="canEdit" class="font-medium text-red-600 hover:underline" @click="remove(row.id, true)">Eliminar definitivamente</button>
              </template>
              <template v-else>
                <NuxtLink :to="`/admin/${resource}/${row.id}`" class="mr-3 font-medium text-emerald-700 hover:underline">
                  {{ meta.readonly || !canEdit ? 'Ver' : 'Editar' }}
                </NuxtLink>
                <button v-if="canEdit" class="font-medium text-red-600 transition hover:underline active:scale-95" @click="remove(row.id)">Eliminar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td :colspan="meta.listFields.length + 1" class="px-4 py-14 text-center">
              <p class="text-sm font-medium text-slate-500">{{ trashed ? 'La papelera está vacía' : `Sin resultados en ${meta.label}` }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ q ? 'Prueba con otro término de búsqueda.' : 'Todavía no hay registros aquí.' }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-end gap-3 text-sm">
      <button class="btn-secondary !py-1.5" :disabled="page <= 1" @click="page--">← Anterior</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary !py-1.5" :disabled="page >= totalPages" @click="page++">Siguiente →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { organizationCellLabel } from '~/utils/organizationLabels'
import { loadRelationOptions, invalidateRelationOptions } from '~/composables/useRelationOptions'

definePageMeta({ layout: 'admin', middleware: 'admin' })

// Estable al salir de la página (composables/useAdminRouteParam.ts).
const resourceParam = useAdminRouteParam('resource')
const resource = resourceParam.value
const q = ref('')
const page = ref(1)
const trashed = ref(false)

const { data: resources, refresh: refreshResources } = await useFetch<Record<string, any>>('/api/admin/resources')
// Si la respuesta compartida llega vacía (Nuxt la descartó al desmontarse la
// página anterior, ver nuxt.config.ts › purgeCachedData), se pide otra vez
// antes de decidir que el recurso no existe.
if (!resources.value) await refreshResources()
const meta = computed(() => resources.value?.[resource.value])
// Sólo es un 404 si la ruta es de verdad de esta página: al salir de ella
// hacia otra, la ruta nueva no trae `resource` y no hay nada que reportar.
if (!meta.value && resources.value && resourceParam.onThisRoute.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recurso desconocido', fatal: true })
}
useHead({ title: computed(() => `${meta.value?.label || 'Admin'} — M&M Real Estate`) })

// Write actions are hidden for an admin who only has read access to this
// resource's area — the API rejects them either way
// (server/middleware/01.admin-rbac.ts); this just stops the panel offering
// buttons that can only fail.
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => (meta.value?.area ? canWrite(meta.value.area) : true))

const { data, refresh } = await useFetch<any>(() => `/api/admin/${resource.value}`, {
  // Sin recurso (componente que se está retirando) no hay listado que pedir.
  immediate: !!meta.value,
  query: computed(() => ({ page: page.value, q: q.value, trashed: trashed.value ? 1 : undefined })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))

watch(resource, () => {
  page.value = 1
  q.value = ''
  trashed.value = false
})

function toggleTrash() {
  trashed.value = !trashed.value
  page.value = 1
}

// Empresas: estado y origen del alta en palabras («Activa», «Registro web»),
// no el valor guardado. El resto de recursos muestran el dato tal cual.
function cell(field: string, value: unknown, row: Record<string, any> = {}) {
  if (resource.value === 'organizations') return organizationCellLabel(field, value) ?? value
  const fd = meta.value?.fields?.[field]
  if (value === null || value === undefined || value === '') return value
  // Reglas de enrutado: el valor de una regla de oficina o equipo es su id; se lee por su nombre.
  if (resource.value === 'lead-routing-rules' && field === 'matchValue' && (row.scope === 'office' || row.scope === 'team')) {
    return routingMatchLabels[row.scope]?.get(Number(value)) ?? `#${value}`
  }
  // Un id de otro recurso se lee por su nombre; un valor de desplegable, por su etiqueta.
  if (fd?.relation) return relationLabels[field]?.get(Number(value)) ?? `#${value}`
  if (fd?.optionLabels?.[String(value)]) return fd.optionLabels[String(value)]
  return value
}

// Nombres de los registros a los que apuntan las columnas-relación del listado.
const relationLabels = reactive<Record<string, Map<number, string>>>({})
function loadListRelations() {
  for (const field of meta.value?.listFields || []) {
    const fd = meta.value?.fields?.[field]
    if (fd?.relation) loadRelationOptions(fd.relation.resource, fd.relation.labelField).then((rows) => (relationLabels[field] = new Map(rows.map((r) => [r.id, r.label]))))
  }
}
onMounted(loadListRelations)
watch(resource, loadListRelations)

// Nombres de oficinas y equipos para el «Valor a comparar» de las reglas de enrutado.
const routingMatchLabels = reactive<Record<string, Map<number, string>>>({})
function loadRoutingMatchLabels() {
  if (resource.value !== 'lead-routing-rules') return
  for (const [scope, res] of [['office', 'offices'], ['team', 'teams']] as const) {
    loadRelationOptions(res).then((rows) => (routingMatchLabels[scope] = new Map(rows.map((r) => [r.id, r.label]))))
  }
}
onMounted(loadRoutingMatchLabels)
watch(resource, loadRoutingMatchLabels)

const { confirm } = useConfirm()
const toast = useToast()

async function remove(id: number, hard = false) {
  // Con Papelera, «Eliminar» se puede deshacer; sólo el borrado definitivo no.
  const toTrash = !!meta.value?.softDelete && !hard
  const ok = await confirm(toTrash ? 'Irá a la papelera, desde donde podrás restaurarlo.' : 'Esta acción no se puede deshacer.', {
    title: toTrash ? '¿Mover a la papelera?' : '¿Eliminar este registro definitivamente?',
    confirmLabel: toTrash ? 'Mover a la papelera' : 'Eliminar',
    danger: true,
  })
  if (!ok) return
  try {
    // Explicit generic: a dynamic `resource` segment makes Nitro's typed-route
    // inference match the wrong route's (GET/PUT-only) method union otherwise.
    await $fetch<{ ok: true }>(`/api/admin/${resource.value}/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' })
    invalidateRelationOptions(resource.value)
    await refresh()
    toast.success(toTrash ? 'Movido a la papelera' : 'Registro eliminado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se ha podido eliminar el registro')
  }
}

async function restore(id: number) {
  try {
    await $fetch<{ ok: true }>(`/api/admin/${resource.value}/${id}/restore`, { method: 'POST' })
    invalidateRelationOptions(resource.value)
    await refresh()
    toast.success('Restaurado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se ha podido restaurar')
  }
}
</script>
