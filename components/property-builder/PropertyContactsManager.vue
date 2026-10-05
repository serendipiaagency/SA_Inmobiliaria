<template>
  <div data-testid="property-contacts">
    <p v-if="!parentId" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
      Guarda la propiedad primero; después podrás añadir sus propietarios y contactos.
    </p>
    <template v-else>
      <p class="mb-3 text-[13px] text-stone-500">
        Propietarios, copropietarios (con su % de propiedad), apoderados, inquilinos y otros contactos de esta propiedad. Cada persona es un contacto del CRM: lo que se apunte aquí aparece también en su ficha, pestaña «Propiedades».
      </p>

      <ul v-if="rows.length" class="mb-4 divide-y divide-line rounded-xl border border-line bg-white">
        <li v-for="r in rows" :key="r.id" class="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="property-contact-row">
          <NuxtLink :to="`/admin/contactos/${r.contactId}`" class="min-w-0 flex-1">
            <span class="block truncate text-[14px] font-medium text-ink">{{ r.contact?.name || `Contacto #${r.contactId}` }}</span>
            <span class="block truncate text-[11px] text-stone-400">{{ [r.contact?.phone, r.contact?.email].filter(Boolean).join(' · ') || 'Sin datos de contacto' }}</span>
          </NuxtLink>
          <select :value="r.role" class="pe-input !w-40" :aria-label="`Papel de ${r.contact?.name}`" :disabled="!canEdit" @change="update(r, { role: ($event.target as HTMLSelectElement).value })">
            <option v-for="role in PROPERTY_CONTACT_ROLES" :key="role" :value="role">{{ PROPERTY_CONTACT_ROLE_LABELS[role] }}</option>
          </select>
          <label v-if="isOwnership(r.role)" class="flex items-center gap-1 text-[12px] text-stone-500">
            <input
              :value="r.ownershipPct ?? ''"
              type="number"
              min="0"
              max="100"
              step="0.01"
              class="pe-input !w-24"
              :aria-label="`Porcentaje de ${r.contact?.name}`"
              :disabled="!canEdit"
              data-testid="property-contact-pct"
              @change="update(r, { ownershipPct: numOrNull(($event.target as HTMLInputElement).value) })"
            >
            %
          </label>
          <button v-if="canEdit" type="button" class="text-[12px]" :class="r.isPrimary ? 'font-semibold text-amber-700' : 'text-stone-400 hover:text-ink'" @click="update(r, { isPrimary: r.isPrimary ? 0 : 1 })">
            {{ r.isPrimary ? '★ Principal' : '☆ Principal' }}
          </button>
          <button v-if="canEdit" type="button" class="text-[12px] text-red-600 hover:underline" @click="remove(r)">Quitar</button>
        </li>
      </ul>
      <p v-else class="mb-4 rounded-xl border border-dashed border-line px-6 py-6 text-center text-sm text-stone-500">Todavía no hay propietarios ni contactos.</p>

      <p v-if="ownershipTotal > 0" class="mb-4 text-[12px]" :class="ownershipTotal === 100 ? 'text-emerald-700' : 'text-amber-700'" data-testid="property-contacts-total">
        Propiedad asignada: {{ ownershipTotal.toLocaleString('es-ES') }} %{{ ownershipTotal === 100 ? '' : ' (no suma el 100 %)' }}
      </p>

      <!-- Añadir: buscar un contacto existente o crear uno nuevo -->
      <div v-if="canEdit" class="rounded-xl border border-line bg-stone-50/60 p-4">
        <p class="pe-label">Añadir propietario o contacto</p>
        <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div class="relative">
            <input v-model="search" class="pe-input w-full" placeholder="Busca por nombre, email o teléfono…" aria-label="Buscar contacto" data-testid="property-contact-search" @focus="searchOpen = true" >
            <ul v-if="searchOpen && search.trim() && results.length" class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
              <li v-for="c in results" :key="c.id">
                <button type="button" class="block w-full px-3 py-2 text-left text-[13px] hover:bg-stone-50" :data-testid="`property-contact-result-${c.id}`" @click="pick(c)">
                  <span class="font-medium">{{ c.name }}</span>
                  <span class="block text-[11px] text-stone-400">{{ [c.phone, c.email].filter(Boolean).join(' · ') }}</span>
                </button>
              </li>
            </ul>
            <p v-if="picked" class="mt-1 text-[12px] text-stone-600">Seleccionado: <strong>{{ picked.name }}</strong> <button type="button" class="ml-1 text-stone-400 hover:text-ink" @click="picked = null">✕</button></p>
          </div>
          <select v-model="newRole" class="pe-input" aria-label="Papel" data-testid="property-contact-role">
            <option v-for="role in PROPERTY_CONTACT_ROLES" :key="role" :value="role">{{ PROPERTY_CONTACT_ROLE_LABELS[role] }}</option>
          </select>
          <input v-if="isOwnership(newRole)" v-model.number="newPct" type="number" min="0" max="100" step="0.01" class="pe-input sm:w-24" placeholder="%" aria-label="% de propiedad" data-testid="property-contact-new-pct" >
        </div>

        <details class="mt-3" :open="creating">
          <summary class="cursor-pointer text-[12px] font-medium text-stone-600" @click.prevent="creating = !creating">¿No existe? Crear el contacto aquí</summary>
          <div v-if="creating" class="mt-2 grid gap-2 sm:grid-cols-3">
            <input v-model="newContact.name" class="pe-input" placeholder="Nombre" aria-label="Nombre del nuevo contacto" data-testid="property-contact-new-name" >
            <input v-model="newContact.phone" class="pe-input" placeholder="Teléfono" aria-label="Teléfono del nuevo contacto" data-testid="property-contact-new-phone" >
            <input v-model="newContact.email" type="email" class="pe-input" placeholder="Email" aria-label="Email del nuevo contacto" >
          </div>
          <div v-if="createDuplicates.length" class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-900">
            Ya existe:
            <button v-for="d in createDuplicates" :key="d.contactId" type="button" class="ml-1 underline" @click="pick({ id: d.contactId, name: d.name })">{{ d.name }}</button>
            — o <button type="button" class="underline" @click="add(true)">créalo igualmente</button>.
          </div>
        </details>

        <div class="mt-3 flex justify-end">
          <button type="button" class="pe-btn-dark" :disabled="saving || (!picked && !(creating && newContact.name.trim()))" data-testid="property-contact-add" @click="add()">
            {{ saving ? 'Añadiendo…' : 'Añadir' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { OWNERSHIP_ROLES, PROPERTY_CONTACT_ROLES, PROPERTY_CONTACT_ROLE_LABELS, type PropertyContactRole } from '~/utils/crmCatalog'

/**
 * Sección «Propietarios» del editor de propiedades (FASE 8 y 25):
 * PropertyContact en los dos catálogos, sobre el recurso genérico
 * `property-contacts`. El servidor valida que la propiedad y el contacto sean
 * de la agencia, el papel y que los propietarios no pasen del 100 %.
 */
const props = withDefaults(defineProps<{ parentId: number | null; kind: 'agent' | 'developer'; canEdit?: boolean }>(), { canEdit: true })
const toast = useToast()
const { confirm } = useConfirm()

const rows = ref<any[]>([])
async function load() {
  if (!props.parentId) return
  const res = await $fetch<{ rows: any[] }>('/api/admin/property-contacts', { query: { propertyKind: props.kind, propertyId: props.parentId, perPage: 100 } }).catch(() => ({ rows: [] }))
  rows.value = res.rows
}
onMounted(load)
watch(() => props.parentId, load)

const ownershipTotal = computed(() => rows.value.filter((r) => isOwnership(r.role)).reduce((sum, r) => sum + (Number(r.ownershipPct) || 0), 0))

function isOwnership(role: string): boolean {
  return (OWNERSHIP_ROLES as readonly string[]).includes(role)
}
function numOrNull(v: string) {
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function update(r: any, patch: Record<string, unknown>) {
  try {
    if (patch.role && !isOwnership(String(patch.role))) patch.ownershipPct = null
    await $fetch<{ ok: true }>(`/api/admin/property-contacts/${r.id}`, { method: 'PUT', body: patch })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
    await load()
  }
}

async function remove(r: any) {
  const ok = await confirm(`${r.contact?.name || 'Este contacto'} dejará de figurar en esta propiedad (el contacto no se borra).`, { title: '¿Quitar de la propiedad?', confirmLabel: 'Quitar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/property-contacts/${r.id}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo quitar')
  }
}

// --- Buscar / crear contacto ---------------------------------------------------
const search = ref('')
const searchOpen = ref(false)
const results = ref<any[]>([])
const picked = ref<{ id: number; name: string } | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!v.trim()) return (results.value = [])
    results.value = await $fetch<any[]>('/api/admin/saas/contacts', { query: { search: v.trim(), limit: 10 } }).catch(() => [])
  }, 250)
})
function pick(c: { id: number; name: string }) {
  picked.value = { id: c.id, name: c.name }
  searchOpen.value = false
  search.value = ''
  creating.value = false
  createDuplicates.value = []
}

const newRole = ref<PropertyContactRole>('owner')
const newPct = ref<number | null>(null)
const creating = ref(false)
const newContact = reactive({ name: '', phone: '', email: '' })
const createDuplicates = ref<any[]>([])
const saving = ref(false)

async function add(force = false) {
  saving.value = true
  try {
    let contactId = picked.value?.id ?? null
    if (!contactId && creating.value) {
      try {
        const res = await $fetch<{ id: number }>('/api/admin/contacts', { method: 'POST', body: { name: newContact.name.trim(), phone: newContact.phone.trim() || null, email: newContact.email.trim() || null, force } })
        contactId = res.id
      } catch (e: any) {
        if (e?.statusCode === 409 || e?.status === 409) {
          createDuplicates.value = e?.data?.data?.duplicates || []
          return
        }
        throw e
      }
    }
    if (!contactId) return
    await $fetch('/api/admin/property-contacts', {
      method: 'POST',
      body: { propertyKind: props.kind, propertyId: props.parentId, contactId, role: newRole.value, ownershipPct: isOwnership(newRole.value) ? newPct.value : null },
    })
    picked.value = null
    newPct.value = null
    creating.value = false
    createDuplicates.value = []
    Object.assign(newContact, { name: '', phone: '', email: '' })
    await load()
    toast.success('Añadido a la propiedad')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo añadir')
  } finally {
    saving.value = false
  }
}
</script>
