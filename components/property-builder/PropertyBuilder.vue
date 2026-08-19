<template>
  <div v-if="loading" class="p-16 text-center text-sm text-stone-400">Cargando…</div>
  <div v-else>
    <!-- Sticky header: title, real state badge, save state, and the actions the old form already had -->
    <div class="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-line bg-white/95 px-6 py-4 backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <NuxtLink :to="`/admin/${resource}`" class="shrink-0 text-stone-400 hover:text-ink" aria-label="Volver">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
          </NuxtLink>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold text-ink">{{ isNew ? 'Crear propiedad' : form.name || form.slug || `Propiedad #${recordId}` }}</h1>
            <div class="mt-0.5 flex items-center gap-2 text-[11px]">
              <span v-if="form.status" class="rounded-full bg-stone-100 px-2 py-0.5 font-semibold uppercase tracking-wide text-stone-600">{{ form.status }}</span>
              <span :class="error ? 'text-red-500' : 'text-stone-400'">{{ saveStateLabel }}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink v-if="resource === 'developer-properties' && !isNew" :to="`/admin/ai?id=${recordId}`" class="btn-quiet">
            <span class="mr-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white">IA</span>Generar contenido
          </NuxtLink>
          <AdminAssetExportButton v-if="resource === 'developer-properties' && !isNew" :asset-id="recordId!" :property-type="form.propertyType" />
          <a v-if="!isNew" :href="`/demo/property-details/${form.slug || recordId}`" target="_blank" rel="noopener" class="btn-quiet">Vista previa</a>
          <button type="button" class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
      <!-- Mobile/tablet: horizontal section tabs -->
      <div class="thin-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
        <button
          v-for="s in sections"
          :key="s.key"
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition"
          :class="activeKey === s.key ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-ink'"
          @click="activeKey = s.key"
        >
          {{ s.label }}
          <span v-if="sectionHasError(s)" class="h-1.5 w-1.5 rounded-full" :class="activeKey === s.key ? 'bg-white' : 'bg-red-500'" />
        </button>
      </div>

      <!-- Desktop: vertical section nav -->
      <aside class="hidden w-56 shrink-0 lg:block">
        <nav class="sticky top-24 space-y-0.5">
          <button
            v-for="s in sections"
            :key="s.key"
            type="button"
            class="nav-item w-full"
            :class="activeKey === s.key ? 'nav-active' : ''"
            @click="activeKey = s.key"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="ICONS[s.icon] || ICONS.doc" />
            <span class="flex-1 text-left">{{ s.label }}</span>
            <span v-if="sectionHasError(s)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          </button>
        </nav>
      </aside>

      <!-- Active section content -->
      <div class="card min-w-0 flex-1 p-6">
        <template v-for="s in sections" :key="s.key">
          <div v-show="activeKey === s.key">
            <div v-if="s.kind === 'fields'" class="grid gap-4 sm:grid-cols-2">
              <PropertyBuilderField
                v-for="f in s.fields"
                :key="f.key"
                :spec="f"
                :model-value="form[f.key]"
                :upload-folder="resource"
                @update:model-value="(v) => (form[f.key] = v)"
              />
            </div>
            <TranslationsEditor v-else-if="s.kind === 'translations'" v-model="translations" />
            <GalleryManager v-else-if="s.kind === 'gallery'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" />
            <ChildTable v-else-if="s.kind === 'child-table'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" :columns="s.columns" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_BUILDER_SECTIONS, type BuilderSection, type FieldsSection } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'
import TranslationsEditor from './TranslationsEditor.vue'
import GalleryManager from './GalleryManager.vue'
import ChildTable from './ChildTable.vue'

const props = defineProps<{ resource: 'developer-properties' | 'properties'; id: string }>()

const router = useRouter()
const toast = useToast()

const sections = PROPERTY_BUILDER_SECTIONS[props.resource] as BuilderSection[]
const activeKey = ref(sections[0].key)

// The urls-prop stays the route's original id; recordId is the component's
// own source of truth so a freshly-created record can unlock its
// gallery/child-table sections immediately, without waiting for the
// post-create navigation to remount this component.
const isNew = computed(() => props.id === 'new')
const recordId = ref<number | null>(isNew.value ? null : Number(props.id))

const loading = ref(true)
const form = reactive<Record<string, any>>({})
const translations = ref([
  { locale: 'en', title: '', description: '' },
  { locale: 'ar', title: '', description: '' },
])
const hasTranslationsSection = sections.some((s) => s.kind === 'translations')

// A ref, not a plain variable: isDirty must re-evaluate the instant a save
// updates the baseline, not just when form/translations change again.
const savedSnapshot = ref('')
const isDirty = computed(() => JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined }) !== savedSnapshot.value)

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
  savedSnapshot.value = JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined })
}

onMounted(async () => {
  if (!isNew.value) {
    const res = await $fetch<{ row: Record<string, any>; translations: any[] }>(`/api/admin/${props.resource}/${props.id}`)
    for (const key of Object.keys(res.row)) form[key] = res.row[key]
    if (hasTranslationsSection) {
      for (const tr of res.translations || []) {
        const slot = translations.value.find((t) => t.locale === tr.locale)
        if (slot) {
          slot.title = tr.title
          slot.description = tr.description || ''
        }
      }
    }
  }
  snapshot()
  loading.value = false
})

function sectionHasError(s: BuilderSection): boolean {
  if (s.kind !== 'fields') return false
  return (s as FieldsSection).fields.some((f) => f.required && (form[f.key] === null || form[f.key] === undefined || form[f.key] === ''))
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const body: Record<string, any> = { ...form }
    if (hasTranslationsSection) body.translations = translations.value.filter((t) => t.title)
    if (isNew.value) {
      const res = await $fetch<{ id: number }>(`/api/admin/${props.resource}`, { method: 'POST', body })
      recordId.value = res.id
      router.replace(`/admin/${props.resource}/${res.id}`)
    } else {
      await $fetch(`/api/admin/${props.resource}/${recordId.value}`, { method: 'PUT', body })
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

// Same icon set as layouts/admin.vue's sidebar — kept local since that map
// isn't exported, but the paths are copied verbatim for visual consistency.
const ICONS: Record<string, string> = {
  doc: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" />',
  building: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />',
  invoice: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4" />',
  layers: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />',
  widget: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />',
  badge: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2l2.4 2.4L18 4l.6 3.4L22 9l-1.8 3 1.8 3-3.4 1.6L18 20l-3.6-.4L12 22l-2.4-2.4L6 20l-.6-3.4L2 15l1.8-3L2 9l3.4-1.6L6 4l3.6.4z" />',
  sparkles: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />',
  chart: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 15l4-5 3 3 5-7" />',
}
</script>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 0.5rem;
  padding: 0.5rem 0.7rem;
  font-size: 13px;
  font-weight: 500;
  color: #57534e;
  transition: all 0.14s ease;
}
.nav-item:hover {
  background: #f5f5f4;
  color: #16150f;
}
.nav-active {
  background: #16150f;
  color: #fff;
}
.nav-active:hover {
  background: #16150f;
  color: #fff;
}
</style>
