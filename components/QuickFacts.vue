<template>
  <div v-if="facts.length" class="qf-grid">
    <div v-for="f in facts" :key="f.label" class="qf-tile">
      <span class="qf-icon" v-html="f.icon" />
      <div class="min-w-0">
        <p class="qf-value">{{ f.value }}</p>
        <p class="qf-label">{{ f.label }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  project: {
    propertyType?: string | null
    yearBuilt?: number | null
    status?: string | null
    handoverDate?: string | null
    hasElevator?: number
    hasGarage?: number
    hasTerrace?: number
    hasGarden?: number
    hasPool?: number
    petsAllowed?: number
    accessible?: number
    street?: string | null
  }
}>()

const { t } = useI18n()

const statusLabels = computed<Record<string, string>>(() => ({
  new: t('quickFacts.statusNew', 'Obra nueva'),
  under_construction: t('quickFacts.statusUnderConstruction', 'En construcción'),
  ready: t('quickFacts.statusReady', 'Listo para entrar'),
}))

const facts = computed(() => {
  const p = props.project
  const out: { label: string; value: string; icon: string }[] = []
  if (p.propertyType) out.push({ label: t('quickFacts.type', 'Tipo'), value: p.propertyType, icon: ic('home') })
  if (p.yearBuilt) out.push({ label: t('quickFacts.yearBuilt', 'Año de construcción'), value: String(p.yearBuilt), icon: ic('calendar') })
  if (p.status === 'under_construction' && p.handoverDate) out.push({ label: t('quickFacts.handoverDate', 'Entrega prevista'), value: p.handoverDate, icon: ic('key') })
  else if (p.status) out.push({ label: t('quickFacts.status', 'Estado'), value: statusLabels.value[p.status] || p.status, icon: ic('key') })
  if (p.street) out.push({ label: t('quickFacts.street', 'Calle'), value: p.street, icon: ic('pin') })
  if (p.hasElevator) out.push({ label: t('quickFacts.elevator', 'Ascensor'), value: t('quickFacts.yes', 'Sí'), icon: ic('elevator') })
  if (p.hasGarage) out.push({ label: t('quickFacts.garage', 'Garaje'), value: t('quickFacts.yes', 'Sí'), icon: ic('garage') })
  if (p.hasTerrace) out.push({ label: t('quickFacts.terrace', 'Terraza'), value: t('quickFacts.yes', 'Sí'), icon: ic('terrace') })
  if (p.hasGarden) out.push({ label: t('quickFacts.garden', 'Jardín'), value: t('quickFacts.yes', 'Sí'), icon: ic('garden') })
  if (p.hasPool) out.push({ label: t('quickFacts.pool', 'Piscina'), value: t('quickFacts.yes', 'Sí'), icon: ic('pool') })
  if (p.petsAllowed) out.push({ label: t('quickFacts.pets', 'Mascotas'), value: t('quickFacts.petsAllowed', 'Admitidas'), icon: ic('paw') })
  if (p.accessible) out.push({ label: t('quickFacts.accessible', 'Accesible'), value: t('quickFacts.yes', 'Sí'), icon: ic('accessible') })
  return out
})

function ic(k: string) {
  const p: Record<string, string> = {
    home: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 10.5L12 4l8 6.5M6 9v10a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1V9"/>',
    calendar: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 12.5L19 4M16 7l2 2M13 10l2 2"/>',
    pin: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-6.2-7-11.3A7 7 0 0119 9.7C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>',
    elevator: '<path stroke-linecap="round" stroke-linejoin="round" d="M5 3h14v18H5zM9 9l2.5-2.5L14 9M9 15l2.5 2.5L14 15"/>',
    garage: '<rect x="3" y="11" width="18" height="6.5" rx="2"/><circle cx="7.5" cy="17.5" r="1.4"/><circle cx="16.5" cy="17.5" r="1.4"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 11l1.8-4.5A2 2 0 018.7 5h6.6a2 2 0 011.9 1.5L19 11"/>',
    terrace: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 21V9M20 21V9M4 9h16M8 21v-8M12 21v-8M16 21v-8"/><circle cx="12" cy="4.5" r="2"/>',
    garden: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8m0 0c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6zm0 0c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
    pool: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 17c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M5 13V6a2 2 0 012-2h10a2 2 0 012 2v7"/>',
    paw: '<circle cx="7" cy="8" r="1.6"/><circle cx="12" cy="6.5" r="1.6"/><circle cx="17" cy="8" r="1.6"/><path stroke-linecap="round" d="M8 14c0-2 1.8-3 4-3s4 1 4 3-1.8 3.5-4 3.5-4-1.5-4-3.5z"/>',
    accessible: '<circle cx="12" cy="4.5" r="1.6"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l4 2m-4-2l-3 2M9 21a5 5 0 004.5-7"/>',
  }
  return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24">${p[k] || ''}</svg>`
}
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
  border-color: #d3ad6a;
  box-shadow: 0 2px 10px rgba(180, 140, 60, 0.08);
}
.qf-icon {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #f6ead0;
  color: #92650f;
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
  color: #78716c;
}
</style>
