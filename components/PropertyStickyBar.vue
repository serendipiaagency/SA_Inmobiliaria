<template>
  <Transition name="stickybar">
    <div
      v-if="visible"
      class="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-5 py-3">
        <div class="min-w-0">
          <p class="text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ t('propertyStickyBar.from', 'Desde') }}</p>
          <p class="heading-serif truncate text-xl leading-tight">{{ price }}</p>
        </div>
        <a href="#contacto" class="btn-primary shrink-0">{{ t('propertyStickyBar.contact', 'Contactar') }}</a>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const props = defineProps<{ price: string; visible: boolean }>()
const { t } = useI18n()
const { register } = useBottomBar()
watchEffect(() => register('property-sticky', props.visible))
onBeforeUnmount(() => register('property-sticky', false))
</script>

<style scoped>
.stickybar-enter-active,
.stickybar-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.stickybar-enter-from,
.stickybar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
