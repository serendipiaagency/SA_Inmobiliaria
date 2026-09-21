<template>
  <section v-reveal class="border-y border-line bg-paper">
    <div class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <div :class="layout === 'split' ? 'flex flex-wrap items-center justify-between gap-8' : 'mx-auto max-w-xl text-center'">
        <div :class="layout === 'split' ? 'max-w-xl' : ''">
          <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
          <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
          <SbText v-if="content.description" tag="p" field="description" label="Descripción" multiline class="mt-4 text-[15px] text-stone-500" :text="content.description" />

          <div v-if="agent" class="mt-6 flex items-center gap-3" :class="layout === 'split' ? '' : 'justify-center'">
            <SbImage field="agent.image" label="Foto del comercial" :dynamic="dynamicLabel('team', 'Foto')" :source-href="SOURCES.team.href" :src="mediaUrl(agent.image)" :alt="agent.name" class="h-11 w-11 rounded-full object-cover ring-1 ring-line" loading="lazy" />
            <div class="text-left">
              <SbText tag="p" field="agent.name" label="Nombre del comercial" :dynamic="dynamicLabel('team', 'Nombre')" :source-href="SOURCES.team.href" class="text-[14px] font-medium text-ink" :text="agent.name" />
              <SbText tag="p" field="agent.position" kind="caption" label="Puesto" :dynamic="dynamicLabel('team', 'Puesto')" :source-href="SOURCES.team.href" class="text-[12px] text-stone-500" :text="agent.position || ''" />
            </div>
          </div>
        </div>

        <div class="shrink-0" :class="layout === 'split' ? '' : 'mt-8'">
          <!-- En el lienzo no se usa `disabled` (un botón deshabilitado no
               recibe clics y no se podría seleccionar): la intercepción del
               clic y el `if (locked) return` de open() ya protegen. En Vista
               previa y en producción sí. -->
          <SbButton
            type="button"
            class="btn-primary"
            :class="mode === 'builder' && (!agent || locked) ? 'opacity-40' : ''"
            :disabled="mode === 'builder' ? undefined : !agent || locked"
            :aria-disabled="!agent || locked ? 'true' : undefined"
            field="ctaLabel"
            label="Botón de reserva"
            :text="content.ctaLabel || 'Reservar una visita'"
            @click="open"
          />

          <p v-if="!agent" class="mt-3 max-w-xs text-[12px] text-stone-500">
            Para reservar visitas hace falta al menos un comercial publicado con horario configurado.
          </p>
          <p v-else-if="locked" class="mt-3 max-w-xs text-[11px] text-stone-400">
            Desactivado mientras editas. En la web publicada abre la agenda real de {{ agent.name }}.
          </p>
        </div>
      </div>

      <!-- Sólo en el editor: la referencia elegida a mano ya no existe o se
           ha despublicado. La web pública no se rompe —cae en el primero
           disponible— pero quien edita tiene que enterarse. -->
      <p v-if="locked && brokenReference" class="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
        El comercial elegido para este bloque ya no está publicado. Mientras tanto se usa
        <strong>{{ agent?.name }}</strong>; elige otro en el panel de la derecha.
      </p>
    </div>

    <BookAppointmentModal
      v-if="agent && showBooking"
      :open="showBooking"
      :agent-slug="agent.slug"
      :agent-name="agent.name"
      :channel="channel"
      @close="showBooking = false"
    />
  </section>
</template>

<script setup lang="ts">
import BookAppointmentModal from '~/components/BookAppointmentModal.vue'
import SbText from '../nodes/SbText.vue'
import SbImage from '../nodes/SbImage.vue'
import SbButton from '../nodes/SbButton.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

/**
 * Reserva de visita.
 *
 * No implementa agenda propia: abre `BookAppointmentModal`, el mismo que ya
 * usa la ficha pública del comercial, que consulta los huecos reales en
 * `/api/public/agents/[slug]/availability` y reserva en `book.post.ts`. Todo
 * lo que decide la disponibilidad —horario semanal, margen entre citas, tope
 * diario, días bloqueados— vive en la ficha del comercial y aquí no se
 * duplica ni se puede contradecir.
 *
 * El bloque guarda a quién enlaza (`agentId`), no una copia de esa persona.
 */
const props = withDefaults(
  defineProps<{
    content: Record<string, any>
    team: any[]
    /** Igual que en LeadFormBlock: este bloque tiene efecto real y necesita saber dónde se está pintando. */
    mode?: 'production' | 'builder' | 'preview'
  }>(),
  { mode: 'production' },
)

const layout = computed(() => (props.content.layout === 'centered' ? 'centered' : 'split'))
const channel = computed<'in_person' | 'video' | 'phone'>(() =>
  props.content.channel === 'video' ? 'video' : props.content.channel === 'phone' ? 'phone' : 'in_person',
)

const published = computed<any[]>(() => props.team || [])

const chosen = computed(() => {
  const id = Number(props.content.agentId)
  if (!id) return null
  return published.value.find((m) => m.id === id) || null
})

/**
 * Se eligió un comercial concreto y ya no está entre los publicados —
 * despublicado o borrado. Es el riesgo RE07 de la auditoría, aquí resuelto a
 * la vista en vez de en silencio: la web pública sigue funcionando con el
 * primer comercial disponible, y el editor ve un aviso.
 */
const brokenReference = computed(() => !!Number(props.content.agentId) && !chosen.value)

const agent = computed(() => chosen.value || published.value[0] || null)

/**
 * Reservar desde el lienzo o desde Vista previa crearía una cita real en la
 * agenda del comercial y enviaría su confirmación. Mismo criterio que
 * LeadFormBlock.
 */
const locked = computed(() => props.mode !== 'production')

const showBooking = ref(false)
function open() {
  if (locked.value) return
  showBooking.value = true
}
</script>
