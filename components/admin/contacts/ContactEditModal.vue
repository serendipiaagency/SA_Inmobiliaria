<template>
  <AdminCommsModal title="Editar contacto" sub="Cabecera del contacto: datos de contacto, roles y seguimiento." wide test-id="contact-edit-modal" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="save()">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="ce-label">Nombre <span class="text-red-500">*</span></span>
          <input v-model="form.name" class="ce-input" data-testid="contact-edit-name" required >
        </label>
        <label class="block">
          <span class="ce-label">Tipo</span>
          <select v-model="form.kind" class="ce-input">
            <option value="person">Persona</option>
            <option value="company">Empresa</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Estado</span>
          <select v-model="form.status" class="ce-input">
            <option v-for="s in CONTACT_STATUSES" :key="s" :value="s">{{ CONTACT_STATUS_LABELS[s] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Email</span>
          <input v-model="form.email" type="email" class="ce-input" data-testid="contact-edit-email" >
        </label>
        <label class="block">
          <span class="ce-label">Teléfono</span>
          <input v-model="form.phone" class="ce-input" data-testid="contact-edit-phone" >
        </label>
        <label class="block">
          <span class="ce-label">WhatsApp</span>
          <input v-model="form.whatsapp" class="ce-input" placeholder="Si es distinto del teléfono" data-testid="contact-edit-whatsapp" >
        </label>
        <!-- Id en otro sistema (cierre del núcleo, FASE 14): va con su sistema y cuenta para los duplicados. -->
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="ce-label">Id externo: sistema</span>
            <input v-model="form.externalSource" class="ce-input" placeholder="Idealista, CRM anterior…" data-testid="contact-edit-external-source" >
          </label>
          <label class="block">
            <span class="ce-label">Id externo</span>
            <input v-model="form.externalId" class="ce-input" data-testid="contact-edit-external-id" >
          </label>
        </div>
        <label class="block">
          <span class="ce-label">Idioma</span>
          <select v-model="form.language" class="ce-input" data-testid="contact-edit-language">
            <option :value="null">—</option>
            <option v-for="l in LANGUAGE_OPTIONS" :key="l" :value="l">{{ LANGUAGE_LABELS[l] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">País</span>
          <input v-model="form.country" class="ce-input" data-testid="contact-edit-country" >
        </label>
        <label class="block">
          <span class="ce-label">Origen</span>
          <select v-model="form.source" class="ce-input" data-testid="contact-edit-source">
            <option :value="null">—</option>
            <option v-for="s in CONTACT_SOURCES" :key="s" :value="s">{{ CONTACT_SOURCE_LABELS[s] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Comercial responsable</span>
          <select v-model="form.assignedCommercialId" class="ce-input">
            <option :value="null">Sin asignar</option>
            <option v-for="o in commercials" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Oficina</span>
          <select v-model="form.officeId" class="ce-input">
            <option :value="null">—</option>
            <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Próxima acción</span>
          <select v-model="form.nextActionType" class="ce-input" data-testid="contact-edit-next-action">
            <option :value="null">—</option>
            <option v-for="t in NEXT_ACTION_TYPES" :key="t" :value="t">{{ NEXT_ACTION_LABELS[t] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="ce-label">Fecha de la próxima acción</span>
          <input v-model="form.nextActionAt" type="datetime-local" class="ce-input" data-testid="contact-edit-next-action-at" >
        </label>
      </div>

      <div>
        <p class="ce-label">Roles (puede tener varios)</p>
        <div class="flex flex-wrap gap-2" data-testid="contact-edit-roles">
          <button
            v-for="r in CONTACT_ROLES"
            :key="r"
            type="button"
            class="rounded-full border px-3 py-1 text-[12px] font-medium transition"
            :class="form.roles.includes(r) ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
            :aria-pressed="form.roles.includes(r)"
            :data-role="r"
            @click="toggleRole(r)"
          >
            {{ CONTACT_ROLE_LABELS[r] }}
          </button>
        </div>
      </div>

      <label class="block">
        <span class="ce-label">Notas de la ficha</span>
        <textarea v-model="form.notes" class="ce-input" rows="3" />
      </label>

      <div v-if="duplicates.length" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900" data-testid="contact-edit-duplicates">
        <p class="font-medium">Ese email, teléfono, WhatsApp o id externo ya es de otro contacto de tu agencia:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="d in duplicates" :key="d.contactId">
            <NuxtLink :to="`/admin/contactos/${d.contactId}`" class="underline">{{ d.name }}</NuxtLink> ({{ d.email || d.phone }}, coincide por {{ d.matchedOn }})
          </li>
        </ul>
        <p class="mt-1">Si de verdad son dos personas distintas, guarda igualmente; si es la misma, fusiónalas desde «Ficha → Posibles duplicados».</p>
      </div>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">Cancelar</button>
      <button v-if="duplicates.length" type="button" class="rounded-lg border border-amber-400 px-3 py-2 text-[13px] font-medium text-amber-800" :disabled="saving" @click="save(true)">Guardar igualmente</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !form.name.trim()" data-testid="contact-edit-save" @click="save()">
        {{ saving ? 'Guardando…' : 'Guardar' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  CONTACT_SOURCES,
  CONTACT_SOURCE_LABELS,
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  NEXT_ACTION_LABELS,
  NEXT_ACTION_TYPES,
} from '~/utils/crmCatalog'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'

/**
 * Edición de la cabecera de un contacto (CRM 360, FASE 9). Guarda con
 * PUT /api/admin/contacts/:id, que normaliza teléfono/email, comprueba que
 * no sean de otra persona de la agencia (409 con los candidatos) y deja los
 * roles exactamente como se marcan aquí.
 */
const props = defineProps<{ contact: Record<string, any> }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const toast = useToast()

const form = reactive({
  name: props.contact.name || '',
  kind: props.contact.kind || 'person',
  status: props.contact.status || 'active',
  email: props.contact.email || '',
  phone: props.contact.phone || '',
  whatsapp: props.contact.whatsapp || '',
  externalSource: props.contact.externalSource || '',
  externalId: props.contact.externalId || '',
  language: props.contact.language || null,
  country: props.contact.country || '',
  source: props.contact.source || null,
  assignedCommercialId: props.contact.assignedCommercialId ?? null,
  officeId: props.contact.officeId ?? null,
  nextActionType: props.contact.nextActionType || null,
  nextActionAt: props.contact.nextActionAt ? String(props.contact.nextActionAt).replace(' ', 'T').slice(0, 16) : '',
  notes: props.contact.notes || '',
  roles: [...(props.contact.roles || [])] as string[],
})

const commercials = ref<RelationOption[]>([])
const offices = ref<RelationOption[]>([])
onMounted(() => {
  loadRelationOptions('team').then((r) => (commercials.value = r))
  loadRelationOptions('offices').then((r) => (offices.value = r))
})

function toggleRole(r: string) {
  form.roles = form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r]
}

const saving = ref(false)
const error = ref('')
const duplicates = ref<any[]>([])

async function save(force = false) {
  saving.value = true
  error.value = ''
  try {
    await $fetch<{ ok: true }>(`/api/admin/contacts/${props.contact.id}`, {
      method: 'PUT',
      body: { ...form, nextActionAt: form.nextActionAt ? form.nextActionAt.replace('T', ' ') : null, force },
    })
    toast.success('Contacto guardado')
    emit('saved')
  } catch (e: any) {
    if (e?.statusCode === 409 || e?.status === 409) {
      duplicates.value = e?.data?.data?.duplicates || []
      // Un id externo de otro contacto no admite «guardar igualmente» (es único por sistema): se dice el motivo.
      const message = e?.data?.statusMessage || ''
      if (!duplicates.value.length || /id externo/.test(message)) error.value = message || 'Ese dato ya es de otro contacto'
    } else {
      error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar'
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ce-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.ce-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>
