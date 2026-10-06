<template>
  <div class="inline-edit min-w-0" :data-testid="testId">
    <!-- Lectura: el valor tal cual (o lo que pinte el slot, p. ej. el chip de estado). Sin escritura no hay botón. -->
    <template v-if="!editing">
      <button
        v-if="editable"
        type="button"
        class="group inline-flex max-w-full items-center gap-1 rounded text-left hover:bg-stone-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
        :title="`Editar ${label.toLowerCase()} (Enter guarda, Esc cancela)`"
        :aria-label="`Editar ${label.toLowerCase()}: ${display}`"
        :data-testid="`${testId}-open`"
        @click="start"
      >
        <slot>
          <span class="truncate">{{ display }}</span>
        </slot>
        <svg class="h-3 w-3 shrink-0 text-stone-300 transition group-hover:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.86 4.49a2.1 2.1 0 1 1 2.97 2.97L8.5 18.8l-4 1 1-4L16.86 4.49Z" /></svg>
      </button>
      <slot v-else>
        <span class="truncate">{{ display }}</span>
      </slot>
    </template>

    <!-- Edición: un control, Enter/blur guarda (un desplegable, al elegir), Esc cancela. -->
    <template v-else>
      <div class="flex items-center gap-1">
        <select
          v-if="type === 'select'"
          ref="control"
          v-model="draft"
          class="w-full min-w-[8rem] rounded border border-line bg-white px-1.5 py-1 text-xs focus:border-ink"
          :class="error ? 'border-red-400' : ''"
          :disabled="saving"
          :aria-label="label"
          :aria-invalid="error ? 'true' : undefined"
          :data-testid="`${testId}-input`"
          @change="commit"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
          @blur="onBlur"
        >
          <option v-for="o in options" :key="String(o.value)" :value="String(o.value)">{{ o.label }}</option>
        </select>
        <input
          v-else
          ref="control"
          v-model="draft"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          class="w-full min-w-[7rem] rounded border border-line bg-white px-1.5 py-1 text-xs tabular-nums focus:border-ink"
          :class="error ? 'border-red-400' : ''"
          :placeholder="placeholder"
          :disabled="saving"
          :aria-label="label"
          :aria-invalid="error ? 'true' : undefined"
          :data-testid="`${testId}-input`"
          @input="error = validateDraft()"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
          @blur="onBlur"
        >
        <!-- Cancelar sin teclado (móvil). mousedown.prevent: que no se pierda el foco —y no se guarde— antes del clic. -->
        <button type="button" class="shrink-0 rounded px-1 text-sm leading-none text-stone-400 hover:text-ink" title="Cancelar (Esc)" aria-label="Cancelar" :data-testid="`${testId}-cancel`" @mousedown.prevent @click="cancel">×</button>
      </div>
      <p v-if="saving" class="mt-0.5 text-[10px] text-stone-400">Guardando…</p>
      <p v-else-if="error" class="mt-0.5 max-w-[16rem] whitespace-normal text-[11px] font-medium leading-tight text-red-600" role="alert" :data-testid="`${testId}-error`">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { parseInlineNumber } from '~/utils/inlineEdit'

/**
 * Edición inline de un campo desde la fila de un listado (cierre C1, FASE
 * 25 «edición inline»): clic → control → Enter o salir del campo guarda (un
 * desplegable, en cuanto se elige), Esc cancela. Valida al escribir, y un
 * error —propio o del servidor— se queda visible bajo el control hasta
 * corregirlo o cancelar.
 *
 * No guarda nada por su cuenta: `save` es la misma llamada que ya hace el
 * resto del panel (el PUT del motor genérico en propiedades, el PATCH de
 * etapa o la reasignación en leads), así que permisos, validación,
 * historial y auditoría son los de siempre. Sin `editable` (sin escritura en
 * el área) sólo enseña el valor.
 */
const props = withDefaults(
  defineProps<{
    /** Valor actual (`null` = vacío). En un desplegable se compara como texto. */
    value: string | number | null
    type: 'select' | 'number'
    /** Texto del valor en modo lectura (si no se pinta con el slot). */
    display: string
    /** Nombre del campo, para el título y la etiqueta accesible («Precio», «Estado»…). */
    label: string
    /** Prefijo de los `data-testid`: `<id>-open`, `<id>-input`, `<id>-error`. */
    testId: string
    options?: { value: string | number; label: string }[]
    editable?: boolean
    placeholder?: string
    /** Validación inmediata: devuelve el mensaje de error, o null si vale. */
    validate?: (value: string | number | null) => string | null
    /** Guarda el valor nuevo. Si lanza, su `statusMessage` se enseña bajo el control. */
    save: (value: string | number | null) => Promise<void>
  }>(),
  { options: () => [], editable: true, placeholder: '', validate: undefined },
)

const editing = ref(false)
const saving = ref(false)
const draft = ref('')
const error = ref<string | null>(null)
const control = ref<HTMLInputElement | HTMLSelectElement | null>(null)

function asText(v: string | number | null) {
  return v === null || v === undefined ? '' : String(v)
}

/** El borrador con su tipo: número (o null si está vacío) o el valor elegido. */
function parsed(): string | number | null {
  if (props.type === 'number') return parseInlineNumber(draft.value)
  return draft.value
}

function validateDraft(): string | null {
  const v = parsed()
  if (props.type === 'number' && draft.value.trim() !== '' && v === null) return 'Escribe un número (p. ej. 450000 o 450.000)'
  return props.validate ? props.validate(v) : null
}

async function start() {
  draft.value = asText(props.value)
  error.value = null
  editing.value = true
  await nextTick()
  control.value?.focus()
  if (control.value instanceof HTMLInputElement) control.value.select()
}

function cancel() {
  editing.value = false
  error.value = null
}

async function commit() {
  if (!editing.value || saving.value) return
  const problem = validateDraft()
  if (problem) {
    error.value = problem
    return
  }
  const value = parsed()
  // Sin cambios no hay nada que guardar (ni una entrada vacía en el histórico).
  if (asText(value) === asText(props.value)) {
    cancel()
    return
  }
  saving.value = true
  error.value = null
  try {
    await props.save(value)
    editing.value = false
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || 'No se pudo guardar'
    await nextTick()
    control.value?.focus()
  } finally {
    saving.value = false
  }
}

/** Salir del campo guarda — salvo que haya un error a la vista: entonces se queda abierto para corregirlo o cancelarlo. */
function onBlur() {
  if (!editing.value || saving.value || error.value) return
  commit()
}
</script>
