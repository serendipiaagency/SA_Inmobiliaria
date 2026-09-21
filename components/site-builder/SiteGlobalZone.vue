<template>
  <div v-bind="zoneAttrs">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * Cabecera y pie dentro del lienzo, como **zonas globales**: se ven (para
 * que el lienzo se parezca a la web publicada, con la cabecera sobre el
 * hero y el pie al final) y se pueden seleccionar, pero no se editan aquí,
 * porque son de todo el sitio y no de la página de Inicio. En `builder` el
 * clic se intercepta igual que en los bloques y se le dice al shell qué
 * parte se ha pulsado (logo, menú, contacto) para que el inspector explique
 * de dónde sale y dónde se cambia. En `preview` y en producción no hace
 * nada: los enlaces navegan.
 */
const props = defineProps<{
  zone: 'header' | 'footer'
  mode: 'builder' | 'preview'
  selected: boolean
}>()
const emit = defineEmits<{ select: [zone: 'header' | 'footer', element: string | null] }>()

function elementUnder(target: HTMLElement | null): string | null {
  if (!target?.closest) return null
  const link = target.closest('a')
  const href = link?.getAttribute('href') || ''
  if (link && (href === '/' || href.endsWith('/'))) return 'logo'
  if (target.closest('nav')) return 'menu'
  if (href.includes('/contacto') || href.includes('/privacidad') || href.includes('/terminos')) return 'contact'
  return null
}

const zoneAttrs = computed(() => {
  if (props.mode !== 'builder') return {}
  return {
    'data-sb-zone': props.zone,
    class: props.selected ? 'sb-zone-selected' : '',
    onClickCapture: (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      emit('select', props.zone, elementUnder(e.target as HTMLElement | null))
    },
  }
})
</script>

<style>
/* Sólo existe en el lienzo del Constructor. Contorno sobre el propio
   <header>/<footer> (el envoltorio de una cabecera fija mide 0 px). */
[data-sb-zone] > * {
  cursor: default;
}
[data-sb-zone]:hover > * {
  outline: 2px dashed rgba(124, 58, 237, 0.55);
  outline-offset: -2px;
}
[data-sb-zone].sb-zone-selected > * {
  outline: 2px solid #7c3aed;
  outline-offset: -2px;
}
</style>
