<template>
  <div class="mx-auto max-w-4xl" data-testid="org-wizard" :data-ready="mounted ? 'true' : undefined">
    <NuxtLink to="/admin/organizations" class="inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition hover:text-ink" data-testid="org-wizard-back">← Empresas</NuxtLink>
    <h1 class="mt-3 text-2xl font-bold text-ink sm:text-3xl">Nueva empresa</h1>
    <p class="mt-1 text-sm text-stone-500">Configura una nueva empresa en INMO.</p>

    <!-- Éxito -->
    <section v-if="created" class="card mt-8 p-6 sm:p-8" data-testid="org-wizard-success" aria-live="polite">
      <div class="flex items-start gap-4">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
        </span>
        <div class="min-w-0">
          <h2 ref="successHeading" tabindex="-1" class="text-xl font-bold text-ink outline-none">Empresa creada</h2>
          <p class="mt-1 text-sm text-stone-600"><strong>{{ created.organization.companyName || created.organization.name }}</strong> ya existe en INMO.</p>
        </div>
      </div>
      <ul class="mt-6 space-y-2 text-sm">
        <li v-if="created.admin" class="rounded-xl border px-4 py-3" :class="inviteTone" data-testid="org-wizard-invite-status" :data-status="created.invite">{{ inviteMessage }}</li>
        <li v-else class="rounded-xl border border-line bg-paper px-4 py-3 text-stone-600">Sin administrador por ahora. Puedes invitar a uno desde la ficha de la empresa.</li>
        <li v-if="logoOutcome === 'failed'" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" data-testid="org-wizard-logo-failed">
          La empresa se ha creado, pero el logo no se ha podido subir ({{ logoError }}). Súbelo desde la ficha → Identidad.
        </li>
        <li v-else-if="logoOutcome === 'ok'" class="rounded-xl border border-line bg-paper px-4 py-3 text-stone-600">Logo guardado.</li>
      </ul>
      <div class="mt-8 flex flex-wrap gap-3">
        <NuxtLink :to="`/admin/organizations/${created.id}`" class="btn-primary" data-testid="org-wizard-open">Ver empresa</NuxtLink>
        <button type="button" class="btn-secondary" data-testid="org-wizard-another" @click="reset">Crear otra empresa</button>
        <NuxtLink to="/admin/organizations" class="btn-quiet">Volver a Empresas</NuxtLink>
      </div>
    </section>

    <template v-else>
      <!-- Pasos -->
      <nav class="mt-8" aria-label="Pasos del alta">
        <ol class="grid grid-cols-5 gap-2">
          <li v-for="(s, i) in STEPS" :key="s.key">
            <button
              type="button"
              class="group flex w-full flex-col items-start gap-1.5 text-left disabled:cursor-not-allowed"
              :aria-current="i === current ? 'step' : undefined"
              :disabled="i > furthest || submitting"
              :data-testid="`org-wizard-step-${s.key}`"
              :data-state="i === current ? 'current' : i < current || i <= furthest ? 'done' : 'todo'"
              @click="goTo(i)"
            >
              <span class="h-1 w-full rounded-full transition-colors" :class="i <= current ? 'bg-ink' : i <= furthest ? 'bg-stone-400' : 'bg-line'" />
              <span class="flex items-center gap-1.5 text-[12px] font-semibold" :class="i === current ? 'text-ink' : 'text-stone-500'">
                <span class="tabular-nums opacity-60">{{ i + 1 }}</span>
                <span class="hidden sm:inline">{{ s.label }}</span>
                <span v-if="stepHasError(s.key)" class="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="con errores" />
              </span>
            </button>
          </li>
        </ol>
        <p class="mt-2 text-xs text-stone-500 sm:hidden">Paso {{ current + 1 }} de {{ STEPS.length }} · {{ STEPS[current]!.label }}</p>
      </nav>

      <form class="card mt-6" novalidate @submit.prevent="next">
        <div class="p-5 sm:p-8">
          <h2 ref="stepHeading" tabindex="-1" class="text-lg font-bold text-ink outline-none">{{ STEPS[current]!.title }}</h2>
          <p class="mt-1 text-sm text-stone-500">{{ STEPS[current]!.hint }}</p>

          <p v-if="formError" class="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" data-testid="org-wizard-error">{{ formError }}</p>

          <!-- 1. Empresa -->
          <div v-show="stepKey === 'empresa'" class="mt-6 space-y-6">
            <div>
              <label for="org-name" class="label">Nombre de la empresa <span class="text-red-500">*</span></label>
              <input id="org-name" v-model="form.name" type="text" class="input" maxlength="120" autocomplete="organization" :aria-invalid="errors.name ? 'true' : undefined" aria-describedby="org-name-help" data-testid="org-name">
              <p v-if="errors.name" id="org-name-help" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.name }}</p>
              <p v-else id="org-name-help" class="mt-1.5 text-xs text-stone-500">El nombre interno con el que la verás en Sistemas > Empresas.</p>
            </div>
            <div>
              <label class="flex items-center gap-2.5 text-sm text-ink">
                <input v-model="form.sameCompanyName" type="checkbox" class="h-4 w-4 accent-ink" data-testid="org-same-company-name">
                El nombre comercial es el mismo
              </label>
              <div v-if="!form.sameCompanyName" class="mt-3">
                <label for="org-company-name" class="label">Nombre comercial</label>
                <input id="org-company-name" v-model="form.companyName" type="text" class="input" maxlength="120" :aria-invalid="errors.companyName ? 'true' : undefined" data-testid="org-company-name">
                <p class="mt-1.5 text-xs text-stone-500">El que verán sus clientes en la web y en los emails.</p>
              </div>
            </div>
            <AdminOrganizationsOrgDomainField v-model="form.domain" :error="errors.domain" @update:state="domainState = $event" />
            <fieldset>
              <legend class="label">Estado inicial</legend>
              <div class="grid gap-3 sm:grid-cols-2">
                <label
                  v-for="(info, value) in ORGANIZATION_STATUS_LABELS"
                  :key="value"
                  class="flex cursor-pointer gap-3 rounded-xl border p-4 transition"
                  :class="form.status === value ? 'border-ink bg-paper' : 'border-line hover:border-stone-400'"
                >
                  <input v-model="form.status" type="radio" name="org-status" :value="value" class="mt-0.5 h-4 w-4 accent-ink" :data-testid="`org-status-${value}`">
                  <span>
                    <span class="block text-sm font-semibold text-ink">{{ info.label }}</span>
                    <span class="block text-xs text-stone-500">{{ info.description }}</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          <!-- 2. Identidad -->
          <div v-show="stepKey === 'identidad'" class="mt-6 grid gap-8 lg:grid-cols-[1fr_260px]">
            <div class="space-y-6">
              <AdminOrganizationsOrgLogoField
                :preview-url="logo?.url ?? null"
                :file-name="logo?.file.name ?? null"
                :error="errors.logo"
                @select="selectLogo"
                @remove="removeLogo"
                @invalid="errors.logo = $event"
              />
              <AdminOrganizationsOrgBrandColorField v-model="form.brandColor" :error="errors.brandColor" />
            </div>
            <div>
              <span class="label">Vista previa</span>
              <AdminOrganizationsOrgBrandPreview :display-name="displayName" :brand-color="form.brandColor" :logo-url="logo?.url ?? null" />
            </div>
          </div>

          <!-- 3. Configuración -->
          <div v-show="stepKey === 'configuracion'" class="mt-6 space-y-6">
            <div>
              <label for="org-locale" class="label">Idioma de los emails</label>
              <select id="org-locale" v-model="form.emailLocale" class="input max-w-xs" data-testid="org-locale">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
              <p class="mt-1.5 text-xs text-stone-500">Idioma de los emails que la empresa envía a sus clientes y de la invitación al administrador.</p>
            </div>
            <div>
              <label for="org-storage" class="label">Almacenamiento (GB)</label>
              <input id="org-storage" v-model.number="form.storageLimitGb" type="number" min="1" max="1000" step="1" class="input max-w-[10rem]" :aria-invalid="errors.storageLimitGb ? 'true' : undefined" data-testid="org-storage">
              <p v-if="errors.storageLimitGb" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.storageLimitGb }}</p>
              <p v-else class="mt-1.5 text-xs text-stone-500">Espacio para fotos, documentos y vídeos. Por defecto, 5 GB.</p>
            </div>
            <p class="rounded-xl border border-line bg-paper px-4 py-3 text-xs text-stone-600">
              El remitente de email, los destinatarios internos y los datos legales se configuran después, en la ficha de la empresa.
            </p>
          </div>

          <!-- 4. Acceso -->
          <div v-show="stepKey === 'acceso'" class="mt-6 space-y-6">
            <fieldset>
              <legend class="label">Administrador inicial</legend>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex cursor-pointer gap-3 rounded-xl border p-4 transition" :class="form.adminMode === 'invite' ? 'border-ink bg-paper' : 'border-line hover:border-stone-400'">
                  <input v-model="form.adminMode" type="radio" name="org-admin-mode" value="invite" class="mt-0.5 h-4 w-4 accent-ink" data-testid="org-admin-invite">
                  <span>
                    <span class="block text-sm font-semibold text-ink">Invitar ahora</span>
                    <span class="block text-xs text-stone-500">Recibe un email para definir su contraseña.</span>
                  </span>
                </label>
                <label class="flex cursor-pointer gap-3 rounded-xl border p-4 transition" :class="form.adminMode === 'none' ? 'border-ink bg-paper' : 'border-line hover:border-stone-400'">
                  <input v-model="form.adminMode" type="radio" name="org-admin-mode" value="none" class="mt-0.5 h-4 w-4 accent-ink" data-testid="org-admin-none">
                  <span>
                    <span class="block text-sm font-semibold text-ink">Más adelante</span>
                    <span class="block text-xs text-stone-500">La empresa se crea sin usuarios.</span>
                  </span>
                </label>
              </div>
            </fieldset>
            <div v-if="form.adminMode === 'invite'" class="grid gap-5 sm:grid-cols-2">
              <div>
                <label for="org-admin-name" class="label">Nombre <span class="text-red-500">*</span></label>
                <input id="org-admin-name" v-model="form.adminName" type="text" class="input" maxlength="120" autocomplete="off" :aria-invalid="errors.adminName ? 'true' : undefined" data-testid="org-admin-name">
                <p v-if="errors.adminName" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.adminName }}</p>
              </div>
              <div>
                <label for="org-admin-email" class="label">Correo electrónico <span class="text-red-500">*</span></label>
                <input id="org-admin-email" v-model="form.adminEmail" type="email" class="input" maxlength="200" autocomplete="off" :aria-invalid="errors.adminEmail ? 'true' : undefined" data-testid="org-admin-email">
                <p v-if="errors.adminEmail" class="mt-1.5 text-xs font-medium text-red-600" data-testid="org-admin-email-error">{{ errors.adminEmail }}</p>
              </div>
              <p class="text-xs text-stone-600 sm:col-span-2">
                Será <strong>Administrador</strong> de esta empresa (nunca super admin). Recibirá un email de <span class="font-mono">INMO &lt;info@serendipiaagency.com&gt;</span> con un enlace para definir su contraseña. Nunca enviamos contraseñas por email.
              </p>
            </div>
          </div>

          <!-- 5. Revisión -->
          <div v-show="stepKey === 'revision'" class="mt-6 space-y-4" data-testid="org-wizard-review">
            <section v-for="block in reviewBlocks" :key="block.step" class="rounded-xl border border-line p-4">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-ink">{{ block.title }}</h3>
                <button type="button" class="text-xs font-semibold text-ink underline underline-offset-2 hover:text-black" :data-testid="`org-review-edit-${block.step}`" @click="goTo(stepIndex(block.step))">Editar</button>
              </div>
              <dl class="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div v-for="row in block.rows" :key="row[0]" class="min-w-0">
                  <dt class="text-xs text-stone-500">{{ row[0] }}</dt>
                  <dd class="truncate text-ink">
                    <span v-if="row[0] === 'Color de marca' && isHexColor(form.brandColor)" class="mr-1.5 inline-block h-3 w-3 rounded-full align-middle" :style="{ backgroundColor: form.brandColor }" />{{ row[1] }}
                  </dd>
                </div>
              </dl>
            </section>
            <p class="text-xs text-stone-500">Nada se guarda hasta que pulses «Crear empresa».</p>
          </div>
        </div>

        <!-- Pie -->
        <div class="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <button type="button" class="btn-quiet" :disabled="submitting" data-testid="org-wizard-cancel" @click="cancel">Cancelar</button>
          <div class="flex flex-col-reverse gap-3 sm:flex-row">
            <button v-if="current > 0" type="button" class="btn-secondary" :disabled="submitting" data-testid="org-wizard-prev" @click="prev">Atrás</button>
            <button v-if="stepKey !== 'revision'" type="submit" class="btn-primary" :disabled="domainState === 'checking'" data-testid="org-wizard-next">Continuar</button>
            <button v-else type="button" class="btn-primary" :disabled="submitting" :aria-busy="submitting ? 'true' : undefined" data-testid="org-wizard-submit" @click="submit">
              {{ submitting ? 'Creando…' : 'Crear empresa' }}
            </button>
          </div>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ORGANIZATION_STATUS_LABELS, isHexColor, previewDomain, type DomainState } from '~/utils/organizationLabels'

/**
 * Sistemas > Empresas > + Nuevo — alta guiada en 5 pasos. Nada se escribe
 * hasta «Crear empresa» (POST /api/admin/organizations → mismo provisioning
 * que el registro público, server/utils/organizations/). El logo se queda en
 * memoria y se sube DESPUÉS de crear la empresa, a nombre de esa empresa: si
 * falla, la empresa ya existe y se dice tal cual.
 */
type StepKey = 'empresa' | 'identidad' | 'configuracion' | 'acceso' | 'revision'
const STEPS: { key: StepKey; label: string; title: string; hint: string }[] = [
  { key: 'empresa', label: 'Empresa', title: 'Datos de la empresa', hint: 'Cómo se llama, dónde vivirá su web y en qué estado empieza.' },
  { key: 'identidad', label: 'Identidad', title: 'Identidad de marca', hint: 'Logo y color con los que se verá la empresa.' },
  { key: 'configuracion', label: 'Configuración', title: 'Configuración', hint: 'Idioma de los emails y espacio de almacenamiento.' },
  { key: 'acceso', label: 'Acceso', title: 'Acceso', hint: 'Quién administrará la empresa desde el primer día.' },
  { key: 'revision', label: 'Revisión', title: 'Revisa antes de crear', hint: 'Comprueba los datos. Puedes volver a cualquier paso.' },
]
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

function blankForm() {
  return {
    name: '',
    sameCompanyName: true,
    companyName: '',
    domain: '',
    status: 'active',
    brandColor: '#1F2937',
    emailLocale: 'es',
    storageLimitGb: 5 as number | '',
    adminMode: 'invite' as 'invite' | 'none',
    adminName: '',
    adminEmail: '',
  }
}

const form = reactive(blankForm())
const pristine = JSON.stringify(blankForm())
const errors = reactive<Record<string, string>>({})
const current = ref(0)
const furthest = ref(0)
const domainState = ref<DomainState>('empty')
const logo = ref<{ file: File; url: string } | null>(null)
const submitting = ref(false)
const formError = ref('')
const stepHeading = ref<HTMLElement | null>(null)
const successHeading = ref<HTMLElement | null>(null)

interface Created {
  id: number
  organization: { id: number; name: string; companyName: string | null }
  admin: { id: number; email: string } | null
  invite: 'sent' | 'queued' | 'failed' | 'not_configured' | 'none'
}
const created = ref<Created | null>(null)
const logoOutcome = ref<'none' | 'ok' | 'failed'>('none')
const logoError = ref('')

const stepKey = computed(() => STEPS[current.value]!.key)
const displayName = computed(() => (form.sameCompanyName ? form.name : form.companyName || form.name).trim())
const dirty = computed(() => JSON.stringify(form) !== pristine || Boolean(logo.value))

const STEP_FIELDS: Record<StepKey, string[]> = {
  empresa: ['name', 'companyName', 'domain', 'status'],
  identidad: ['logo', 'brandColor'],
  configuracion: ['emailLocale', 'storageLimitGb'],
  acceso: ['adminName', 'adminEmail'],
  revision: [],
}
const stepIndex = (key: string) => Math.max(0, STEPS.findIndex((s) => s.key === key))
const stepHasError = (key: StepKey) => STEP_FIELDS[key].some((f) => errors[f])

// Corregir un campo borra su error al momento (si no, «Revisa el dominio»
// seguía en pantalla con el dominio ya corregido y disponible).
for (const field of ['name', 'companyName', 'domain', 'brandColor', 'storageLimitGb', 'adminName', 'adminEmail'] as const) {
  watch(
    () => form[field],
    () => {
      errors[field] = ''
    },
  )
}

function clearStepErrors(key: StepKey) {
  for (const f of STEP_FIELDS[key]) errors[f] = ''
}

function validateStep(key: StepKey): boolean {
  clearStepErrors(key)
  if (key === 'empresa') {
    if (!form.name.trim()) errors.name = 'Introduce un nombre para la empresa.'
    if (domainState.value === 'taken' || domainState.value === 'invalid') errors.domain = 'Revisa el dominio antes de continuar.'
  }
  if (key === 'identidad') {
    if (form.brandColor && !isHexColor(form.brandColor)) errors.brandColor = 'Usa el formato #RRGGBB, por ejemplo #1F6F5C.'
  }
  if (key === 'configuracion') {
    const gb = form.storageLimitGb
    if (gb !== '' && (!Number.isInteger(gb) || gb < 1 || gb > 1000)) errors.storageLimitGb = 'Un número entero de GB entre 1 y 1000.'
  }
  if (key === 'acceso' && form.adminMode === 'invite') {
    if (!form.adminName.trim()) errors.adminName = 'Introduce el nombre del administrador.'
    if (!EMAIL_RE.test(form.adminEmail.trim())) errors.adminEmail = 'Introduce un correo electrónico válido.'
  }
  return !stepHasError(key)
}

async function focusStep() {
  await nextTick()
  const firstInvalid = document.querySelector<HTMLElement>('[data-testid="org-wizard"] [aria-invalid="true"]')
  ;(firstInvalid && firstInvalid.offsetParent ? firstInvalid : stepHeading.value)?.focus()
}

function goTo(i: number) {
  if (i > furthest.value || submitting.value) return
  formError.value = ''
  current.value = i
  focusStep()
}

function next() {
  if (!validateStep(stepKey.value)) return focusStep()
  current.value++
  furthest.value = Math.max(furthest.value, current.value)
  focusStep()
}

function prev() {
  formError.value = ''
  if (current.value > 0) current.value--
  focusStep()
}

function selectLogo(file: File) {
  delete errors.logo
  if (logo.value) URL.revokeObjectURL(logo.value.url)
  logo.value = { file, url: URL.createObjectURL(file) }
}
function removeLogo() {
  if (logo.value) URL.revokeObjectURL(logo.value.url)
  logo.value = null
}
onBeforeUnmount(() => removeLogo())

const LOCALE_LABELS: Record<string, string> = { es: 'Español', en: 'English' }
const reviewBlocks = computed(() => [
  {
    step: 'empresa',
    title: 'Empresa',
    rows: [
      ['Nombre', form.name.trim() || '—'],
      ['Nombre comercial', displayName.value || '—'],
      ['Dominio', previewDomain(form.domain) || 'Sin dominio por ahora'],
      ['Estado', ORGANIZATION_STATUS_LABELS[form.status]?.label ?? form.status],
    ],
  },
  {
    step: 'identidad',
    title: 'Identidad',
    rows: [
      ['Logo', logo.value ? logo.value.file.name : 'Sin logo'],
      ['Color de marca', form.brandColor || 'Por defecto'],
    ],
  },
  {
    step: 'configuracion',
    title: 'Configuración',
    rows: [
      ['Idioma de los emails', LOCALE_LABELS[form.emailLocale] ?? form.emailLocale],
      ['Almacenamiento', form.storageLimitGb === '' ? '5 GB (por defecto)' : `${form.storageLimitGb} GB`],
    ],
  },
  {
    step: 'acceso',
    title: 'Acceso',
    rows: form.adminMode === 'invite' ? [['Administrador', form.adminName.trim()], ['Correo', form.adminEmail.trim()]] : [['Administrador', 'Más adelante']],
  },
])

const toast = useToast()

async function submit() {
  if (submitting.value) return // doble clic: una sola petición
  for (const s of STEPS) {
    if (!validateStep(s.key)) {
      current.value = stepIndex(s.key)
      return focusStep()
    }
  }
  submitting.value = true
  formError.value = ''
  try {
    const res = await $fetch<Created & { ok: true }>('/api/admin/organizations', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        companyName: form.sameCompanyName ? null : form.companyName.trim() || null,
        domain: form.domain.trim() || null,
        status: form.status,
        brandColor: form.brandColor || null,
        emailLocale: form.emailLocale,
        storageLimitGb: form.storageLimitGb === '' ? null : form.storageLimitGb,
        initialAdmin: form.adminMode === 'invite' ? { mode: 'invite', name: form.adminName.trim(), email: form.adminEmail.trim() } : { mode: 'none' },
      },
    })
    if (logo.value) await uploadLogo(res.id)
    created.value = res
    toast.success('Empresa creada')
    await nextTick()
    successHeading.value?.focus()
  } catch (e: any) {
    const err = e?.data?.error
    if (err?.field && err?.step) {
      errors[err.field === 'password' ? 'adminEmail' : err.field] = err.message
      current.value = stepIndex(err.step)
      formError.value = err.message
      focusStep()
    } else {
      formError.value = e?.data?.statusMessage || e?.statusMessage || 'No se ha podido crear la empresa. Inténtalo de nuevo.'
    }
  } finally {
    submitting.value = false
  }
}

async function uploadLogo(organizationId: number) {
  try {
    const fd = new FormData()
    fd.append('file', logo.value!.file)
    fd.append('folder', 'organizations')
    fd.append('organizationId', String(organizationId))
    const up = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    await $fetch(`/api/admin/organizations/${organizationId}`, { method: 'PUT', body: { logo: up.key } })
    logoOutcome.value = 'ok'
  } catch (e: any) {
    logoOutcome.value = 'failed'
    logoError.value = e?.data?.statusMessage || e?.statusMessage || 'error al subir'
  }
}

const inviteMessage = computed(() => {
  const email = created.value?.admin?.email
  switch (created.value?.invite) {
    case 'sent':
      return `Invitación enviada a ${email}.`
    case 'queued':
      return `La invitación a ${email} está en cola: el proveedor de email no respondió y se reintentará automáticamente.`
    case 'not_configured':
      return `El administrador ${email} se ha creado, pero la invitación NO se ha enviado: el envío de emails no está configurado en esta plataforma.`
    default:
      return `El administrador ${email} se ha creado, pero la invitación no se ha podido enviar. Reenvíala desde la ficha → Usuarios.`
  }
})
const inviteTone = computed(() => (created.value?.invite === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'))

function reset() {
  Object.assign(form, blankForm())
  for (const k of Object.keys(errors)) errors[k] = ''
  removeLogo()
  created.value = null
  logoOutcome.value = 'none'
  current.value = 0
  furthest.value = 0
  formError.value = ''
  domainState.value = 'empty'
  focusStep()
}

const router = useRouter()
function cancel() {
  router.push('/admin/organizations')
}

// Salir con cambios sin guardar pide confirmación (navegación interna y cierre de pestaña).
const { confirm } = useConfirm()
onBeforeRouteLeave(async () => {
  if (!dirty.value || created.value || submitting.value) return true
  return await confirm('Los datos de la nueva empresa no se han guardado.', { title: '¿Salir sin crear la empresa?', confirmLabel: 'Salir', cancelLabel: 'Seguir editando', danger: true })
})
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value && !created.value) {
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
