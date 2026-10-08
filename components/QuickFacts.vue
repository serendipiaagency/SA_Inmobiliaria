<template>
  <div v-if="facts.length" class="qf-grid" data-testid="quick-facts">
    <div v-for="f in facts" :key="f.key" class="qf-tile" :data-fact="f.key">
      <!-- SVG fijo de utils/featureIcons.ts, nunca datos de la propiedad -->
      <span class="qf-icon" :style="{ color: f.tone.fg, backgroundColor: f.tone.bg }" v-html="f.icon" />
      <div class="min-w-0">
        <p class="qf-value">{{ f.value }}</p>
        <p class="qf-label">{{ f.label }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildQuickFacts, type QuickFactsProject } from '~/utils/quickFacts'
import { featureIconSvg } from '~/utils/featureIcons'
import { iconPalette, toneFor } from '~/utils/featurePalette'

const props = defineProps<{ project: QuickFactsProject; details?: Record<string, unknown> | null }>()

const { t } = useI18n()
const typeLabel = usePropertyTypeLabel()
const { tenant } = useTenant()

// Los colores salen del color de marca de la inmobiliaria (utils/featurePalette.ts).
const palette = computed(() => iconPalette(tenant.value?.brandColor))

const facts = computed(() =>
  buildQuickFacts(props.project, props.details, t, typeLabel).map((f) => ({ ...f, icon: featureIconSvg(f.key), tone: toneFor(f.key, palette.value) })),
)
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
</style>
