<template>
  <figure class="lp-browser" :data-shot="shotKey">
    <div class="lp-browser-bar"><i /><i /><i /><span>{{ address }}</span></div>
    <img
      v-if="!missing"
      :src="shot.src"
      :alt="shot.alt"
      :width="shot.width"
      :height="shot.height"
      class="lp-shot"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : undefined"
      decoding="async"
      @error="missing = true"
    >
    <div v-else class="lp-shot-missing" role="img" :aria-label="shot.alt" data-testid="landing-shot-missing">
      Captura pendiente: {{ shot.alt }}
    </div>
    <figcaption v-if="caption" class="lp-shot-caption">{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { LANDING_SHOTS, type LandingShotKey } from '~/utils/landing'

/**
 * Una captura real del producto en un marco de navegador. Si el archivo no
 * existe todavía (scripts/capturas-landing.mjs las genera desde la cuenta de
 * demostración), se enseña el hueco con lo que debería ir: nunca una pantalla
 * inventada.
 */
const props = withDefaults(defineProps<{ shotKey: LandingShotKey; address?: string; caption?: string; eager?: boolean }>(), { address: 'app.inmo', caption: '', eager: false })
const shot = computed(() => LANDING_SHOTS[props.shotKey])
const missing = ref(false)
</script>

<style scoped>
.lp-shot-caption {
  padding: 10px 14px;
  border-top: 1px solid var(--lp-line);
  font-size: 12px;
  color: var(--lp-muted);
}
</style>
