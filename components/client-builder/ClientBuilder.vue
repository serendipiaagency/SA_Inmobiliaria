<template>
  <div>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <NuxtLink :to="backTo" class="text-xs font-medium text-stone-400 hover:text-ink">← {{ isCreate ? 'Clientes' : 'Ficha del cliente' }}</NuxtLink>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ isCreate ? 'Nuevo cliente' : form.name || 'Cliente' }}</h1>
        <p class="mt-1 text-sm text-stone-500">{{ isCreate ? 'Da de alta un cliente en tu cartera.' : 'Edita su información.' }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <NuxtLink :to="backTo" class="btn-quiet">Cancelar</NuxtLink>
        <button type="button" class="btn-primary" :disabled="saving || !dirty" @click="save">
          {{ saving ? 'Guardando…' : isCreate ? 'Crear cliente' : 'Guardar cambios' }}
        </button>
      </div>
    </div>

    <p v-if="loadError" class="card p-6 text-sm text-red-600">{{ loadError }}</p>

    <form v-else class="grid gap-6 lg:grid-cols-3" @submit.prevent="save">
      <div class="space-y-6 lg:col-span-2">
        <AdminPanel title="Datos personales" sub="Cómo identificas a esta persona en tu cartera.">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="label">Nombre completo <span class="text-red-500">*</span></span>
              <input v-model="form.name" class="input" :class="errors.name ? '!border-red-400' : ''" @blur="touch('name')" >
              <span v-if="errors.name" class="mt-1 block text-[12px] text-red-600">{{ errors.name }}</span>
            </label>
            <label class="block">
              <span class="label">Email</span>
              <input v-model="form.email" type="email" class="input" :class="errors.email ? '!border-red-400' : ''" placeholder="nombre@dominio.com" @blur="touch('email')" >
              <span v-if="errors.email" class="mt-1 block text-[12px] text-red-600">{{ errors.email }}</span>
              <span v-else class="mt-1 block text-[11px] text-stone-400">Es lo que enlaza a esta persona con sus visitas y contratos.</span>
            </label>
            <label class="block">
              <span class="label">Teléfono</span>
              <input v-model="form.phone" class="input" placeholder="+34 600 000 000" >
            </label>
          </div>
        </AdminPanel>

        <AdminPanel title="Información comercial" sub="Cómo trabajáis con este cliente.">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Tipo de cliente</span>
              <select v-model="form.type" class="input">
                <option v-for="t in CLIENT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Estado</span>
              <select v-model="form.stage" class="input">
                <option v-for="s in CLIENT_STAGES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Comercial responsable</span>
              <input v-model="form.agentName" class="input" list="client-agent-options" placeholder="Nombre del comercial" >
              <datalist id="client-agent-options">
                <option v-for="a in agentNames" :key="a" :value="a" />
              </datalist>
              <span class="mt-1 block text-[11px] text-stone-400">Texto libre: el modelo guarda el nombre, no una referencia a la ficha del comercial.</span>
            </label>
            <label class="block">
              <span class="label">Ubicación</span>
              <input v-model="form.location" class="input" placeholder="Marbella, Málaga" >
            </label>
          </div>
        </AdminPanel>

        <AdminPanel title="Notas" sub="Contexto interno. No se muestra en ninguna web pública.">
          <textarea v-model="form.notes" class="input" rows="6" placeholder="Qué busca, presupuesto, disponibilidad, conversaciones previas…" />
        </AdminPanel>
      </div>

      <div class="space-y-6">
        <AdminPanel title="Resumen">
          <dl class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-stone-500">Tipo</dt>
              <dd><ClientBadge :value="form.type" kind="type" /></dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-stone-500">Estado</dt>
              <dd><ClientBadge :value="form.stage" kind="stage" /></dd>
            </div>
            <div v-if="!isCreate" class="flex items-center justify-between gap-3">
              <dt class="text-stone-500">Alta</dt>
              <dd class="text-stone-700">{{ formatDate(original.createdAt) }}</dd>
            </div>
          </dl>
          <p v-if="dirty" class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Tienes cambios sin guardar.</p>
        </AdminPanel>

        <AdminPanel title="Qué no guarda esta ficha" sub="Para que no busques campos que no existen.">
          <p class="text-[12px] leading-relaxed text-stone-500">
            El modelo de cliente no tiene todavía fotografía, documento de identidad, fecha de nacimiento, idioma,
            WhatsApp, dirección estructurada, oficina, origen ni etiquetas. Añadirlos es una migración de base de
            datos, no un campo más en este formulario.
          </p>
        </AdminPanel>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import ClientBadge from './ClientBadge.vue'
import { CLIENT_TYPES, CLIENT_STAGES, formatDate } from '~/composables/useClientConfig'

/**
 * El editor de clientes, uno solo para alta y edición.
 *
 * `mode` decide a qué endpoint del motor genérico se escribe (POST a la
 * colección o PUT a la fila) y poco más: los campos, la validación y la
 * disposición son los mismos, porque crear y editar un cliente son la misma
 * tarea con distinto punto de partida. Mismo planteamiento que
 * `PropertyBuilder` y `CommercialBuilder`, que también sirven a los dos
 * modos desde un solo componente.
 *
 * Los campos son **exactamente** los que existen en la tabla `clients`.
 * `lifetimeValue` y `dealsCount` están fuera a propósito: son columnas que
 * nadie mantiene (sólo las escriben las migraciones de siembra), así que
 * dejarlas editar sería invitar a rellenar una cifra que la ficha presenta
 * como si fuera real. La ficha enseña en su lugar las operaciones de verdad.
 */
const props = defineProps<{ mode: 'create' | 'edit'; id?: string }>()

const isCreate = computed(() => props.mode === 'create')
const backTo = computed(() => (isCreate.value ? '/admin/clientes' : `/admin/clientes/${props.id}`))

const toast = useToast()
const router = useRouter()

const EMPTY = { name: '', email: '', phone: '', type: 'buyer', stage: 'active', agentName: '', location: '', notes: '' }
const form = reactive<Record<string, any>>({ ...EMPTY })
const original = reactive<Record<string, any>>({ ...EMPTY })
const loadError = ref('')
const saving = ref(false)
const touched = reactive<Record<string, boolean>>({})
const agentNames = ref<string[]>([])

function touch(field: string) {
  touched[field] = true
}

const errors = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  if (touched.name && !form.name.trim()) out.name = 'El nombre es obligatorio.'
  if (touched.email && form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) out.email = 'Ese email no parece válido.'
  return out
})

const dirty = computed(() => Object.keys(EMPTY).some((k) => (form[k] ?? '') !== (original[k] ?? '')))

onMounted(async () => {
  // Los nombres de comercial ya usados, para que el campo libre sugiera en
  // vez de invitar a escribir el mismo nombre de cuatro formas distintas.
  $fetch<{ agents: string[] }>('/api/admin/saas/clients')
    .then((d) => (agentNames.value = d.agents || []))
    .catch(() => (agentNames.value = []))

  if (isCreate.value) return
  try {
    const res = await $fetch<{ row: Record<string, any> }>(`/api/admin/clients/${props.id}`)
    for (const k of Object.keys(EMPTY)) {
      form[k] = res.row[k] ?? (k === 'type' ? 'buyer' : k === 'stage' ? 'active' : '')
      original[k] = form[k]
    }
    original.createdAt = res.row.createdAt
  } catch (e: any) {
    loadError.value = e?.statusCode === 404 ? 'Este cliente no existe, o no pertenece a tu inmobiliaria.' : 'No se pudo cargar el cliente.'
  }
})

async function save() {
  touch('name')
  touch('email')
  if (errors.value.name || errors.value.email) return
  if (!form.name.trim()) return

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      type: form.type,
      stage: form.stage,
      agentName: form.agentName.trim() || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (isCreate.value) {
      const res = await $fetch<{ id: number }>('/api/admin/clients', { method: 'POST', body })
      toast.success('Cliente creado')
      await router.replace(`/admin/clientes/${res.id}`)
    } else {
      await $fetch(`/api/admin/clients/${props.id}`, { method: 'PUT', body })
      for (const k of Object.keys(EMPTY)) original[k] = form[k]
      toast.success('Cambios guardados')
      await router.replace(`/admin/clientes/${props.id}`)
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar')
  } finally {
    saving.value = false
  }
}
</script>
