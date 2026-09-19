<template>
  <fieldset class="space-y-3 rounded-lg border border-slate-200 p-4">
    <legend class="px-1 text-sm font-semibold text-slate-700">Permisos</legend>
    <p class="text-xs text-slate-500">Por defecto un admin tiene acceso completo al panel. Puedes restringir esta cuenta a solo las áreas que necesite.</p>

    <!-- Plantillas: rellenan las casillas de abajo y nada más. Lo que se
         guarda es el mismo JSON de áreas de siempre (utils/rolePresets.ts). -->
    <label class="block">
      <span class="mb-1 block text-xs font-medium text-slate-600">Plantilla</span>
      <select class="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" :value="activePresetKey" data-testid="permissions-preset" @change="applyPreset(($event.target as HTMLSelectElement).value)">
        <option v-for="p in ROLE_PRESETS" :key="p.key" :value="p.key">{{ p.label }}</option>
        <option value="custom" disabled>Personalizado (casillas a mano)</option>
      </select>
      <span class="mt-1 block text-[11px] leading-snug text-slate-500">{{ activePresetDescription }}</span>
    </label>

    <div class="space-y-1.5">
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="radio" name="permissions-mode" :checked="!restricted" @change="setRestricted(false)">
        Acceso completo (sin restricciones)
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="radio" name="permissions-mode" :checked="restricted" @change="setRestricted(true)">
        Restringir a áreas concretas
      </label>
    </div>

    <div v-if="restricted" class="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
      <p class="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">Si no marcas ninguna área, la cuenta seguirá teniendo acceso completo — marca "Ver" o "Editar" en cada área que quieras conceder.</p>
      <div v-for="a in ADMIN_AREAS" :key="a.key" class="flex items-center justify-between gap-3 px-3 py-2">
        <span class="text-sm text-slate-700">{{ a.label }}</span>
        <div class="flex items-center gap-4 text-xs text-slate-500">
          <label class="flex items-center gap-1.5">
            <input type="checkbox" :checked="state[a.key].read" @change="toggle(a.key, 'read', ($event.target as HTMLInputElement).checked)">
            Ver
          </label>
          <label class="flex items-center gap-1.5">
            <input type="checkbox" :checked="state[a.key].write" @change="toggle(a.key, 'write', ($event.target as HTMLInputElement).checked)">
            Editar
          </label>
        </div>
      </div>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { ADMIN_AREAS, type AdminArea } from '~/utils/adminAreas'
import { findPreset, matchPreset, ROLE_PRESETS } from '~/utils/rolePresets'

/**
 * Visual editor for `users.permissions` (P2 granular RBAC,
 * server/utils/permissions.ts). Replaces the raw JSON textarea the generic
 * resource form would otherwise render for a `'json'`-type field — see
 * pages/admin/[resource]/[id].vue, which hides the generic field for
 * `permissions` and mounts this component in its place, `v-model`-bound to
 * the same `form.permissions` string the save() call submits.
 */
const props = defineProps<{ modelValue: string | null | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

type AreaState = Record<AdminArea, { read: boolean; write: boolean }>
function emptyState(): AreaState {
  const s = {} as AreaState
  for (const a of ADMIN_AREAS) s[a.key] = { read: false, write: false }
  return s
}

const restricted = ref(false)
const state = reactive<AreaState>(emptyState())

function parse(raw: string | null | undefined) {
  const next = emptyState()
  let isRestricted = false
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) {
        isRestricted = true
        for (const entry of arr) {
          if (typeof entry !== 'string') continue
          const [area, action] = entry.split(':')
          if (!ADMIN_AREAS.some((a) => a.key === area)) continue
          if (action === 'write') {
            next[area as AdminArea].write = true
            next[area as AdminArea].read = true
          } else if (action === 'read') {
            next[area as AdminArea].read = true
          }
        }
      }
    } catch {
      // Unparseable — same as parsePermissions server-side: fails open to unrestricted.
    }
  }
  restricted.value = isRestricted
  Object.assign(state, next)
}

watch(() => props.modelValue, parse, { immediate: true })

/** Qué plantilla equivale al valor actual (o "custom" si las casillas no coinciden con ninguna). */
const activePresetKey = computed(() => matchPreset(props.modelValue)?.key ?? 'custom')
const activePresetDescription = computed(
  () => matchPreset(props.modelValue)?.description ?? 'Combinación hecha a mano: no coincide con ninguna plantilla. Elige una para partir de ella.',
)

function applyPreset(key: string) {
  const preset = findPreset(key)
  if (!preset) return
  const value = preset.permissions === null ? null : JSON.stringify(preset.permissions)
  parse(value)
  emit('update:modelValue', value)
}

function emitChange() {
  if (!restricted.value) {
    emit('update:modelValue', null)
    return
  }
  const out: string[] = []
  for (const a of ADMIN_AREAS) {
    if (state[a.key].write) out.push(`${a.key}:write`)
    else if (state[a.key].read) out.push(`${a.key}:read`)
  }
  emit('update:modelValue', JSON.stringify(out))
}

function setRestricted(value: boolean) {
  restricted.value = value
  emitChange()
}

function toggle(area: AdminArea, action: 'read' | 'write', checked: boolean) {
  if (action === 'write') {
    state[area].write = checked
    if (checked) state[area].read = true // write implies read
  } else {
    state[area].read = checked
    if (!checked) state[area].write = false // can't keep write without read
  }
  emitChange()
}
</script>
