<template>
  <Teleport to="body">
    <transition name="qv-fade">
      <div v-if="open" class="qv-backdrop" @click.self="$emit('close')">
        <transition name="qv-pop" appear>
          <div v-if="open" class="qv-box">
            <button type="button" class="qv-close" :aria-label="t('quickView.close', 'Cerrar')" @click="$emit('close')">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>

            <div class="qv-media">
              <img :src="mediaUrl(project.coverImage)" :alt="project.name" class="h-full w-full object-cover" />
              <div class="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
                <span v-for="b in badges" :key="b.text" class="qv-badge" :class="b.cls">{{ b.text }}</span>
              </div>
            </div>

            <div class="qv-body">
              <p class="flex items-baseline gap-2">
                <span class="text-xl font-semibold tracking-tight">{{ formatPrice(project.price) }}</span>
                <span v-if="project.rentalYield" class="text-xs font-semibold text-emerald-600">{{ project.rentalYield }}% {{ t('quickView.rentalYieldSuffix', 'rent.') }}</span>
              </p>
              <h3 class="mt-1 font-serif text-2xl font-medium">{{ project.name }}</h3>
              <p class="mt-0.5 text-[13px] text-stone-500">{{ project.community }}<span v-if="project.developerName"> · {{ project.developerName }}</span></p>

              <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-stone-500">
                <span v-if="project.bedrooms != null">{{ project.bedrooms || t('card.studio') }}<span v-if="project.bedrooms">{{ ' ' + t('card.beds') }}</span></span>
                <span v-if="project.bathrooms != null">{{ project.bathrooms }} {{ t('card.baths') }}</span>
                <span v-if="project.area">{{ Math.round(project.area) }} m²</span>
              </div>

              <p v-if="project.aiSummary" class="mt-4 line-clamp-3 text-[13px] leading-relaxed text-stone-500">{{ project.aiSummary }}</p>

              <div class="mt-6 flex gap-2.5">
                <NuxtLink :to="to" class="btn-primary flex-1 justify-center !py-3">{{ t('card.viewDetails') }}</NuxtLink>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{ open: boolean; project: any }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { format: formatPrice } = useCurrency()
const to = computed(() => `/property-details/${props.project.slug || props.project.id}`)

const priceDrop = computed(() => {
  const o = props.project.priceOld
  const p = props.project.price
  if (o && p && o > p) return Math.round(((o - p) / o) * 100)
  return 0
})
const badges = computed(() => {
  const out: { text: string; cls: string }[] = []
  if (props.project.isReserved) out.push({ text: t('badge.reserved'), cls: 'qv-badge-dark' })
  if (props.project.status === 'new') out.push({ text: t('badge.new'), cls: 'qv-badge-light' })
  if (priceDrop.value) out.push({ text: `${t('badge.priceDrop')} ${priceDrop.value}%`, cls: 'qv-badge-green' })
  if (props.project.isExclusive) out.push({ text: t('badge.exclusive'), cls: 'qv-badge-gold' })
  return out.slice(0, 3)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.qv-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9997;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 15, 13, 0.55);
  backdrop-filter: blur(4px);
  padding: 20px;
}
.qv-box {
  position: relative;
  width: min(760px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 20px;
  display: grid;
  box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.5);
}
@media (min-width: 640px) {
  .qv-box {
    grid-template-columns: 1.1fr 1fr;
    max-height: 560px;
  }
}
.qv-media {
  position: relative;
  aspect-ratio: 4/3;
  background: #f1efe9;
}
@media (min-width: 640px) {
  .qv-media {
    aspect-ratio: auto;
    height: 100%;
  }
}
.qv-media img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
@media (min-width: 640px) {
  .qv-media img {
    border-radius: 20px 0 0 20px;
  }
}
.qv-body {
  padding: 28px;
}
.qv-close {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 10;
  display: flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.9);
  color: #16150f;
  transition: transform 0.15s, background-color 0.2s;
}
.qv-close:hover {
  background: #fff;
  transform: scale(1.08);
}
.qv-badge {
  border-radius: 9999px;
  padding: 0.3rem 0.7rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  backdrop-filter: blur(4px);
}
.qv-badge-dark {
  background: rgba(22, 21, 15, 0.92);
  color: #fff;
}
.qv-badge-light {
  background: rgba(255, 255, 255, 0.95);
  color: #16150f;
}
.qv-badge-green {
  background: #059669;
  color: #fff;
}
.qv-badge-gold {
  background: #b08b4f;
  color: #fff;
}

.qv-fade-enter-active,
.qv-fade-leave-active {
  transition: opacity 0.22s var(--ease-out);
}
.qv-fade-enter-from,
.qv-fade-leave-to {
  opacity: 0;
}
.qv-pop-enter-active {
  transition: transform 0.3s var(--ease-spring), opacity 0.22s var(--ease-out);
}
.qv-pop-leave-active {
  transition: transform 0.18s var(--ease-out), opacity 0.18s var(--ease-out);
}
.qv-pop-enter-from,
.qv-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
</style>
