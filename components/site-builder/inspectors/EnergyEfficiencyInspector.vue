<template>
  <div data-testid="energy-block-inspector">
    <EnergyOptionsFields :value="content" @set="(k, v) => (content[k] = v)" />
  </div>
</template>

<script setup lang="ts">
import EnergyOptionsFields from '../inspector/EnergyOptionsFields.vue'

/**
 * Inspector del bloque «Eficiencia energética»: sólo cómo se enseña la
 * etiqueta. Los valores son los de cada propiedad (Property Core); «Avanzado»
 * (visibilidad por dispositivo, ancla, espaciado) lo añade el shell.
 */
defineProps<{ content: Record<string, any> }>()
</script>
