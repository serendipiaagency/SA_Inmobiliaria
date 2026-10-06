<template>
  <div class="max-w-5xl">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Contactos</h1>
        <p class="mt-1 text-sm text-stone-500">
          Las personas. Un contacto puede tener varias necesidades a la vez y varios leads a lo largo del tiempo.
        </p>
      </div>
      <button type="button" class="dash-btn-primary shrink-0" data-testid="contact-new-toggle" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancelar' : 'Nuevo contacto' }}
      </button>
    </div>

    <AdminPanel v-if="showCreate" title="Nuevo contacto" class="mb-6" data-testid="contact-new-form">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="cfg-label">Nombre</span>
          <input v-model="form.name" class="cfg-input" data-testid="contact-new-name" @blur="checkDuplicates" >
        </label>
        <label class="block">
          <span class="cfg-label">Tipo</span>
          <select v-model="form.kind" class="cfg-input">
            <option value="person">Persona</option>
            <option value="company">Empresa</option>
          </select>
        </label>
        <label class="block">
          <span class="cfg-label">Email</span>
          <input v-model="form.email" type="email" class="cfg-input" data-testid="contact-new-email" @blur="checkDuplicates" >
        </label>
        <label class="block">
          <span class="cfg-label">Teléfono</span>
          <input v-model="form.phone" class="cfg-input" placeholder="+34 600 11 22 33" data-testid="contact-new-phone" @blur="checkDuplicates" >
        </label>
        <!-- Cierre del núcleo (FASE 14): WhatsApp e id externo también cuentan para detectar duplicados. -->
        <label class="block">
          <span class="cfg-label">WhatsApp</span>
          <input v-model="form.whatsapp" class="cfg-input" placeholder="Si es distinto del teléfono" data-testid="contact-new-whatsapp" @blur="checkDuplicates" >
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="cfg-label">Id externo: sistema</span>
            <input v-model="form.externalSource" class="cfg-input" placeholder="Idealista, CRM anterior…" data-testid="contact-new-external-source" @blur="checkDuplicates" >
          </label>
          <label class="block">
            <span class="cfg-label">Id externo</span>
            <input v-model="form.externalId" class="cfg-input" placeholder="Su id en ese sistema" data-testid="contact-new-external-id" @blur="checkDuplicates" >
          </label>
        </div>
      </div>

      <div v-if="duplicates.length" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="contact-new-duplicates">
        <p class="font-medium">
          {{ duplicates.length === 1 ? 'Puede que este contacto ya exista' : 'Puede que este contacto ya exista (varios candidatos)' }}
        </p>
        <ul class="mt-2 space-y-2">
          <li v-for="d in duplicates" :key="d.contactId" class="flex flex-wrap items-center justify-between gap-2" :data-testid="`contact-duplicate-${d.contactId}`">
            <span class="min-w-0">
              <NuxtLink :to="`/admin/contactos/${d.contactId}`" class="font-medium underline">{{ d.name }}</NuxtLink>
              <span class="text-amber-700"> · coincide el {{ d.matchedOn }}</span>
              <span v-if="d.level === 'possible'" class="text-amber-700"> (coincidencia débil)</span>
            </span>
            <span class="flex shrink-0 gap-2">
              <NuxtLink :to="`/admin/contactos/${d.contactId}`" class="rounded border border-amber-400 bg-white px-2 py-0.5 text-[12px] font-medium" :data-testid="`contact-duplicate-open-${d.contactId}`">Abrir</NuxtLink>
              <button type="button" class="rounded border border-amber-400 bg-white px-2 py-0.5 text-[12px] font-medium" :disabled="creating" :data-testid="`contact-duplicate-unify-${d.contactId}`" @click="unify(d.contactId)">
                Unificar
              </button>
            </span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-amber-700">
          Nada se fusiona automáticamente. «Unificar» completa ese contacto con los datos que acabas de escribir y que le falten (nunca cambia los que ya tiene) y lo abre; «Crear igualmente» si de verdad es otra persona.
        </p>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="creating" data-testid="contact-new-save" @click="create(false)">
          {{ creating ? 'Creando…' : 'Crear contacto' }}
        </button>
        <button v-if="duplicates.length" type="button" class="dash-btn-secondary" :disabled="creating" data-testid="contact-new-force" @click="create(true)">
          Crear igualmente
        </button>
        <span v-if="error" class="text-sm font-medium text-red-600" data-testid="contact-new-error">{{ error }}</span>
      </div>
    </AdminPanel>

    <div class="mb-4 flex flex-col gap-2 sm:flex-row">
      <input v-model="search" type="search" class="cfg-input" placeholder="Buscar por nombre, email o teléfono…" >
      <!-- Filtro por rol (FASE 8): una persona puede tener varios. -->
      <select v-model="role" class="cfg-input sm:!w-52" aria-label="Filtrar por rol" data-testid="contacts-role-filter">
        <option value="">Todos los roles</option>
        <option v-for="r in CONTACT_ROLES" :key="r" :value="r">{{ CONTACT_ROLE_LABELS[r] }}</option>
      </select>
      <!-- Filtro por etiqueta (FASE 0, bloque N7b). -->
      <select v-model="tag" class="cfg-input sm:!w-52" aria-label="Filtrar por etiqueta" data-testid="contacts-tag-filter">
        <option value="">Todas las etiquetas</option>
        <option v-for="t in tagOptions" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
      </select>
    </div>

    <div v-if="!contacts.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      {{ search || role || tag ? 'Ningún contacto coincide con la búsqueda.' : 'Todavía no hay contactos.' }}
    </div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Nombre</th>
              <th class="px-4 py-2.5 font-semibold">Contacto</th>
              <th class="px-4 py-2.5 text-right font-semibold">Necesidades</th>
              <th class="px-4 py-2.5 font-semibold">Alta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in contacts" :key="c.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <div class="flex items-start gap-3">
                  <AdminPersonAvatar :photo="c.photo" :name="c.name" />
                  <div class="min-w-0">
                    <NuxtLink :to="`/admin/contactos/${c.id}`" class="font-medium hover:underline">{{ c.name }}</NuxtLink>
                    <span v-if="c.kind === 'company'" class="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-500">Empresa</span>
                    <span v-if="c.roles?.length" class="mt-0.5 block text-[11px] text-stone-400" data-testid="contact-row-roles">{{ c.roles.map((r: string) => CONTACT_ROLE_LABELS[r as ContactRole] || r).join(' · ') }}</span>
                    <TagChips v-if="c.tags?.length" class="mt-1" :tags="c.tags" />
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-stone-600">
                <span v-if="c.email">{{ c.email }}</span>
                <span v-if="c.email && c.phone" class="text-stone-300"> · </span>
                <span v-if="c.phone">{{ c.phone }}</span>
                <span v-if="!c.email && !c.phone" class="text-stone-400">—</span>
              </td>
              <td class="px-4 py-3 text-right tabular-nums">
                <span v-if="c.requirementsCount" class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">{{ c.requirementsCount }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="px-4 py-3 text-stone-500">{{ dt.date(c.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
import { CONTACT_ROLES, CONTACT_ROLE_LABELS, type ContactRole } from '~/utils/crmCatalog'
import TagChips from '~/components/admin/tags/TagChips.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Contactos — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const route = useRoute()
const search = ref('')
const role = ref('')
// `?tags=<id>` llega desde el enlace de una etiqueta; el desplegable lo cambia.
const tag = ref(typeof route.query.tags === 'string' ? route.query.tags : '')
const tagOptions = ref<{ id: number; name: string }[]>([])
onMounted(async () => {
  try {
    tagOptions.value = (await $fetch<{ rows: { id: number; name: string }[] }>('/api/admin/crm-tags')).rows
  } catch {
    tagOptions.value = []
  }
})
const { data, refresh } = await useFetch<any[]>('/api/admin/saas/contacts', {
  query: computed(() => ({ search: search.value || undefined, role: role.value || undefined, tags: tag.value || undefined })),
})
const contacts = computed(() => data.value || [])

const showCreate = ref(false)
const creating = ref(false)
const error = ref('')
const duplicates = ref<any[]>([])
const EMPTY_FORM = { name: '', kind: 'person', email: '', phone: '', whatsapp: '', externalSource: '', externalId: '' }
const form = reactive({ ...EMPTY_FORM })

/**
 * Se consulta mientras se rellena el formulario, no sólo al enviar: es mejor
 * enseñar el contacto que ya existe antes de que alguien lo escriba entero.
 * Cuentan email, teléfono, WhatsApp e id externo (con su sistema).
 */
async function checkDuplicates() {
  if (!form.name && !form.email && !form.phone && !form.whatsapp && !form.externalId) {
    duplicates.value = []
    return
  }
  try {
    const res = await $fetch<{ duplicates: any[] }>('/api/admin/saas/contacts/check-duplicates', { method: 'POST', body: form })
    duplicates.value = res.duplicates
  } catch {
    duplicates.value = []
  }
}

async function create(force: boolean) {
  error.value = ''
  creating.value = true
  try {
    await $fetch('/api/admin/saas/contacts', { method: 'POST', body: { ...form, force } })
    showCreate.value = false
    duplicates.value = []
    Object.assign(form, EMPTY_FORM)
    await refresh()
    toast.success('Contacto creado')
  } catch (err: any) {
    // 409 = hay candidatos; se muestran en vez de tratarlo como un error seco.
    if (err?.statusCode === 409 && err?.data?.data?.duplicates) {
      duplicates.value = err.data.data.duplicates
      // El id externo de otra persona no admite «Crear igualmente»: se dice por qué.
      const message = err?.data?.statusMessage || ''
      error.value = !err.data.data.duplicates.length || /id externo/.test(message) ? message : ''
    } else {
      error.value = err?.data?.statusMessage || 'No se pudo crear el contacto'
    }
  } finally {
    creating.value = false
  }
}

/**
 * «Unificar» (cierre del núcleo, FASE 14): no crea otro contacto — completa
 * el existente con lo que se acaba de escribir y le falte (el servidor nunca
 * pisa un dato que ya tenga, ni le pone uno que sea de otra persona) y lo
 * abre. Queda en la Actividad del contacto.
 */
async function unify(contactId: number) {
  error.value = ''
  creating.value = true
  try {
    const res = await $fetch<{ id: number; filled?: string[]; skipped?: string[] }>('/api/admin/saas/contacts', { method: 'POST', body: { ...form, mergeIntoContactId: contactId } })
    const filled = res.filled?.length ?? 0
    toast.success(filled ? `Unificado: se completaron ${filled} dato${filled === 1 ? '' : 's'}` : 'Unificado: el contacto ya tenía esos datos')
    showCreate.value = false
    duplicates.value = []
    Object.assign(form, EMPTY_FORM)
    await navigateTo(`/admin/contactos/${res.id}`)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'No se pudo unificar'
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.cfg-label {
  @apply mb-1.5 block text-[12px] font-medium text-stone-600;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
</style>
