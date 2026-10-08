<template>
  <div v-if="facts.length" :class="variant === 'features' ? 'qf-features' : 'qf-grid'" data-testid="quick-facts">
    <template v-if="variant === 'features'">
      <!-- «Características destacadas» (#111): mini tarjeta con el icono en un círculo. El color de cada
      icono sigue la paleta de la marca de #107 (no todos iguales), aunque la referencia los pinte en un solo tono. -->
      <div v-for="f in facts" :key="f.key" class="qf-feature" :data-fact="f.key">
        <!-- SVG fijo de utils/featureIcons.ts, nunca datos de la propiedad -->
        <span class="qf-icon qf-feature-icon" :style="{ color: f.tone.fg, backgroundColor: f.tone.bg }" v-html="f.iconSmall" />
        <span class="min-w-0">
          <span class="qf-feature-name">{{ f.title }}</span>
          <span v-if="f.sub" class="qf-feature-sub">{{ f.sub }}</span>
        </span>
      </div>
    </template>
    <template v-else>
      <div v-for="f in facts" :key="f.key" class="qf-tile" :data-fact="f.key">
        <!-- SVG fijo de utils/featureIcons.ts, nunca datos de la propiedad -->
        <span class="qf-icon" :style="{ color: f.tone.fg, backgroundColor: f.tone.bg }" v-html="f.icon" />
        <div class="min-w-0">
          <p class="qf-value">{{ f.value }}</p>
          <p class="qf-label">{{ f.label }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { buildQuickFacts, type QuickFactsProject } from '~/utils/quickFacts'
import { featureIconSvg } from '~/utils/featureIcons'
import { iconPalette, toneFor } from '~/utils/featurePalette'

const props = withDefaults(
  defineProps<{
    project: QuickFactsProject
    details?: Record<string, unknown> | null
    /** `features`: las mini tarjetas de «Características destacadas» de la ficha (#111). */
    variant?: 'tiles' | 'features'
    /** Datos que ya se enseñan en otro sitio (p. ej. tipo y año en la fila de cifras). */
    exclude?: string[]
  }>(),
  { details: null, variant: 'tiles', exclude: () => [] },
)

const { t } = useI18n()
const typeLabel = usePropertyTypeLabel()
const { tenant } = useTenant()

// Los colores salen del color de marca de la inmobiliaria (utils/featurePalette.ts).
const palette = computed(() => iconPalette(tenant.value?.brandColor))

// En la mini tarjeta, el nombre y, si no es un simple «Sí», su valor debajo;
// el estado y la conservación se leen mejor por su valor («Obra nueva»).
const VALUE_FIRST = new Set(['status', 'condition'])
const facts = computed(() => {
  const yes = t('quickFacts.yes', 'Sí')
  return buildQuickFacts(props.project, props.details, t, typeLabel)
    .filter((f) => !props.exclude.includes(f.key))
    .map((f) => ({
      ...f,
      icon: featureIconSvg(f.key),
      iconSmall: featureIconSvg(f.key, 16),
      tone: toneFor(f.key, palette.value),
      title: VALUE_FIRST.has(f.key) ? f.value : f.label,
      sub: VALUE_FIRST.has(f.key) || f.value === yes ? '' : f.value,
    }))
})
</script>

<style scoped>
.qf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
@media (min-width: 640px) {
  .qf-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.qf-tile {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  border-radius: 1rem;
  border: 1px solid #e7e4de;
  background: #fff;
  padding: 1.1rem 1.15rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.qf-tile:hover {
  border-color: #d6d2ca;
  box-shadow: 0 2px 10px rgba(22, 21, 15, 0.05);
}
.qf-icon {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
}
.qf-value {
  font-size: 13px;
  font-weight: 600;
  color: #16150f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qf-label {
  margin-top: 1px;
  font-size: 11px;
  color: #6b6560;
}

.qf-features {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (min-width: 640px) {
  .qf-features {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1280px) {
  .qf-features {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
.qf-feature {
  display: flex;
  min-height: 60px;
  align-items: center;
  gap: 10px;
  border: 1px solid #efebe5;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
}
.qf-icon.qf-feature-icon {
  display: flex;
  height: 32px;
  width: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
}
.qf-feature-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  color: #1c1b19;
  overflow-wrap: break-word;
  hyphens: auto;
}
.qf-feature-sub {
  display: block;
  margin-top: 1px;
  font-size: 11.5px;
  line-height: 1.3;
  color: #77736c;
  overflow-wrap: break-word;
  hyphens: auto;
}
</style>
