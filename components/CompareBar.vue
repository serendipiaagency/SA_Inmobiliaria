<template>
  <transition name="bar">
    <div v-if="items.length" class="no-print fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div class="flex w-full max-w-3xl items-center gap-4 rounded-2xl bg-ink px-4 py-3 text-white shadow-2xl">
        <div class="flex -space-x-3">
          <img
            v-for="i in items"
            :key="i.id"
            :src="mediaUrl(i.cover)"
            class="h-11 w-11 rounded-lg border-2 border-ink object-cover"
            :alt="i.name"
          />
        </div>
        <p class="hidden text-sm text-white/80 sm:block">
          {{ items.length }} {{ t('compareBar.of', 'de') }} {{ MAX }} {{ t('compareBar.selectedForCompare', 'seleccionadas para comparar') }}
        </p>
        <div class="ml-auto flex items-center gap-2">
          <button class="text-[11px] uppercase tracking-widest text-white/60 hover:text-white" @click="clear">{{ t('compareBar.clear', 'Limpiar') }}</button>
          <NuxtLink to="/compare" class="rounded-full bg-white px-5 py-2.5 text-[12px] font-semibold uppercase tracking-widest text-ink transition hover:bg-white/90">
            {{ t('compareBar.compare', 'Comparar') }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { items, clear, MAX } = useCompare()
const { register } = useBottomBar()
watchEffect(() => register('compare', items.value.length > 0))
onBeforeUnmount(() => register('compare', false))
</script>

<style scoped>
.bar-enter-active,
.bar-leave-active {
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s;
}
.bar-enter-from,
.bar-leave-to {
  transform: translateY(120%);
  opacity: 0;
}
</style>
