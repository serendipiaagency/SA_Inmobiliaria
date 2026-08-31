<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Brand Kit</h1>
      <p class="mt-1 text-sm text-stone-500">
        La identidad visual que el Asset Export Studio aplica automáticamente a cada pieza generada para tu inmobiliaria.
      </p>
    </div>

    <div v-if="!kit && !loading" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Todavía no tienes un Brand Kit. Completa los campos y guarda — se creará con estos datos.
    </div>

    <form @submit.prevent="save">
      <AdminPanel title="Logotipos">
        <div class="grid gap-4 sm:grid-cols-3">
          <div v-for="f in logoFields" :key="f.key" class="space-y-2">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">{{ f.label }}</span>
            <div v-if="form[f.key]" class="flex items-center gap-2">
              <img :src="mediaUrl(form[f.key])" class="h-12 w-12 rounded border border-line object-contain bg-stone-50" >
              <button type="button" class="text-xs text-red-600 hover:underline" @click="form[f.key] = ''">Quitar</button>
            </div>
            <input type="file" accept="image/*" class="text-xs" @change="upload(f.key, $event)" >
            <p v-if="uploading === f.key" class="text-xs text-stone-400">Subiendo…</p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title="Colores" class="mt-4">
        <div class="grid gap-4 sm:grid-cols-4">
          <label v-for="f in colorFields" :key="f.key" class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">{{ f.label }}</span>
            <div class="flex items-center gap-2">
              <input v-model="form[f.key]" type="color" class="h-9 w-10 cursor-pointer rounded-lg border border-line" >
              <input v-model="form[f.key]" class="cfg-input font-mono" placeholder="#000000" >
            </div>
          </label>
        </div>
        <label class="mt-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Colores auxiliares (separados por coma)</span>
          <input v-model="colorAccentsInput" class="cfg-input font-mono" placeholder="#B08D57, #1C1C1C" >
        </label>
      </AdminPanel>

      <AdminPanel title="Tipografías" class="mt-4">
        <div class="grid gap-4 sm:grid-cols-3">
          <label v-for="f in fontFields" :key="f.key" class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">{{ f.label }}</span>
            <input v-model="form[f.key]" class="cfg-input" placeholder="Inter" >
          </label>
        </div>
      </AdminPanel>

      <AdminPanel title="Contacto y legal" class="mt-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label v-for="f in contactFields" :key="f.key" class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">{{ f.label }}</span>
            <input v-model="form[f.key]" class="cfg-input" >
          </label>
        </div>
        <label class="mt-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Información legal (pie de página en dossiers/PDFs)</span>
          <textarea v-model="form.legalText" class="cfg-input" rows="3" />
        </label>
      </AdminPanel>

      <div class="mt-4 flex items-center gap-3">
        <button type="submit" class="dash-btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
        <transition name="fade"><span v-if="saved" class="text-sm font-medium text-emerald-600">✓ Guardado</span></transition>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
    </form>

    <AdminPanel v-if="versions.length" title="Historial de versiones" class="mt-6">
      <ul class="divide-y divide-line">
        <li v-for="v in versions" :key="v.id" class="flex items-center justify-between py-2.5 text-sm">
          <span class="text-stone-600">{{ formatDate(v.createdAt) }}</span>
          <button type="button" class="text-xs font-medium text-ink hover:underline" @click="restore(v.id)">Restaurar esta versión</button>
        </li>
      </ul>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Brand Kit — M&M Real Estate' })

interface BrandKit {
  id: number
  logo: string | null
  logoLight: string | null
  logoDark: string | null
  colorPrimary: string | null
  colorSecondary: string | null
  colorAccentsJson: string
  colorBackground: string | null
  colorText: string | null
  fontHeading: string | null
  fontBody: string | null
  fontAlt: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  legalText: string | null
}
interface BrandKitVersion {
  id: number
  createdAt: string
}

const logoFields = [
  { key: 'logo', label: 'Logotipo principal' },
  { key: 'logoLight', label: 'Logotipo claro' },
  { key: 'logoDark', label: 'Logotipo oscuro' },
]
const colorFields = [
  { key: 'colorPrimary', label: 'Principal' },
  { key: 'colorSecondary', label: 'Secundario' },
  { key: 'colorBackground', label: 'Fondo' },
  { key: 'colorText', label: 'Texto' },
]
const fontFields = [
  { key: 'fontHeading', label: 'Titulares' },
  { key: 'fontBody', label: 'Cuerpo' },
  { key: 'fontAlt', label: 'Alternativa' },
]
const contactFields = [
  { key: 'phone', label: 'Teléfono' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Web' },
]

const { data: kit } = await useFetch<BrandKit | null>('/api/admin/asset-export/brand-kit')
const { data: versionsData, refresh: refreshVersions } = await useFetch<BrandKitVersion[]>('/api/admin/asset-export/brand-kit/versions')
const versions = computed(() => versionsData.value || [])

const form = reactive<Record<string, any>>({
  logo: '', logoLight: '', logoDark: '',
  colorPrimary: '#16150f', colorSecondary: '#B08D57', colorBackground: '#ffffff', colorText: '#16150f',
  fontHeading: '', fontBody: '', fontAlt: '',
  phone: '', whatsapp: '', email: '', website: '', legalText: '',
})
const colorAccentsInput = ref('')
const loading = ref(true)

watch(
  kit,
  (k) => {
    loading.value = false
    if (!k) return
    for (const key of Object.keys(form)) if (key in k) form[key] = (k as any)[key] ?? form[key]
    try {
      colorAccentsInput.value = (JSON.parse(k.colorAccentsJson || '[]') as string[]).join(', ')
    } catch {
      colorAccentsInput.value = ''
    }
  },
  { immediate: true },
)

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
    fd.append('folder', 'brand-kit')
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    form[field] = res.key
  } catch (err: any) {
    error.value = err?.statusMessage || 'Error al subir el archivo'
  } finally {
    uploading.value = ''
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const colorAccents = colorAccentsInput.value.split(',').map((c) => c.trim()).filter(Boolean)
    const updated = await $fetch<BrandKit>('/api/admin/asset-export/brand-kit', { method: 'PUT', body: { ...form, colorAccents } })
    Object.assign(kit as any, updated)
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
    await refreshVersions()
  } catch (err: any) {
    error.value = err?.statusMessage || 'Error al guardar'
  } finally {
    saving.value = false
  }
}

async function restore(versionId: number) {
  if (!confirm('¿Restaurar esta versión? Sobrescribirá el Brand Kit actual (se guardará como una nueva versión, así que podrás deshacerlo).')) return
  const restored = await $fetch<BrandKit>(`/api/admin/asset-export/brand-kit/versions/${versionId}/restore`, { method: 'POST' })
  Object.assign(form, restored)
  try {
    colorAccentsInput.value = (JSON.parse(restored.colorAccentsJson || '[]') as string[]).join(', ')
  } catch {
    colorAccentsInput.value = ''
  }
  await refreshVersions()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
