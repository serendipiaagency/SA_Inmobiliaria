<template>
  <div v-if="loading" class="p-16 text-center text-sm text-stone-400">Cargando…</div>
  <div v-else>
    <!-- Ficha header: photo, name, position, office/zone, status, primary actions -->
    <div class="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-line bg-white/95 px-6 py-4 backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <NuxtLink to="/admin/agents" class="shrink-0 text-stone-400 hover:text-ink" aria-label="Volver">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
          </NuxtLink>
          <img v-if="form.image" :src="mediaUrl(form.image)" class="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-line" />
          <span v-else class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold text-stone-400">{{ initials }}</span>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold text-ink">{{ isNew ? 'Nuevo comercial' : form.name || `Comercial #${recordId}` }}</h1>
            <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span v-if="form.position" class="text-stone-500">{{ form.position }}</span>
              <span v-if="form.officeName" class="text-stone-400">· {{ form.officeName }}</span>
              <span v-if="form.employmentStatus" class="rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide" :class="STATUS_CLASS[form.employmentStatus] || 'bg-stone-100 text-stone-600'">{{ STATUS_LABELS[form.employmentStatus] || form.employmentStatus }}</span>
              <span :class="error ? 'text-red-500' : 'text-stone-400'">{{ saveStateLabel }}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <a v-if="!isNew && form.showOnWeb && form.slug" :href="`/equipo/${form.slug}`" target="_blank" rel="noopener" class="btn-quiet">Ver ficha pública</a>
          <button type="button" class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div class="thin-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
        <button v-for="t in TABS" :key="t.key" type="button" class="shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition" :class="active === t.key ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-ink'" @click="active = t.key">{{ t.label }}</button>
      </div>

      <aside class="hidden w-56 shrink-0 lg:block">
        <nav class="sticky top-24 space-y-0.5">
          <button v-for="t in TABS" :key="t.key" type="button" class="nav-item w-full" :class="active === t.key ? 'nav-active' : ''" @click="active = t.key">
            <span class="flex-1 text-left">{{ t.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="card min-w-0 flex-1 p-6">
        <!-- Perfil -->
        <div v-show="active === 'perfil'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Nombre y apellidos <span class="text-red-500">*</span></span>
              <input v-model="form.name" class="input" />
            </label>
            <label class="block">
              <span class="label">Puesto <span class="text-red-500">*</span></span>
              <input v-model="form.position" class="input" />
            </label>
            <label class="block">
              <span class="label">Email profesional <span class="text-red-500">*</span></span>
              <input v-model="form.email" type="email" class="input" />
            </label>
            <label class="block">
              <span class="label">Teléfono</span>
              <input v-model="form.phone" class="input" />
            </label>
            <label class="block">
              <span class="label">Idioma preferido</span>
              <input v-model="form.languages" class="input" placeholder="Español, inglés…" />
            </label>
          </div>
          <label class="block">
            <span class="label">Descripción corta</span>
            <textarea v-model="form.description" class="input" rows="2" />
          </label>
          <label class="block">
            <span class="label">Biografía profesional</span>
            <textarea v-model="form.experience" class="input" rows="4" />
          </label>
          <div>
            <span class="label">Foto</span>
            <div v-if="form.image" class="mb-2 flex items-center gap-3">
              <img :src="mediaUrl(form.image)" class="h-16 w-16 rounded-full border border-line object-cover" />
              <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="form.image = null">Quitar</button>
            </div>
            <input type="file" accept="image/*" class="block w-full text-xs text-stone-500" @change="onUploadImage" />
            <p v-if="uploadingImage" class="mt-1 text-[11px] text-stone-400">Subiendo…</p>
          </div>
        </div>

        <!-- Laboral -->
        <div v-show="active === 'laboral'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Código de empleado</span>
              <input v-model="form.employeeCode" class="input" />
            </label>
            <label class="block">
              <span class="label">Departamento / equipo</span>
              <input v-model="form.department" class="input" />
            </label>
            <label class="block">
              <span class="label">Oficina / sede</span>
              <input v-model="form.officeName" class="input" />
            </label>
            <label class="block">
              <span class="label">Responsable (reporta a)</span>
              <select v-model="form.managerId" class="input">
                <option :value="null">—</option>
                <option v-for="m in otherAgents" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Fecha de alta</span>
              <input v-model="form.hireDate" type="date" class="input" />
            </label>
            <label class="block">
              <span class="label">Tipo de contrato</span>
              <input v-model="form.contractType" class="input" placeholder="Indefinido, autónomo…" />
            </label>
            <label class="block">
              <span class="label">Estado laboral</span>
              <select v-model="form.employmentStatus" class="input">
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="on_leave">Baja</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Horario habitual</span>
              <input v-model="form.workingHours" class="input" placeholder="L-V 9:00-18:00" />
            </label>
          </div>
          <p class="text-[12px] text-stone-400">
            La agenda de disponibilidad para citas (horario semanal, vacaciones) se gestiona en su propio módulo, ya existente, para no duplicar el calendario.
            <NuxtLink v-if="!isNew" :to="`/admin/team/${recordId}`" class="font-medium text-ink hover:underline">Configurar horario →</NuxtLink>
          </p>
        </div>

        <!-- Comercial -->
        <div v-show="active === 'comercial'" class="space-y-4">
          <label class="block">
            <span class="label">Especialización</span>
            <input v-model="form.specialties" class="input" placeholder="Residencial, lujo, obra nueva, inversión… (separadas por comas)" />
          </label>
          <label class="block">
            <span class="label">Idiomas de trabajo</span>
            <input v-model="form.languages" class="input" placeholder="Español, inglés, árabe… (separados por comas)" />
          </label>
          <div>
            <span class="label">Tipos de propiedad</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <label v-for="pt in PROPERTY_TYPE_OPTIONS" :key="pt" class="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px]" :class="propertyTypes.includes(pt) ? 'border-ink bg-ink text-white' : 'text-stone-600'">
                <input type="checkbox" class="hidden" :checked="propertyTypes.includes(pt)" @change="togglePropertyType(pt)" />
                {{ pt }}
              </label>
            </div>
          </div>
        </div>

        <!-- Contacto -->
        <div v-show="active === 'contacto'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Email</span>
              <input v-model="form.email" class="input" />
            </label>
            <label class="block">
              <span class="label">Teléfono</span>
              <input v-model="form.phone" class="input" />
            </label>
            <label class="block">
              <span class="label">WhatsApp</span>
              <input v-model="form.whatsapp" class="input" placeholder="+34 600 000 000" />
            </label>
            <label class="block">
              <span class="label">Oficina</span>
              <input :value="form.officeName" class="input" disabled />
            </label>
          </div>
          <div class="flex flex-wrap gap-2 text-[12px]">
            <a v-if="form.email" :href="`mailto:${form.email}`" class="btn-quiet !py-1.5">✉️ Enviar email</a>
            <a v-if="form.phone" :href="`tel:${form.phone}`" class="btn-quiet !py-1.5">📞 Llamar</a>
            <a v-if="form.whatsapp" :href="`https://wa.me/${form.whatsapp.replace(/[^\d]/g, '')}`" target="_blank" rel="noopener" class="btn-quiet !py-1.5">💬 WhatsApp</a>
          </div>
          <div class="grid gap-4 pt-2 sm:grid-cols-2">
            <label class="block">
              <span class="label">Facebook</span>
              <input v-model="form.facebook" class="input" placeholder="https://…" />
            </label>
            <label class="block">
              <span class="label">Instagram</span>
              <input v-model="form.instagram" class="input" placeholder="https://…" />
            </label>
            <label class="block">
              <span class="label">LinkedIn</span>
              <input v-model="form.linkedin" class="input" placeholder="https://…" />
            </label>
            <label class="block">
              <span class="label">X / Twitter</span>
              <input v-model="form.twitter" class="input" placeholder="https://…" />
            </label>
          </div>
        </div>

        <!-- Zonas -->
        <div v-show="active === 'zonas'" class="space-y-3">
          <p class="text-[12px] text-stone-400">Zonas comerciales asignadas — no existe todavía un catálogo estructurado de zonas/territorios en la plataforma, así que se guardan como etiquetas de texto libre.</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="(z, i) in zones" :key="i" class="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[12px] text-stone-700">
              {{ z }}
              <button type="button" class="text-stone-400 hover:text-red-600" @click="zones.splice(i, 1)">×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newZone" class="input !w-64" placeholder="Ej. Marbella centro" @keyup.enter="addZone" />
            <button type="button" class="btn-quiet" @click="addZone">+ Añadir zona</button>
          </div>
        </div>

        <!-- Propiedades -->
        <div v-show="active === 'propiedades'">
          <div v-if="isNew" class="py-10 text-center text-sm text-stone-400">Guarda el comercial primero para poder asignarle propiedades.</div>
          <template v-else>
            <div class="mb-3 flex items-center gap-2">
              <input v-model="propertySearch" class="input !w-72" placeholder="Buscar propiedad para asignar…" @keyup.enter="searchProperties" />
              <button type="button" class="btn-quiet" @click="searchProperties">Buscar</button>
            </div>
            <div v-if="propertyResults.length" class="mb-4 space-y-1 rounded-lg border border-line p-2">
              <div v-for="p in propertyResults" :key="`${p.source}-${p.id}`" class="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-stone-50">
                <span class="min-w-0 truncate">{{ p.name }} <span class="text-stone-400">— {{ p.source === 'developer' ? 'Propiedades (web)' : 'Propiedades 2ª mano' }}</span></span>
                <button type="button" class="shrink-0 text-[12px] font-semibold text-ink hover:underline" @click="assignProperty(p)">+ Asignar</button>
              </div>
            </div>
            <div v-if="!assignedProperties.length" class="card px-4 py-10 text-center text-sm text-stone-400">Sin propiedades asignadas.</div>
            <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="p in assignedProperties" :key="`${p.source}-${p.id}`" class="rounded-lg border border-line p-3">
                <img v-if="p.image" :src="mediaUrl(p.image)" class="mb-2 h-24 w-full rounded object-cover" />
                <p class="truncate text-[13px] font-medium">{{ p.name }}</p>
                <p class="text-[11px] text-stone-400">{{ p.source === 'developer' ? 'Propiedades (web)' : 'Propiedades 2ª mano' }} · {{ p.status }}</p>
                <button type="button" class="mt-1 text-[11px] font-semibold text-red-600 hover:underline" @click="unassignProperty(p)">Desasignar</button>
              </div>
            </div>
          </template>
        </div>

        <!-- Rendimiento -->
        <div v-show="active === 'rendimiento'">
          <div v-if="isNew" class="py-10 text-center text-sm text-stone-400">Disponible una vez guardado el comercial.</div>
          <div v-else-if="!performance" class="py-10 text-center text-sm text-stone-400">Cargando métricas…</div>
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Leads asignados</p><p class="mt-1 text-xl font-semibold">{{ performance.leadsAssigned }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Leads activos</p><p class="mt-1 text-xl font-semibold">{{ performance.leadsActive }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Visitas totales</p><p class="mt-1 text-xl font-semibold">{{ performance.visitsTotal }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Visitas completadas</p><p class="mt-1 text-xl font-semibold">{{ performance.visitsCompleted }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Operaciones cerradas</p><p class="mt-1 text-xl font-semibold">{{ performance.dealsClosed }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Volumen comercial</p><p class="mt-1 text-xl font-semibold">{{ formatMoney(performance.commercialVolume) }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Comisión total</p><p class="mt-1 text-xl font-semibold">{{ formatMoney(performance.commissionTotal) }}</p></div>
            <div class="card p-4"><p class="text-[11px] uppercase text-stone-400">Propiedades asignadas</p><p class="mt-1 text-xl font-semibold">{{ performance.assignedProperties }}</p></div>
          </div>
        </div>

        <!-- Documentos -->
        <div v-show="active === 'documentos'">
          <div v-if="isNew" class="py-10 text-center text-sm text-stone-400">Guarda el comercial primero para poder adjuntar documentos.</div>
          <template v-else>
            <p class="mb-3 text-[12px] text-stone-400">Documentos internos (contratos, certificaciones…) — nunca se muestran en la ficha pública.</p>
            <div v-if="!documents.length" class="card px-4 py-10 text-center text-sm text-stone-400">Sin documentos.</div>
            <ul v-else class="mb-3 space-y-1">
              <li v-for="d in documents" :key="d.id" class="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
                <a :href="mediaUrl(d.fileKey)" target="_blank" rel="noopener" class="truncate font-medium text-ink hover:underline">{{ d.label }}</a>
                <button type="button" class="shrink-0 text-[12px] font-semibold text-red-600 hover:underline" @click="removeDocument(d.id)">Eliminar</button>
              </li>
            </ul>
            <div class="flex items-center gap-2">
              <input v-model="newDocLabel" class="input !w-56" placeholder="Etiqueta (ej. Contrato 2026)" />
              <input type="file" class="block text-xs text-stone-500" @change="onUploadDocument" />
            </div>
            <p v-if="uploadingDoc" class="mt-1 text-[11px] text-stone-400">Subiendo…</p>
          </template>
        </div>

        <!-- Web -->
        <div v-show="active === 'web'" class="space-y-4">
          <label class="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" v-model="form.showOnWeb" />
            Mostrar en la web pública (equipo)
          </label>
          <label class="block !w-40">
            <span class="label">Orden</span>
            <input v-model.number="form.sortOrder" type="number" class="input" />
          </label>
          <p class="text-[12px] text-stone-400">
            La ficha pública reutiliza foto, nombre, puesto, descripción y redes de las pestañas Perfil y Contacto — no hay campos "públicos" duplicados. Los datos laborales, propiedades asignadas y documentos internos nunca se muestran públicamente.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ id: string }>()
const router = useRouter()
const toast = useToast()

const STATUS_LABELS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', on_leave: 'Baja' }
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-stone-200 text-stone-600',
  on_leave: 'bg-amber-100 text-amber-700',
}
const PROPERTY_TYPE_OPTIONS = ['residencial', 'lujo', 'obra-nueva', 'segunda-mano', 'alquiler', 'locales', 'oficinas', 'suelo', 'inversión']

const TABS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'laboral', label: 'Laboral' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'contacto', label: 'Contacto' },
  { key: 'zonas', label: 'Zonas' },
  { key: 'propiedades', label: 'Propiedades' },
  { key: 'rendimiento', label: 'Rendimiento' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'web', label: 'Web' },
]
const active = ref('perfil')

const isNew = computed(() => props.id === 'new')
const recordId = ref<number | null>(isNew.value ? null : Number(props.id))
const loading = ref(true)
const form = reactive<Record<string, any>>({ employmentStatus: 'active', showOnWeb: true, sortOrder: 0 })

const initials = computed(() =>
  String(form.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join(''),
)

const savedSnapshot = ref('')
const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value)
const saving = ref(false)
const saved = ref(false)
const error = ref('')
const saveStateLabel = computed(() => {
  if (error.value) return error.value
  if (saving.value) return 'Guardando…'
  if (isDirty.value) return 'Cambios sin guardar'
  if (saved.value || !isNew.value) return 'Guardado'
  return ''
})
function snapshot() {
  savedSnapshot.value = JSON.stringify(form)
}

const zones = ref<string[]>([])
const newZone = ref('')
function addZone() {
  const v = newZone.value.trim()
  if (v && !zones.value.includes(v)) zones.value.push(v)
  newZone.value = ''
}
const propertyTypes = ref<string[]>([])
function togglePropertyType(pt: string) {
  const i = propertyTypes.value.indexOf(pt)
  if (i === -1) propertyTypes.value.push(pt)
  else propertyTypes.value.splice(i, 1)
}

const otherAgents = ref<any[]>([])
const performance = ref<Record<string, any> | null>(null)
const assignedProperties = ref<any[]>([])
const documents = ref<any[]>([])

async function loadAssignedProperties() {
  if (!recordId.value) return
  const [devRes, agentRes] = await Promise.all([
    $fetch<{ rows: any[] }>('/api/admin/developer-properties', { query: { perPage: 100 } }).catch(() => ({ rows: [] })),
    $fetch<{ rows: any[] }>('/api/admin/properties', { query: { perPage: 100 } }).catch(() => ({ rows: [] })),
  ])
  assignedProperties.value = [
    ...devRes.rows.filter((r: any) => r.agentId === recordId.value).map((r: any) => ({ id: r.id, name: r.name, image: r.coverImage, status: r.status, source: 'developer' as const })),
    ...agentRes.rows.filter((r: any) => r.agentId === recordId.value).map((r: any) => ({ id: r.id, name: r.slug || `#${r.id}`, image: r.mainImage, status: r.status, source: 'agent' as const })),
  ]
}

const propertySearch = ref('')
const propertyResults = ref<any[]>([])
async function searchProperties() {
  if (!propertySearch.value.trim()) {
    propertyResults.value = []
    return
  }
  const [devRes, agentRes] = await Promise.all([
    $fetch<{ rows: any[] }>('/api/admin/developer-properties', { query: { q: propertySearch.value, perPage: 10 } }).catch(() => ({ rows: [] })),
    $fetch<{ rows: any[] }>('/api/admin/properties', { query: { q: propertySearch.value, perPage: 10 } }).catch(() => ({ rows: [] })),
  ])
  propertyResults.value = [
    ...devRes.rows.map((r: any) => ({ id: r.id, name: r.name, source: 'developer' as const })),
    ...agentRes.rows.map((r: any) => ({ id: r.id, name: r.slug || `#${r.id}`, source: 'agent' as const })),
  ]
}
async function assignProperty(p: any) {
  const endpoint = p.source === 'developer' ? 'developer-properties' : 'properties'
  try {
    await $fetch(`/api/admin/${endpoint}/${p.id}`, { method: 'PUT', body: { agentId: recordId.value } })
    toast.success('Propiedad asignada')
    propertyResults.value = []
    propertySearch.value = ''
    await loadAssignedProperties()
  } catch {
    toast.error('No se pudo asignar la propiedad')
  }
}
async function unassignProperty(p: any) {
  const endpoint = p.source === 'developer' ? 'developer-properties' : 'properties'
  try {
    await $fetch(`/api/admin/${endpoint}/${p.id}`, { method: 'PUT', body: { agentId: null } })
    toast.success('Propiedad desasignada')
    await loadAssignedProperties()
  } catch {
    toast.error('No se pudo desasignar la propiedad')
  }
}

async function loadDocuments() {
  if (!recordId.value) return
  const res = await $fetch<{ rows: any[] }>('/api/admin/team-member-documents', { query: { perPage: 100 } }).catch(() => ({ rows: [] }))
  documents.value = res.rows.filter((r: any) => r.teamMemberId === recordId.value)
}
const newDocLabel = ref('')
const uploadingDoc = ref(false)
async function onUploadDocument(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !recordId.value) return
  uploadingDoc.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<{ key: string }>('/api/admin/team-member-documents/private-upload', { method: 'POST', body: fd })
    await $fetch('/api/admin/team-member-documents', {
      method: 'POST',
      body: { teamMemberId: recordId.value, fileKey: res.key, label: newDocLabel.value || file.name },
    })
    newDocLabel.value = ''
    await loadDocuments()
  } catch {
    toast.error('No se pudo subir el documento')
  } finally {
    uploadingDoc.value = false
    input.value = ''
  }
}
async function removeDocument(id: number) {
  try {
    await $fetch(`/api/admin/team-member-documents/${id}`, { method: 'DELETE' })
    await loadDocuments()
  } catch {
    toast.error('No se pudo eliminar el documento')
  }
}

const uploadingImage = ref(false)
async function onUploadImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingImage.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'team')
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form.image = res.key
  } catch {
    toast.error('No se pudo subir la foto')
  } finally {
    uploadingImage.value = false
    input.value = ''
  }
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v || 0) + ' €'
}

onMounted(async () => {
  if (!isNew.value) {
    const res = await $fetch<{ row: Record<string, any> }>(`/api/admin/team/${props.id}`)
    for (const key of Object.keys(res.row)) form[key] = res.row[key]
    form.showOnWeb = !!form.showOnWeb
    try {
      zones.value = JSON.parse(form.zones || '[]')
    } catch {
      zones.value = []
    }
    try {
      propertyTypes.value = JSON.parse(form.propertyTypes || '[]')
    } catch {
      propertyTypes.value = []
    }
    await Promise.all([loadAssignedProperties(), loadDocuments()])
    $fetch<Record<string, any>>(`/api/admin/team/${props.id}/performance`)
      .then((p) => (performance.value = p))
      .catch(() => {})
  }
  $fetch<{ rows: any[] }>('/api/admin/team', { query: { perPage: 200 } })
    .then((res) => (otherAgents.value = res.rows.filter((r: any) => r.id !== recordId.value)))
    .catch(() => {})
  snapshot()
  loading.value = false
})

async function save() {
  saving.value = true
  error.value = ''
  try {
    const body: Record<string, any> = { ...form, zones: JSON.stringify(zones.value), propertyTypes: JSON.stringify(propertyTypes.value), showOnWeb: form.showOnWeb ? 1 : 0 }
    if (isNew.value) {
      const res = await $fetch<{ id: number }>('/api/admin/team', { method: 'POST', body })
      recordId.value = res.id
      router.replace(`/admin/agents/${res.id}`)
    } else {
      await $fetch(`/api/admin/team/${recordId.value}`, { method: 'PUT', body })
    }
    snapshot()
    saved.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar'
    toast.error(error.value)
  } finally {
    saving.value = false
  }
}
</script>
