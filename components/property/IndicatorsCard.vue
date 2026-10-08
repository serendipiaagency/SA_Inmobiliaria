<template>
  <section v-if="rows.length" class="pcard" data-testid="ficha-indicators">
    <span class="eyebrow !normal-case !tracking-normal !text-[12.5px]">{{ t('decisionPanel.indicators.eyebrow', 'Indicadores') }}</span>
    <ul class="mt-3 divide-y divide-[#f1eee8]">
      <li v-for="r in rows" :key="r.key" class="flex items-center gap-3 py-3 text-[13px] text-stone-600" :data-indicator="r.key">
        <!-- SVG fijo de este componente, nunca datos -->
        <span class="shrink-0 text-stone-400" aria-hidden="true" v-html="r.icon" />
        <span><strong class="font-semibold text-ink">{{ r.count }}</strong> {{ r.text }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * INDICADORES de la ficha (#111): sólo actividad real registrada de esta
 * propiedad (/engagement: visitas a la ficha de los últimos 7 días, citas de
 * visita reservadas y personas que la guardaron). Lo que está a cero no sale
 * y, sin nada, la tarjeta tampoco. Sin «responde en menos de X min»: no hay
 * una métrica pública verificable del tiempo de respuesta.
 */
const props = defineProps<{ slug: string }>()
const { t } = useI18n()

const state = usePropertyInsight<{ viewsThisWeek: number; favoriteCount: number; visitsBooked: number }>(props.slug, 'engagement')

const ICONS = {
  views: '<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  visits: '<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path stroke-linecap="round" d="M16 2.5v4M8 2.5v4M3 9.5h18"/></svg>',
  saved: '<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z"/></svg>',
}

const rows = computed(() => {
  const e = state.value.data
  if (!e) return []
  const out: { key: string; icon: string; count: number; text: string }[] = []
  if (e.viewsThisWeek > 0) out.push({ key: 'views', icon: ICONS.views, count: e.viewsThisWeek, text: e.viewsThisWeek === 1 ? t('ficha.viewsWeekOne', 'visita esta semana') : t('ficha.viewsWeek', 'visitas esta semana') })
  if (e.visitsBooked > 0) out.push({ key: 'visits', icon: ICONS.visits, count: e.visitsBooked, text: e.visitsBooked === 1 ? t('decisionPanel.indicators.visitSingular', 'visita reservada') : t('decisionPanel.indicators.visitPlural', 'visitas reservadas') })
  if (e.favoriteCount > 0) out.push({ key: 'saved', icon: ICONS.saved, count: e.favoriteCount, text: e.favoriteCount === 1 ? t('decisionPanel.indicators.savedSingular', 'persona la tiene guardada') : t('decisionPanel.indicators.savedPlural', 'personas la tienen guardada') })
  return out
})
</script>
