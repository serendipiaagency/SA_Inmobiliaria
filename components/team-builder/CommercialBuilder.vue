<template>
  <div v-if="loading" class="p-16 text-center text-sm text-stone-400">Cargando…</div>
  <div v-else>
    <!-- Cabecera: título/subtítulo del constructor, Cancelar, Guardar -->
    <div class="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-line bg-white/95 px-6 py-4 backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold text-ink">{{ isNew ? 'Constructor de Comerciales' : form.name || `Comercial #${recordId}` }}</h1>
            <p class="truncate text-[12px] text-stone-500">
              {{ isNew ? 'Crea una ficha completa para cada miembro de tu equipo.' : 'Edita la información profesional y pública del comercial.' }}
              <span :class="error ? 'text-red-500' : 'text-stone-400'"> · {{ saveStateLabel }}</span>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <a v-if="!isNew && form.showOnWeb && form.slug" :href="`/equipo/${form.slug}`" target="_blank" rel="noopener" class="btn-quiet">Ver ficha pública</a>
          <NuxtLink to="/admin/agents" class="btn-quiet">{{ isNew ? 'Cancelar' : 'Cancelar / Volver' }}</NuxtLink>
          <button type="button" class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : isNew ? 'Guardar comercial' : 'Guardar cambios' }}</button>
        </div>
      </div>
    </div>

    <!-- Stepper horizontal -->
    <div class="card mb-6 p-3">
      <CommercialStepper :steps="STEPS" :active="active" :section-state="sectionState" @select="active = $event" />
    </div>

    <!-- Formulario (izquierda) + preview en vivo (derecha) -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
      <div class="card min-w-0 p-6 lg:col-span-3">
        <!-- 1. Datos personales -->
        <div v-show="active === 'personal'" class="space-y-4">
          <label class="block">
            <span class="label">Nombre completo <span class="text-red-500">*</span></span>
            <input v-model="form.name" class="input" placeholder="Ej. Laura Martínez García" />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Puesto / Cargo <span class="text-red-500">*</span></span>
              <input v-model="form.position" class="input" placeholder="Ej. Asesora Inmobiliaria" />
            </label>
            <label class="block">
              <span class="label">Departamento</span>
              <input v-model="form.department" class="input" placeholder="Ej. Comercial" />
            </label>
            <label class="block">
              <span class="label">Fecha de incorporación</span>
              <input v-model="form.hireDate" type="date" class="input" />
            </label>
            <label class="block">
              <span class="label">Tipo de contrato</span>
              <select v-model="form.contractType" class="input">
                <option value="">—</option>
                <option v-for="c in contractTypeOptions" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <label class="block">
            <span class="label">Descripción breve</span>
            <textarea v-model="form.description" class="input" rows="2" placeholder="Especialista en captación y venta de propiedades residenciales." />
          </label>
          <TagChipsField v-model="specialties" label="Etiquetas / Habilidades" add-label="Añadir etiqueta" placeholder="Ej. Negociación" />
        </div>

        <!-- 2. Información profesional -->
        <div v-show="active === 'profesional'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Código interno de empleado</span>
              <input v-model="form.employeeCode" class="input" />
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

        <!-- 3. Contacto y redes -->
        <div v-show="active === 'contacto'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Email profesional <span class="text-red-500">*</span></span>
              <input v-model="form.email" type="email" class="input" />
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
          <p class="label !mb-1 mt-2">Redes sociales</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="s in SOCIAL_FIELDS" :key="s.key" class="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-500">{{ s.short }}</span>
              <input v-model="form[s.key]" class="input !border-0 !p-0 !shadow-none focus:!ring-0" placeholder="https://…" />
            </label>
          </div>
        </div>

        <!-- 4. Perfil y presentación -->
        <div v-show="active === 'perfil'" class="space-y-4">
          <div>
            <span class="label">Fotografía</span>
            <div v-if="form.image" class="mb-2 flex items-center gap-3">
              <img :src="mediaUrl(form.image)" class="h-16 w-16 rounded-full border border-line object-cover" />
              <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="form.image = null">Quitar</button>
            </div>
            <input type="file" accept="image/*" class="block w-full text-xs text-stone-500" @change="onUploadImage" />
            <p v-if="uploadingImage" class="mt-1 text-[11px] text-stone-400">Subiendo…</p>
          </div>
          <label class="block">
            <span class="label">Biografía profesional</span>
            <textarea v-model="form.experience" class="input" rows="4" placeholder="Trayectoria, especialización, logros…" />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex items-center gap-2 text-sm text-stone-700">
              <input v-model="form.showOnWeb" type="checkbox" />
              Mostrar este comercial en la web
            </label>
            <label class="block">
              <span class="label">Orden en la web</span>
              <input v-model.number="form.sortOrder" type="number" class="input" />
            </label>
          </div>
          <p class="text-[12px] text-stone-400">La ficha pública reutiliza foto, nombre, puesto, descripción y redes — no hay campos "públicos" duplicados. Los datos laborales, propiedades asignadas, rendimiento y documentos internos nunca se muestran públicamente.</p>
        </div>

        <!-- 5. Zonas y especialidades -->
        <div v-show="active === 'zonas'" class="space-y-5">
          <div>
            <TagChipsField v-model="zones" label="Zonas" add-label="Añadir zona" placeholder="Ej. Marbella centro" />
            <p class="mt-1 text-[11px] text-stone-400">No existe todavía un catálogo estructurado de zonas/territorios en la plataforma, así que se guardan como etiquetas de texto libre.</p>
          </div>
          <div>
            <span class="label">Especialidades</span>
            <div class="flex flex-wrap gap-2">
              <label v-for="pt in PROPERTY_TYPE_OPTIONS" :key="pt" class="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px]" :class="propertyTypes.includes(pt) ? 'border-ink bg-ink text-white' : 'text-stone-600'">
                <input type="checkbox" class="hidden" :checked="propertyTypes.includes(pt)" @change="togglePropertyType(pt)" />
                {{ pt }}
              </label>
            </div>
          </div>
          <TagChipsField v-model="languages" label="Idiomas" add-label="Añadir idioma" placeholder="Ej. Inglés" />
        </div>

        <!-- 6. Resumen -->
        <div v-show="active === 'resumen'" class="space-y-4">
          <div v-if="missingRequiredCount > 0" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
            Faltan {{ missingRequiredCount }} campo{{ missingRequiredCount === 1 ? '' : 's' }} obligatorio{{ missingRequiredCount === 1 ? '' : 's' }} — revisa las secciones marcadas en rojo.
          </div>
          <div v-else class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">Todo listo para guardar.</div>

          <div class="divide-y divide-line rounded-lg border border-line">
            <div v-for="s in STEPS.slice(0, 5)" :key="s.key" class="flex items-center justify-between gap-3 px-3 py-2.5">
              <div class="flex items-center gap-2 text-[13px]">
                <span
                  class="h-2 w-2 shrink-0 rounded-full"
                  :class="sectionState(s.key) === 'error' ? 'bg-red-500' : sectionState(s.key) === 'complete' ? 'bg-emerald-500' : 'bg-stone-300'"
                />
                <span class="font-medium text-ink">{{ s.label }}</span>
                <span class="text-stone-400">{{ sectionState(s.key) === 'error' ? '· pendiente' : sectionState(s.key) === 'complete' ? '· completo' : '' }}</span>
              </div>
              <button type="button" class="text-[12px] font-semibold text-ink hover:underline" @click="active = s.key">Editar</button>
            </div>
          </div>
        </div>

        <!-- Navegación entre pasos -->
        <div class="mt-8 flex items-center justify-between border-t border-line pt-5">
          <button v-if="activeIndex > 0" type="button" class="btn-quiet" @click="active = STEPS[activeIndex - 1].key">← Anterior</button>
          <span v-else />
          <button v-if="activeIndex < STEPS.length - 1" type="button" class="btn-primary" @click="active = STEPS[activeIndex + 1].key">Siguiente →</button>
          <button v-else type="button" class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar comercial' }}</button>
        </div>
      </div>

      <div class="lg:sticky lg:top-24 lg:col-span-2">
        <CommercialPreview :form="form" />
      </div>
    </div>

    <!-- Propiedades asignadas / Rendimiento / Documentos — no forman parte de los pasos, disponibles tras guardar -->
    <div class="mt-8">
      <div class="mb-3 flex items-center gap-1 border-b border-line">
        <button v-for="t in EXTRA_TABS" :key="t.key" type="button" class="border-b-2 px-3 py-2 text-[13px] font-medium transition" :class="extraActive === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'" @click="extraActive = t.key">
          {{ t.label }}
        </button>
      </div>

      <div v-show="extraActive === 'propiedades'">
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

      <div v-show="extraActive === 'rendimiento'">
        <div v-if="isNew" class="py-10 text-center text-sm text-stone-400">Todavía no hay actividad suficiente para mostrar métricas.</div>
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

      <div v-show="extraActive === 'documentos'">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import TagChipsField from './TagChipsField.vue'
import CommercialPreview from './CommercialPreview.vue'
import CommercialStepper from './CommercialStepper.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const toast = useToast()

const PROPERTY_TYPE_OPTIONS = ['residencial', 'lujo', 'obra-nueva', 'segunda-mano', 'alquiler', 'locales', 'oficinas', 'suelo', 'inversión', 'internacional']
const SOCIAL_FIELDS = [
  { key: 'linkedin', short: 'in' },
  { key: 'instagram', short: 'ig' },
  { key: 'facebook', short: 'fb' },
  { key: 'twitter', short: 'x' },
]

const STEPS = [
  { key: 'personal', label: 'Datos personales', subtitle: 'Información básica' },
  { key: 'profesional', label: 'Información profesional', subtitle: 'Rol y departamento' },
  { key: 'contacto', label: 'Contacto y redes', subtitle: 'Canales de comunicación' },
  { key: 'perfil', label: 'Perfil y presentación', subtitle: 'Imagen y descripción' },
  { key: 'zonas', label: 'Zonas y especialidades', subtitle: 'Áreas de trabajo' },
  { key: 'resumen', label: 'Resumen', subtitle: 'Revisa y guarda' },
]
const EXTRA_TABS = [
  { key: 'propiedades', label: 'Propiedades asignadas' },
  { key: 'rendimiento', label: 'Rendimiento' },
  { key: 'documentos', label: 'Documentos' },
]

const active = ref('personal')
const activeIndex = computed(() => STEPS.findIndex((s) => s.key === active.value))
const extraActive = ref('propiedades')

const isNew = computed(() => props.id === 'new')
const recordId = ref<number | null>(isNew.value ? null : Number(props.id))
const loading = ref(true)
const form = reactive<Record<string, any>>({ employmentStatus: 'active', showOnWeb: true, sortOrder: 0 })

// contractType is free text on the model — offer the common options as a
// select, but never silently drop a legacy custom value that isn't among them.
const contractTypeOptions = computed(() => {
  const base = ['Indefinido', 'Temporal', 'Autónomo', 'Prácticas']
  return form.contractType && !base.includes(form.contractType) ? [...base, form.contractType] : base
})

const savedSnapshot = ref('')
const isDirty = computed(() => JSON.stringify({ form, zones: zones.value, specialties: specialties.value, languages: languages.value, propertyTypes: propertyTypes.value }) !== savedSnapshot.value)
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
  savedSnapshot.value = JSON.stringify({ form, zones: zones.value, specialties: specialties.value, languages: languages.value, propertyTypes: propertyTypes.value })
}

// specialties/languages used to be a single comma-separated string; parse
// robustly (JSON array first, comma-split fallback for old data) and always
// write back as a JSON array from here on, same pattern as `zones`.
function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* legacy comma-separated value */
  }
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
}

const zones = ref<string[]>([])
const specialties = ref<string[]>([])
const languages = ref<string[]>([])
const propertyTypes = ref<string[]>([])
function togglePropertyType(pt: string) {
  const i = propertyTypes.value.indexOf(pt)
  if (i === -1) propertyTypes.value.push(pt)
  else propertyTypes.value.splice(i, 1)
}

function isFilled(v: any) {
  return v !== null && v !== undefined && v !== ''
}
function sectionState(key: string): 'complete' | 'error' | 'neutral' {
  if (key === 'personal') {
    if (!isFilled(form.name) || !isFilled(form.position)) return 'error'
    return isFilled(form.department) || isFilled(form.hireDate) ? 'complete' : 'neutral'
  }
  if (key === 'profesional') {
    // employmentStatus always has a default value ('active'), so it can't be
    // used as a "the user filled this in" signal — only officeName/managerId
    // count, both genuinely empty on a fresh record.
    return isFilled(form.officeName) || isFilled(form.managerId) ? 'complete' : 'neutral'
  }
  if (key === 'contacto') {
    if (!isFilled(form.email)) return 'error'
    return 'complete'
  }
  if (key === 'perfil') {
    return isFilled(form.image) || isFilled(form.experience) ? 'complete' : 'neutral'
  }
  if (key === 'zonas') {
    return zones.value.length || propertyTypes.value.length || languages.value.length ? 'complete' : 'neutral'
  }
  return 'neutral'
}
const missingRequiredCount = computed(() => {
  let n = 0
  if (!isFilled(form.name)) n++
  if (!isFilled(form.position)) n++
  if (!isFilled(form.email)) n++
  return n
})

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
    specialties.value = parseTagList(form.specialties)
    languages.value = parseTagList(form.languages)
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
    const body: Record<string, any> = {
      ...form,
      zones: JSON.stringify(zones.value),
      specialties: JSON.stringify(specialties.value),
      languages: JSON.stringify(languages.value),
      propertyTypes: JSON.stringify(propertyTypes.value),
      showOnWeb: form.showOnWeb ? 1 : 0,
    }
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
