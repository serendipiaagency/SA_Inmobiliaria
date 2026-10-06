<template>
  <div>
  <!-- Property Builder: a dedicated, sectioned editor replaces the flat generic
       form for these two resources only — every other resource below is
       untouched. See components/property-builder/. -->
  <PropertyBuilder v-if="meta && isPropertyBuilderResource" :id="id" :resource="propertyBuilderResource" :can-edit="canEdit" />

  <!-- Sistemas > Empresas: alta guiada por pasos y ficha por secciones, en
       vez del formulario plano. Mismas rutas (/admin/organizations/new y
       /admin/organizations/:id). Ver components/admin/organizations/. -->
  <OrganizationCreateWizard v-else-if="meta && isOrganization && isNew" />
  <OrganizationEditor v-else-if="meta && isOrganization" :id="id" :can-edit="canEdit" />

  <!-- Reglas de enrutado de leads (cierre del núcleo, FASE 15): desplegables
       de oficinas, equipos y comerciales y un editor de horario, en vez del
       id en texto y el JSON a mano. Ver components/admin/leads/RoutingRuleEditor.vue. -->
  <RoutingRuleEditor v-else-if="meta && isRoutingRule" :id="id" :can-edit="canEdit" />

  <div v-else-if="meta">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ isNew ? `Nuevo — ${meta.label}` : `Editar — ${meta.label} #${id}` }}</h1>
      <div class="flex items-center gap-3">
        <NuxtLink v-if="resource === 'developer-properties' && !isNew" :to="`/admin/ai?id=${id}`" class="btn-primary">
          <span class="mr-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">IA</span>
          Generar contenido
        </NuxtLink>
        <AdminAssetExportButton v-if="resource === 'developer-properties' && !isNew" :asset-id="Number(id)" :property-type="record.propertyType" />
        <NuxtLink :to="`/admin/${resource}`" class="btn-secondary">← Volver</NuxtLink>
      </div>
    </div>

    <!-- Readonly detail view. Also the view an admin with only read access to
         this resource's area gets: the API would reject their save anyway
         (server/middleware/01.admin-rbac.ts), so the panel shows the record
         instead of a form that can't be submitted. -->
    <div v-if="meta.readonly || !canEdit" class="card max-w-3xl p-6">
      <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <template v-for="(v, k) in record" :key="k">
          <div v-if="v !== null && v !== ''">
            <dt class="text-xs font-semibold uppercase text-slate-400">{{ fieldLabel(meta, String(k)) }}</dt>
            <dd class="mt-0.5 break-words text-sm text-slate-800">
              <a
                v-if="String(v).match(/\.(pdf|jpg|png|webp)$/i)"
                :href="mediaUrl(String(v))"
                target="_blank"
                class="text-emerald-700 underline"
                >Abrir archivo</a
              >
              <span v-else>{{ v }}</span>
            </dd>
          </div>
        </template>
      </dl>
    </div>

    <!-- Edit form -->
    <form v-else class="card max-w-3xl space-y-4 p-6" @submit.prevent="save">
      <!-- Permisos: users.permissions gets a visual per-area editor instead of the generic
           JSON textarea below, and only a super_admin may see/change it (server-enforced too,
           see the guard in server/api/admin/[resource]/[id].put.ts and index.post.ts). -->
      <AdminUserPermissionsEditor v-if="resource === 'users' && isSuperAdmin" v-model="form.permissions" />

      <div v-for="(fd, field) in meta.fields" :key="field">
        <template v-if="!(resource === 'users' && field === 'permissions')">
        <label class="label">{{ fd.label }} <span v-if="fd.required" class="text-red-500">*</span></label>

        <select v-if="fd.type === 'select'" v-model="form[field]" class="input">
          <option value="">—</option>
          <option v-for="opt in fd.options" :key="opt" :value="opt">{{ fd.optionLabels?.[opt] || opt }}</option>
        </select>

        <!-- Un id de otro recurso (oficina, equipo, comercial, usuario) se
             elige por su nombre, nunca tecleando el número. -->
        <select v-else-if="fd.relation" v-model="form[field]" class="input" :data-relation="fd.relation.resource">
          <option value="">—</option>
          <option v-if="form[field] && !relationOptions[String(field)]?.some((o) => o.id === Number(form[field]))" :value="form[field]">#{{ form[field] }}</option>
          <option v-for="opt in relationOptions[String(field)] || []" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
        </select>

        <textarea v-else-if="fd.type === 'textarea' || fd.type === 'json'" v-model="form[field]" class="input" rows="4" />

        <div v-else-if="fd.type === 'image' || fd.type === 'file'" class="space-y-2">
          <div v-if="form[field]" class="flex items-center gap-3">
            <img
              v-if="fd.type === 'image'"
              :src="mediaUrl(form[field])"
              class="h-16 w-16 rounded border border-slate-200 object-cover"
            >
            <span class="truncate text-xs text-slate-500">{{ form[field] }}</span>
            <button type="button" class="text-sm text-red-600 hover:underline" @click="form[field] = ''">Quitar</button>
          </div>
          <input type="file" :accept="fd.type === 'image' ? 'image/*' : undefined" class="text-sm" @change="upload(String(field), $event)" >
          <p v-if="uploading === field" class="text-xs text-slate-400">Subiendo…</p>
        </div>

        <input v-else-if="fd.type === 'number'" v-model="form[field]" type="number" step="any" class="input" >
        <input v-else v-model="form[field]" class="input" >
        </template>
      </div>

      <!-- Translations (en/ar) -->
      <fieldset v-if="meta.hasTranslations" class="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend class="px-1 text-sm font-semibold text-slate-700">Traducciones</legend>
        <div v-for="tr in translations" :key="tr.locale" class="space-y-2">
          <p class="text-xs font-bold uppercase text-emerald-700">{{ tr.locale }}</p>
          <input v-model="tr.title" class="input" :placeholder="`Título (${tr.locale})`" >
          <textarea v-model="tr.description" class="input" rows="3" :placeholder="`Descripción (${tr.locale})`" />
        </div>
      </fieldset>

      <div class="flex items-center gap-3">
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        <p v-if="saved" class="text-sm font-medium text-emerald-700">Guardado ✓</p>
        <p v-if="error" class="text-sm font-medium text-red-600">{{ error }}</p>
      </div>
    </form>
  </div>
  </div>
</template>

<script setup lang="ts">
import PropertyBuilder from '~/components/property-builder/PropertyBuilder.vue'
import OrganizationCreateWizard from '~/components/admin/organizations/OrganizationCreateWizard.vue'
import OrganizationEditor from '~/components/admin/organizations/OrganizationEditor.vue'
import RoutingRuleEditor from '~/components/admin/leads/RoutingRuleEditor.vue'
import { loadRelationOptions, invalidateRelationOptions, type RelationOption } from '~/composables/useRelationOptions'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { user } = useAuth()
const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

const route = useRoute()
const router = useRouter()
const resource = computed(() => String(route.params.resource))
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const isPropertyBuilderResource = computed(() => resource.value === 'developer-properties' || resource.value === 'properties')
const propertyBuilderResource = computed(() => resource.value as 'developer-properties' | 'properties')
const isOrganization = computed(() => resource.value === 'organizations')
const isRoutingRule = computed(() => resource.value === 'lead-routing-rules')

const { data: resources } = await useFetch<Record<string, any>>('/api/admin/resources')
const meta = computed(() => resources.value?.[resource.value])
if (!meta.value) throw createError({ statusCode: 404, statusMessage: 'Recurso desconocido', fatal: true })
useHead({ title: computed(() => `${meta.value?.label || 'Admin'} — M&M Real Estate`) })

// Granular RBAC (bloque 01): read access to the area shows the record,
// write access shows the form.
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => (meta.value?.area ? canWrite(meta.value.area) : true))

const form = reactive<Record<string, any>>({})
const record = ref<Record<string, any>>({})
const translations = reactive([
  { locale: 'en', title: '', description: '' },
  { locale: 'ar', title: '', description: '' },
])

// PropertyBuilder (and the organizations editor) do their own data loading —
// skip the generic form's fetch entirely rather than duplicating the request.
if (!isNew.value && !isPropertyBuilderResource.value && !isOrganization.value && !isRoutingRule.value) {
  // `useRequestFetch()` y no `$fetch` a secas: en SSR, un `$fetch` suelto
  // arranca una petición nueva que no hereda nada del evento en curso — ni la
  // cookie de sesión ni los bindings de Cloudflare (D1, R2)—, así que esta
  // pantalla respondía 401, y 500 en cuanto la cookie se resolvía. No se
  // notaba navegando desde el listado, porque eso ocurre en el cliente; sí al
  // recargar la ficha o al abrir un enlace directo a un registro, que es
  // justo lo que hace quien comparte la URL de una ficha.
  const res = await useRequestFetch()<any>(`/api/admin/${resource.value}/${id.value}`)
  record.value = res.row
  for (const field of Object.keys(meta.value.fields)) {
    form[field] = res.row[field] ?? ''
  }
  for (const tr of res.translations || []) {
    const slot = translations.find((t) => t.locale === tr.locale)
    if (slot) {
      slot.title = tr.title
      slot.description = tr.description || ''
    }
  }
}

// Opciones de los campos-relación del recurso (oficina, equipo, comercial…).
const relationOptions = reactive<Record<string, RelationOption[]>>({})
onMounted(() => {
  for (const [field, fd] of Object.entries<any>(meta.value?.fields || {})) {
    if (fd?.relation) loadRelationOptions(fd.relation.resource, fd.relation.labelField).then((rows) => (relationOptions[field] = rows))
  }
})

const saving = ref(false)
const saved = ref(false)
const error = ref('')
const uploading = ref('')

async function upload(field: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = field
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', resource.value)
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form[field] = res.key
  } catch (err: any) {
    error.value = err?.statusMessage || 'No se ha podido subir el archivo'
  } finally {
    uploading.value = ''
  }
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    const body: Record<string, any> = { ...form }
    if (meta.value.hasTranslations) {
      body.translations = translations.filter((t) => t.title)
    }
    if (isNew.value) {
      const res = await $fetch<{ id: number }>(`/api/admin/${resource.value}`, { method: 'POST', body })
      router.replace(`/admin/${resource.value}/${res.id}`)
    } else {
      await $fetch(`/api/admin/${resource.value}/${id.value}`, { method: 'PUT', body })
    }
    // Un nombre nuevo o cambiado tiene que verse ya en los desplegables que apuntan a este recurso.
    invalidateRelationOptions(resource.value)
    saved.value = true
  } catch (e: any) {
    error.value = e?.statusMessage || e?.data?.statusMessage || 'No se ha podido guardar'
  } finally {
    saving.value = false
  }
}
</script>
