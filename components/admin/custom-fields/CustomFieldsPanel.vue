<template>
  <div data-testid="custom-fields-panel" :data-entity="`${entityType}-${entityId}`">
    <p v-if="loading" class="py-4 text-center text-xs text-stone-400">Cargando campos…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <div v-else-if="!definitions.length" class="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-stone-500" data-testid="custom-fields-empty">
      Tu agencia no tiene campos personalizados para {{ entityLabel }}.
      <NuxtLink v-if="canRead('crm')" to="/admin/campos-personalizados" class="font-medium text-ink underline">Créalos en CRM → Campos personalizados</NuxtLink>
    </div>

    <form v-else class="space-y-5" @submit.prevent="save">
      <fieldset v-for="group in groups" :key="group.name" class="space-y-3">
        <legend class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{{ group.name }}</legend>
        <div class="grid gap-3" :class="compact ? '' : 'sm:grid-cols-2'">
          <div v-for="d in group.fields" :key="d.id" :class="d.fieldType === 'textarea' || d.fieldType === 'multiselect' ? 'sm:col-span-2' : ''" :data-testid="`custom-field-${d.key}`">
            <label :for="inputId(d)" class="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-stone-600">
              {{ d.label }}<span v-if="d.isRequired" class="text-red-600" title="Obligatorio">*</span>
              <span v-if="d.isPublic" class="rounded bg-emerald-50 px-1 py-px text-[10px] font-medium text-emerald-700" title="Se enseña en la web pública de la propiedad">Público</span>
            </label>

            <template v-if="!canEdit">
              <p class="min-h-[1.5rem] text-sm text-ink">{{ formatCustomFieldValue(d.fieldType, form[d.key] ?? null) || '—' }}</p>
            </template>
            <input
              v-else-if="d.fieldType === 'text'"
              :id="inputId(d)"
              :value="strValue(d.key)"
              class="input"
              :maxlength="CUSTOM_FIELD_LIMITS.text"
              :required="d.isRequired"
              @input="setStr(d.key, $event)"
            >
            <textarea
              v-else-if="d.fieldType === 'textarea'"
              :id="inputId(d)"
              :value="strValue(d.key)"
              rows="3"
              class="input"
              :maxlength="CUSTOM_FIELD_LIMITS.textarea"
              :required="d.isRequired"
              @input="setStr(d.key, $event)"
            />
            <input
              v-else-if="d.fieldType === 'number'"
              :id="inputId(d)"
              :value="strValue(d.key)"
              type="number"
              step="any"
              class="input"
              :required="d.isRequired"
              @input="setStr(d.key, $event)"
            >
            <input
              v-else-if="d.fieldType === 'date'"
              :id="inputId(d)"
              :value="strValue(d.key)"
              type="date"
              class="input"
              :required="d.isRequired"
              @input="setStr(d.key, $event)"
            >
            <select v-else-if="d.fieldType === 'boolean'" :id="inputId(d)" v-model="form[d.key]" class="input" :required="d.isRequired">
              <option :value="null">—</option>
              <option :value="true">Sí</option>
              <option :value="false">No</option>
            </select>
            <select v-else-if="d.fieldType === 'select'" :id="inputId(d)" v-model="form[d.key]" class="input" :required="d.isRequired">
              <option :value="null">—</option>
              <option v-if="isStale(d)" :value="form[d.key]">{{ form[d.key] }} (ya no es una opción)</option>
              <option v-for="o in d.options" :key="o" :value="o">{{ o }}</option>
            </select>
            <div v-else-if="d.fieldType === 'multiselect'" :id="inputId(d)" class="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-line bg-white px-3 py-2">
              <label v-for="o in d.options" :key="o" class="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" :checked="multiValue(d.key).includes(o)" @change="toggleMulti(d.key, o)">
                {{ o }}
              </label>
            </div>

            <p v-if="d.helpText" class="mt-1 text-[11px] text-stone-400">{{ d.helpText }}</p>
          </div>
        </div>
      </fieldset>

      <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-3">
        <span v-if="saveError" class="text-[12px] font-medium text-red-600" data-testid="custom-fields-error">{{ saveError }}</span>
        <span v-else-if="dirtyKeys.length" class="text-[11px] text-amber-700">{{ dirtyKeys.length }} cambio{{ dirtyKeys.length === 1 ? '' : 's' }} sin guardar</span>
        <button type="submit" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="saving || !dirtyKeys.length" data-testid="custom-fields-save">
          {{ saving ? 'Guardando…' : 'Guardar campos' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  CUSTOM_FIELD_LIMITS,
  formatCustomFieldValue,
  type CustomFieldDefinitionDto,
  type CustomFieldEntityType,
  type CustomFieldValue,
} from '~/utils/customFieldCatalog'

/**
 * Campos personalizados de una ficha (FASE 0, bloque N7b) — el mismo
 * componente en propiedades (los dos catálogos), contactos, leads, citas y
 * operaciones. Pinta las definiciones activas de la agencia por sección y en
 * su orden, con el control de su tipo, y guarda SÓLO lo que cambió (así un
 * valor antiguo que ya no es una opción no impide guardar el resto). El
 * servidor valida cada valor por su tipo, los obligatorios y que el registro
 * y cada campo sean de esta agencia.
 */
const props = withDefaults(
  defineProps<{ entityType: CustomFieldEntityType; entityId: number; propertyKind?: 'agent' | 'developer'; canEdit?: boolean; compact?: boolean }>(),
  { propertyKind: undefined, canEdit: true, compact: false },
)
const emit = defineEmits<{ saved: []; count: [n: number] }>()
const toast = useToast()
const { canRead } = useAdminPermissions()

const resource = computed(() => (props.entityType === 'property' ? 'property-custom-field-values' : 'custom-field-values'))
const entityLabel = computed(() => CUSTOM_FIELD_ENTITY_LABELS[props.entityType].toLowerCase())
const definitions = ref<CustomFieldDefinitionDto[]>([])
const saved = ref<Record<string, CustomFieldValue>>({})
const form = reactive<Record<string, CustomFieldValue>>({})
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')

function query() {
  const q: Record<string, unknown> = { entityType: props.entityType, entityId: props.entityId }
  if (props.entityType === 'property') q.entityKind = props.propertyKind
  return q
}

/** El valor tal y como lo edita el control (los números viajan como texto mientras se escriben). */
function toForm(d: CustomFieldDefinitionDto, v: CustomFieldValue): CustomFieldValue {
  if (v === null || v === undefined) return d.fieldType === 'multiselect' ? [] : d.fieldType === 'boolean' || d.fieldType === 'select' ? null : ''
  if (d.fieldType === 'number') return String(v)
  return Array.isArray(v) ? [...v] : v
}

function apply(res: { definitions: CustomFieldDefinitionDto[]; values: Record<string, CustomFieldValue> }) {
  definitions.value = res.definitions
  saved.value = res.values
  for (const k of Object.keys(form)) Reflect.deleteProperty(form, k)
  for (const d of res.definitions) form[d.key] = toForm(d, res.values[d.key] ?? null)
  emit('count', res.definitions.filter((d) => formatCustomFieldValue(d.fieldType, res.values[d.key] ?? null)).length)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    apply(await $fetch<any>(`/api/admin/${resource.value}`, { query: query() }))
  } catch (e: any) {
    loadError.value = e?.data?.statusMessage || 'No se pudieron cargar los campos personalizados'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [props.entityType, props.entityId, props.propertyKind], load)

const groups = computed(() => {
  const out: { name: string; fields: CustomFieldDefinitionDto[] }[] = []
  for (const d of definitions.value) {
    const name = d.section || 'Campos personalizados'
    let g = out.find((x) => x.name === name)
    if (!g) {
      g = { name, fields: [] }
      out.push(g)
    }
    g.fields.push(d)
  }
  return out
})

function inputId(d: CustomFieldDefinitionDto) {
  return `cf-${props.entityType}-${props.entityId}-${d.key}`
}
function strValue(key: string): string {
  const v = form[key]
  return v === null || v === undefined ? '' : String(v)
}
function setStr(key: string, e: Event) {
  form[key] = (e.target as HTMLInputElement | HTMLTextAreaElement).value
}
function multiValue(key: string): string[] {
  const v = form[key]
  return Array.isArray(v) ? v : []
}
function toggleMulti(key: string, option: string) {
  const list = multiValue(key)
  form[key] = list.includes(option) ? list.filter((o) => o !== option) : [...list, option]
}
function isStale(d: CustomFieldDefinitionDto) {
  const v = form[d.key]
  return typeof v === 'string' && v !== '' && !d.options.includes(v)
}

/** Para comparar con lo guardado: vacío es vacío, sea '' o null o []. */
function normalized(d: CustomFieldDefinitionDto, v: CustomFieldValue): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return ''
  if (d.fieldType === 'number') return String(Number(v))
  return JSON.stringify(v)
}
const dirtyKeys = computed(() => definitions.value.filter((d) => normalized(d, form[d.key] ?? null) !== normalized(d, saved.value[d.key] ?? null)).map((d) => d.key))

async function save() {
  if (!dirtyKeys.value.length) return
  saving.value = true
  saveError.value = ''
  try {
    const values: Record<string, CustomFieldValue> = {}
    for (const key of dirtyKeys.value) {
      const v = form[key]
      values[key] = v === '' || (Array.isArray(v) && !v.length) ? null : v
    }
    apply(await $fetch<any>(`/api/admin/${resource.value}`, { method: 'POST', body: { ...query(), values } }))
    toast.success('Campos guardados')
    emit('saved')
  } catch (e: any) {
    saveError.value = e?.data?.statusMessage || 'No se pudieron guardar los campos'
  } finally {
    saving.value = false
  }
}

defineExpose({ reload: load })
</script>
