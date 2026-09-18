<template>
  <div class="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur" data-testid="property-editor-header">
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div class="flex min-w-0 items-center gap-3">
        <NuxtLink
          :to="backTo"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white text-stone-500 transition hover:border-ink hover:text-ink"
          aria-label="Volver al listado"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
        </NuxtLink>
        <div class="min-w-0">
          <h1 class="truncate text-[19px] font-semibold tracking-tight text-ink" data-testid="property-editor-title">{{ title }}</h1>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-stone-500">
            <span class="inline-flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full" :class="statusDot" />
              {{ statusLabel }}
            </span>
            <span class="text-stone-300">·</span>
            <span :class="saveTone" data-testid="property-editor-save-state">{{ saveLabel }}</span>
          </p>
        </div>
      </div>

      <!-- Sin `min-w-0` (y con `shrink-0`) las acciones de obra nueva —
           «Generar contenido», «Dossier y creatividades», «Vista previa» — no
           cabían en 390px y empujaban el panel entero fuera de la pantalla:
           319px de desplazamiento horizontal en el móvil. Ahora se envuelven. -->
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <slot name="actions" />
        <button v-if="canEdit" type="button" class="pe-btn-dark" data-testid="property-editor-save" :disabled="saving" @click="emit('save')">
          {{ saving ? 'Guardando…' : saveCtaLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * La barra superior del editor: vuelta atrás, identidad de la propiedad,
 * estado real y las acciones.
 *
 * El texto de guardado lo calcula el editor y llega hecho. Importa porque
 * este producto **no tiene autoguardado**: decir "guardado automáticamente"
 * aquí sería cómodo y falso, y alguien cerraría la pestaña confiando en ello.
 */
const props = defineProps<{
  title: string
  backTo: string
  statusLabel: string
  /** 'draft' | 'published' | 'neutral' — decide el color del punto. */
  statusTone: 'draft' | 'published' | 'neutral'
  saveLabel: string
  saveState: 'idle' | 'saving' | 'saved' | 'dirty' | 'error'
  saving: boolean
  saveCtaLabel: string
  /** Sin permiso de escritura no se enseña el botón de guardar: la API lo rechazaría. */
  canEdit: boolean
}>()

const emit = defineEmits<{ save: [] }>()

const statusDot = computed(() =>
  props.statusTone === 'published' ? 'bg-emerald-500' : props.statusTone === 'draft' ? 'bg-amber-400' : 'bg-stone-300',
)
const saveTone = computed(() =>
  props.saveState === 'error' ? 'text-red-500' : props.saveState === 'dirty' ? 'text-amber-600' : 'text-stone-400',
)
</script>
