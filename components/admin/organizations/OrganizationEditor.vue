<template>
  <div class="mx-auto max-w-5xl" data-testid="org-editor" :data-ready="mounted ? 'true' : undefined">
    <NuxtLink to="/admin/organizations" class="inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition hover:text-ink">← Empresas</NuxtLink>

    <div v-if="loadError" class="card mt-6 p-10 text-center" data-testid="org-editor-load-error">
      <p class="font-medium text-ink">{{ loadError }}</p>
    </div>

    <template v-else-if="row">
      <header class="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
            <img v-if="logoPreview" :src="logoPreview" alt="" class="h-full w-full object-contain">
            <span v-else class="text-lg font-bold text-stone-400">{{ (row.name || '?')[0] }}</span>
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-bold text-ink" data-testid="org-editor-title">{{ row.companyName || row.name }}</h1>
            <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span class="rounded-full px-2.5 py-0.5 font-semibold" :class="row.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'" data-testid="org-editor-status">{{ statusLabel(row.status) }}</span>
              <span>#{{ row.id }} · {{ REGISTRATION_SOURCE_LABELS[row.registrationSource] ?? row.registrationSource ?? 'Panel' }}</span>
            </p>
          </div>
        </div>
        <div v-if="canEdit" class="flex items-center gap-3">
          <span v-if="saveState === 'saved'" class="text-xs font-medium text-emerald-700" data-testid="org-editor-saved">Guardado ✓</span>
          <span v-else-if="dirty" class="text-xs text-stone-500">Cambios sin guardar</span>
          <button type="button" class="btn-primary" :disabled="!dirty || saving" data-testid="org-editor-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </header>

      <p v-if="saveError" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" data-testid="org-editor-error">{{ saveError }}</p>

      <div class="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav class="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:p-0" aria-label="Secciones de la empresa">
          <button
            v-for="s in SECTIONS"
            :key="s.key"
            type="button"
            class="shrink-0 rounded-full border px-4 py-2 text-left text-[13px] font-medium transition lg:rounded-xl"
            :class="active === s.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-400'"
            :aria-current="active === s.key ? 'true' : undefined"
            :data-testid="`org-section-${s.key}`"
            @click="active = s.key"
          >
            {{ s.label }}
          </button>
        </nav>

        <section class="card min-w-0 flex-1 p-5 sm:p-7">
          <!-- Resumen -->
          <div v-if="active === 'resumen'" data-testid="org-panel-resumen">
            <h2 class="text-lg font-bold text-ink">Resumen</h2>
            <dl class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div v-for="c in counters" :key="c.label" class="rounded-xl border border-line bg-paper p-4">
                <dt class="text-xs text-stone-500">{{ c.label }}</dt>
                <dd class="mt-1 text-2xl font-bold tabular-nums text-ink" :data-testid="`org-count-${c.key}`">{{ c.value }}</dd>
              </div>
            </dl>
            <dl class="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt class="text-xs text-stone-500">Nombre</dt><dd class="text-ink">{{ row.name }}</dd></div>
              <div><dt class="text-xs text-stone-500">Nombre comercial</dt><dd class="text-ink">{{ row.companyName || row.name }}</dd></div>
              <div><dt class="text-xs text-stone-500">Dominio</dt><dd class="text-ink">{{ row.domain || 'Sin dominio' }}</dd></div>
              <div><dt class="text-xs text-stone-500">Identificador (slug)</dt><dd class="font-mono text-ink">{{ row.slug }}</dd></div>
              <div><dt class="text-xs text-stone-500">Origen del alta</dt><dd class="text-ink" data-testid="org-summary-source">{{ REGISTRATION_SOURCE_LABELS[row.registrationSource] ?? '—' }}</dd></div>
              <div><dt class="text-xs text-stone-500">Creada</dt><dd class="text-ink">{{ row.createdAt || '—' }}</dd></div>
              <div><dt class="text-xs text-stone-500">Almacenamiento</dt><dd class="text-ink">{{ storageUsed }}</dd></div>
              <div><dt class="text-xs text-stone-500">Remitente de email</dt><dd class="text-ink">{{ row.emailSenderAddress || 'El de la plataforma' }}</dd></div>
            </dl>
          </div>

          <!-- Identidad -->
          <div v-else-if="active === 'identidad'" class="space-y-6" data-testid="org-panel-identidad">
            <h2 class="text-lg font-bold text-ink">Identidad</h2>
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label for="ed-name" class="label">Nombre de la empresa</label>
                <input id="ed-name" v-model="form.name" type="text" class="input" maxlength="120" :disabled="!canEdit" data-testid="org-edit-name">
              </div>
              <div>
                <label for="ed-company" class="label">Nombre comercial</label>
                <input id="ed-company" v-model="form.companyName" type="text" class="input" maxlength="120" :placeholder="form.name" :disabled="!canEdit" data-testid="org-edit-company-name">
              </div>
            </div>
            <AdminOrganizationsOrgDomainField v-model="form.domain" :exclude-id="row.id" :disabled="!canEdit" @update:state="domainState = $event" />
            <div class="grid gap-8 lg:grid-cols-[1fr_260px]">
              <div class="space-y-6">
                <AdminOrganizationsOrgLogoField
                  :preview-url="logoPreview"
                  :busy="logoBusy"
                  :disabled="!canEdit"
                  :error="logoError"
                  @select="uploadLogo"
                  @remove="form.logo = ''"
                  @invalid="logoError = $event"
                />
                <AdminOrganizationsOrgBrandColorField v-model="form.brandColor" :disabled="!canEdit" />
              </div>
              <div>
                <span class="label">Vista previa</span>
                <AdminOrganizationsOrgBrandPreview :display-name="form.companyName || form.name" :brand-color="form.brandColor" :logo-url="logoPreview" />
              </div>
            </div>
          </div>

          <!-- Configuración -->
          <div v-else-if="active === 'configuracion'" class="space-y-6" data-testid="org-panel-configuracion">
            <h2 class="text-lg font-bold text-ink">Configuración</h2>
            <div>
              <label for="ed-locale" class="label">Idioma de los emails</label>
              <select id="ed-locale" v-model="form.emailLocale" class="input max-w-xs" :disabled="!canEdit">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label for="ed-storage" class="label">Almacenamiento (GB)</label>
              <input id="ed-storage" v-model.number="form.storageLimitGb" type="number" min="1" max="1000" step="1" class="input max-w-[10rem]" :disabled="!canEdit" data-testid="org-edit-storage">
              <p class="mt-1.5 text-xs text-stone-500">En uso: {{ storageUsed }}.</p>
            </div>
          </div>

          <!-- Email: el remitente de la empresa y la verificación de su dominio
               (mismo panel que ve su administrador en Sistema → Emails). Se
               guarda aparte, con su propio botón: no entra en «Guardar cambios». -->
          <div v-else-if="active === 'email'" class="space-y-6" data-testid="org-panel-email">
            <div>
              <h2 class="text-lg font-bold text-ink">Email</h2>
              <p class="mt-1 text-sm text-stone-500">Desde qué dirección envía esta empresa a sus clientes y a su equipo. Las altas, bienvenidas y recuperaciones de contraseña salen siempre del remitente de INMO.</p>
            </div>
            <AdminEmailOrgEmailSenderPanel :organization-id="row.id" :can-edit="canEdit" :fallback-name="row.companyName || row.name" />
          </div>

          <!-- Datos legales -->
          <div v-else-if="active === 'legal'" class="space-y-6" data-testid="org-panel-legal">
            <div>
              <h2 class="text-lg font-bold text-ink">Datos legales</h2>
              <p class="mt-1 text-sm text-stone-500">Aparecen en la política de privacidad y los términos de la web de la empresa.</p>
            </div>
            <div class="grid gap-5 sm:grid-cols-2">
              <div><label for="ed-legal-name" class="label">Razón social</label><input id="ed-legal-name" v-model="form.legalCompanyName" type="text" class="input" :disabled="!canEdit"></div>
              <div><label for="ed-tax" class="label">CIF/NIF</label><input id="ed-tax" v-model="form.taxId" type="text" class="input" :disabled="!canEdit"></div>
              <div class="sm:col-span-2"><label for="ed-address" class="label">Dirección</label><input id="ed-address" v-model="form.legalAddress" type="text" class="input" :disabled="!canEdit"></div>
              <div><label for="ed-legal-email" class="label">Email de contacto</label><input id="ed-legal-email" v-model="form.legalEmail" type="email" class="input" :disabled="!canEdit"></div>
              <div><label for="ed-legal-phone" class="label">Teléfono</label><input id="ed-legal-phone" v-model="form.legalPhone" type="tel" class="input" :disabled="!canEdit"></div>
            </div>
          </div>

          <!-- Usuarios -->
          <div v-else-if="active === 'usuarios'" data-testid="org-panel-usuarios">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-lg font-bold text-ink">Usuarios</h2>
              <button type="button" class="btn-quiet" data-testid="org-manage-users" @click="manageUsers">Gestionar usuarios</button>
            </div>
            <p class="mt-1 text-sm text-stone-500">Para añadir o editar usuarios se entra en esta empresa (selector de organización) → Usuarios.</p>
            <ul v-if="overview?.users.length" class="mt-5 divide-y divide-line rounded-xl border border-line">
              <li v-for="u in overview.users" :key="u.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3" :data-testid="`org-user-${u.id}`">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-ink">{{ u.name }}</p>
                  <p class="truncate text-xs text-stone-500">{{ u.email }} · {{ ROLE_LABELS[u.role] ?? u.role }}</p>
                </div>
                <button v-if="u.role === 'admin' && canEdit" type="button" class="btn-quiet !px-4 !py-2" :disabled="inviting === u.id" :data-testid="`org-resend-invite-${u.id}`" @click="resendInvite(u)">
                  {{ inviting === u.id ? 'Enviando…' : 'Reenviar invitación' }}
                </button>
              </li>
            </ul>
            <p v-else class="mt-5 rounded-xl border border-line bg-paper px-4 py-6 text-center text-sm text-stone-500">Esta empresa todavía no tiene usuarios.</p>
          </div>

          <!-- Estado -->
          <div v-else-if="active === 'estado'" class="space-y-6" data-testid="org-panel-estado">
            <h2 class="text-lg font-bold text-ink">Estado</h2>
            <fieldset>
              <legend class="label">Acceso a INMO</legend>
              <div class="grid gap-3 sm:grid-cols-2">
                <label
                  v-for="(info, value) in ORGANIZATION_STATUS_LABELS"
                  :key="value"
                  class="flex cursor-pointer gap-3 rounded-xl border p-4 transition"
                  :class="form.status === value ? 'border-ink bg-paper' : 'border-line hover:border-stone-400'"
                >
                  <input v-model="form.status" type="radio" name="ed-status" :value="value" class="mt-0.5 h-4 w-4 accent-ink" :disabled="!canEdit" :data-testid="`org-edit-status-${value}`">
                  <span>
                    <span class="block text-sm font-semibold text-ink">{{ info.label }}</span>
                    <span class="block text-xs text-stone-500">{{ info.description }}</span>
                  </span>
                </label>
              </div>
              <p class="mt-3 text-xs text-stone-500">Al cambiar el estado se avisa por email a los administradores de la empresa.</p>
            </fieldset>
            <dl class="grid gap-x-6 gap-y-3 rounded-xl border border-line bg-paper p-4 text-sm sm:grid-cols-3">
              <div><dt class="text-xs text-stone-500">Origen del alta</dt><dd class="text-ink">{{ REGISTRATION_SOURCE_LABELS[row.registrationSource] ?? '—' }}</dd></div>
              <div><dt class="text-xs text-stone-500">Aprobación</dt><dd class="text-ink">{{ APPROVAL_STATUS_LABELS[row.approvalStatus] ?? row.approvalStatus ?? '—' }}</dd></div>
              <div><dt class="text-xs text-stone-500">Pago</dt><dd class="text-ink">{{ BILLING_STATUS_LABELS[row.billingStatus] ?? row.billingStatus ?? '—' }}</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  APPROVAL_STATUS_LABELS,
  BILLING_STATUS_LABELS,
  ORGANIZATION_STATUS_LABELS,
  REGISTRATION_SOURCE_LABELS,
  ROLE_LABELS,
  isHexColor,
  type DomainState,
} from '~/utils/organizationLabels'

/**
 * Ficha de una empresa existente (Sistemas > Empresas > Editar), por
 * secciones. Guarda sólo lo que ha cambiado (PUT /api/admin/organizations/:id),
 * con las mismas reglas que el alta. Funciona igual con empresas antiguas
 * (campos vacíos, JSON de destinatarios mal formado, sin origen del alta).
 */
const props = defineProps<{ id: string; canEdit: boolean }>()

const SECTIONS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'identidad', label: 'Identidad' },
  { key: 'configuracion', label: 'Configuración' },
  { key: 'email', label: 'Email' },
  { key: 'legal', label: 'Datos legales' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'estado', label: 'Estado' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const EDITABLE = ['name', 'companyName', 'domain', 'logo', 'brandColor', 'status', 'emailLocale', 'legalCompanyName', 'taxId', 'legalAddress', 'legalEmail', 'legalPhone'] as const
const GB = 1024 ** 3

const route = useRoute()
const active = ref<SectionKey>((SECTIONS.find((s) => s.key === route.query.section)?.key as SectionKey) || 'resumen')
const row = ref<Record<string, any> | null>(null)
const overview = ref<{ counts: Record<string, number>; users: { id: number; name: string; email: string; role: string }[] } | null>(null)
const loadError = ref('')
const form = reactive<Record<string, any>>({})
const original = ref('')
const domainState = ref<DomainState>('empty')
const saving = ref(false)
const saveState = ref<'idle' | 'saved'>('idle')
const saveError = ref('')
const logoBusy = ref(false)
const logoError = ref<string | null>(null)
const inviting = ref<number | null>(null)
const toast = useToast()
const { confirm } = useConfirm()

function hydrate(r: Record<string, any>) {
  row.value = r
  for (const f of EDITABLE) form[f] = r[f] ?? ''
  form.storageLimitGb = r.storageBytesLimit ? Math.round(r.storageBytesLimit / GB) : 5
  original.value = JSON.stringify(form)
}

// useFetch y no un $fetch suelto: los datos viajan en el payload de SSR y el
// cliente no vuelve a pedirlos al hidratar (una segunda petición llegaba
// después de que alguien empezara a escribir y le borraba lo escrito).
const { data: loaded, error: fetchError } = await useFetch<{ row: Record<string, any>; overview: typeof overview.value }>(() => `/api/admin/organizations/${props.id}`)
if (loaded.value) {
  hydrate(loaded.value.row)
  overview.value = loaded.value.overview
} else if (fetchError.value) {
  loadError.value = fetchError.value.statusCode === 404 ? 'Esta empresa no existe.' : 'No se ha podido cargar la empresa.'
}

const dirty = computed(() => JSON.stringify(form) !== original.value)
watch(dirty, (d) => {
  if (d) saveState.value = 'idle'
})

const logoPreview = computed(() => (form.logo ? mediaUrl(form.logo) : null))
const statusLabel = (s: string) => ORGANIZATION_STATUS_LABELS[s]?.label ?? s
const storageUsed = computed(() => {
  const used = Number(row.value?.storageBytesUsed || 0)
  const limit = Number(row.value?.storageBytesLimit || 5 * GB)
  return `${(used / GB).toFixed(2)} GB de ${Math.round(limit / GB)} GB`
})
const counters = computed(() => [
  { key: 'users', label: 'Usuarios', value: overview.value?.counts.users ?? 0 },
  { key: 'properties', label: 'Propiedades', value: overview.value?.counts.properties ?? 0 },
  { key: 'team', label: 'Equipo', value: overview.value?.counts.team ?? 0 },
  { key: 'leads', label: 'Leads', value: overview.value?.counts.leads ?? 0 },
])

async function uploadLogo(file: File) {
  logoError.value = null
  logoBusy.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'organizations')
    fd.append('organizationId', String(row.value!.id))
    const up = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form.logo = up.key // queda como cambio pendiente hasta «Guardar cambios»
  } catch (e: any) {
    logoError.value = e?.data?.statusMessage || e?.statusMessage || 'No se ha podido subir el logo.'
  } finally {
    logoBusy.value = false
  }
}

async function save() {
  if (!dirty.value || saving.value) return
  saveError.value = ''
  if (!String(form.name).trim()) return fail('identidad', 'El nombre de la empresa no puede quedar vacío.')
  if (domainState.value === 'taken' || domainState.value === 'invalid') return fail('identidad', 'Revisa el dominio: está ocupado o no es válido.')
  if (form.brandColor && !isHexColor(form.brandColor)) return fail('identidad', 'El color debe tener el formato #RRGGBB.')
  const before = JSON.parse(original.value)
  if (form.status === 'suspended' && before.status !== 'suspended') {
    const users = overview.value?.counts.users ?? 0
    const ok = await confirm(`Los ${users} usuario(s) de esta empresa dejarán de poder entrar en INMO, también quien tenga la sesión abierta. Sus datos y cuentas se conservan, y se les avisará por email.`, {
      title: '¿Suspender esta empresa?',
      confirmLabel: 'Suspender',
      danger: true,
    })
    if (!ok) return
  }

  const body: Record<string, any> = {}
  for (const f of EDITABLE) if (form[f] !== before[f]) body[f] = typeof form[f] === 'string' ? form[f].trim() : form[f]
  if (form.storageLimitGb !== before.storageLimitGb) body.storageLimitGb = form.storageLimitGb

  saving.value = true
  try {
    await $fetch(`/api/admin/organizations/${row.value!.id}`, { method: 'PUT', body })
    const res = await $fetch<{ row: Record<string, any>; overview: typeof overview.value }>(`/api/admin/organizations/${row.value!.id}`)
    hydrate(res.row)
    overview.value = res.overview
    saveState.value = 'saved'
    toast.success('Cambios guardados')
  } catch (e: any) {
    saveError.value = e?.data?.statusMessage || e?.statusMessage || 'No se han podido guardar los cambios.'
  } finally {
    saving.value = false
  }
}

function fail(section: SectionKey, message: string) {
  active.value = section
  saveError.value = message
}

async function resendInvite(u: { id: number; email: string }) {
  inviting.value = u.id
  try {
    const res = await $fetch<{ invite: string }>('/api/admin/organizations', { method: 'POST', body: { action: 'resend-invite', organizationId: row.value!.id, userId: u.id } })
    if (res.invite === 'sent') toast.success(`Invitación enviada a ${u.email}`)
    else if (res.invite === 'queued') toast.success(`Invitación en cola para ${u.email}: se reintentará automáticamente`)
    else toast.error(res.invite === 'not_configured' ? 'El envío de emails no está configurado: la invitación no ha salido.' : 'No se ha podido enviar la invitación.')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se ha podido enviar la invitación.')
  } finally {
    inviting.value = null
  }
}

async function manageUsers() {
  // El listado de Usuarios es por organización: se cambia la organización
  // activa (el mismo selector de la barra lateral) y se recarga el panel.
  await $fetch('/api/admin/active-org', { method: 'POST', body: { orgId: row.value!.id } })
  useCookie('sa_active_org').value = String(row.value!.id)
  window.location.href = '/admin/users'
}

onBeforeRouteLeave(async () => {
  if (!dirty.value || saving.value) return true
  return await confirm('Hay cambios en esta empresa que no se han guardado.', { title: '¿Salir sin guardar?', confirmLabel: 'Salir', cancelLabel: 'Seguir editando', danger: true })
})
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
  window.addEventListener('beforeunload', onBeforeUnload)
})
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>
